const express = require('express');
const router = express.Router();
const db = require('../database');
const { registrarAuditoria } = require('../services/auditoria');

const IHSS_MONTO_FIJO = 600;
const RAP_MONTO_FIJO = 125;
const MINIMO_EQUIPO_DISPONIBLE = 2;

const redondear2 = (valor) => Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;

const normalizarTipoAusencia = (tipo) => {
  const tipoNormalizado = String(tipo || '').toLowerCase();
  if (tipoNormalizado === 'vacaciones') return 'vacaciones';
  if (tipoNormalizado === 'permiso') return 'permiso';
  if (tipoNormalizado === 'baja_medica' || tipoNormalizado === 'baja médica' || tipoNormalizado === 'baja-medica') {
    return 'baja_medica';
  }
  return 'permiso';
};

const normalizarEstadoAusencia = (estado) => {
  const estadoNormalizado = String(estado || '').toLowerCase();
  if (estadoNormalizado === 'aprobada') return 'aprobada';
  if (estadoNormalizado === 'rechazada') return 'rechazada';
  return 'pendiente';
};

const asegurarEsquemaAusencias = async () => {
  try {
    await db.run("ALTER TABLE ausencias ADD COLUMN tipo TEXT DEFAULT 'permiso'");
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.run("ALTER TABLE ausencias ADD COLUMN estado TEXT DEFAULT 'pendiente'");
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) {
      throw error;
    }
  }
};

const fechaAKey = (fecha) => {
  const d = new Date(fecha);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const iterarRangoFechas = (inicio, fin) => {
  const fechas = [];
  const cursor = new Date(inicio);
  const finDate = new Date(fin);
  cursor.setHours(0, 0, 0, 0);
  finDate.setHours(0, 0, 0, 0);

  while (cursor <= finDate) {
    fechas.push(fechaAKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return fechas;
};

const validarDisponibilidadMinima = async ({ idAusenciaExcluir = null, idEmpleadoSolicitante, fechaInicio, fechaFin }) => {
  const totalEmpleadosRow = await db.get('SELECT COUNT(*) as total FROM empleados_rrhh');
  const totalEmpleados = Number(totalEmpleadosRow?.total || 0);

  const fechasRango = iterarRangoFechas(fechaInicio, fechaFin);

  for (const day of fechasRango) {
    const ausentesAprobados = await db.all(
      `SELECT DISTINCT id_empleado
       FROM ausencias
       WHERE estado = 'aprobada'
         AND fecha_inicio <= ?
         AND fecha_fin >= ?
         ${idAusenciaExcluir ? 'AND id_ausencia != ?' : ''}`,
      idAusenciaExcluir ? [day, day, idAusenciaExcluir] : [day, day]
    );

    const ausentesSet = new Set(ausentesAprobados.map(a => Number(a.id_empleado)));
    ausentesSet.add(Number(idEmpleadoSolicitante));

    const disponibles = totalEmpleados - ausentesSet.size;
    if (disponibles < MINIMO_EQUIPO_DISPONIBLE) {
      return {
        ok: false,
        fecha: day,
        disponibles,
        minimo_requerido: MINIMO_EQUIPO_DISPONIBLE,
        total_empleados: totalEmpleados
      };
    }
  }

  return { ok: true };
};

const calcularDeduccionesNomina = (salarioBruto) => {
  const bruto = Number(salarioBruto || 0);
  const deduccionIHSS = bruto > 0 ? IHSS_MONTO_FIJO : 0;
  const deduccionRAP = bruto > 0 ? RAP_MONTO_FIJO : 0;
  const totalDeducciones = redondear2(deduccionIHSS + deduccionRAP);
  const salarioNeto = redondear2(bruto - totalDeducciones);

  return {
    salario_bruto: bruto,
    deduccion_ihss: deduccionIHSS,
    deduccion_rap: deduccionRAP,
    total_deducciones: totalDeducciones,
    salario_neto: salarioNeto
  };
};

let ensureEmpleadoUsuarioSchemaPromise = null;

const normalizarTexto = (valor) => String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const asignarRolPorPuesto = (puesto) => {
  const puestoNormalizado = normalizarTexto(puesto);

  if (puestoNormalizado.includes('gerente')) {
    return 'admin';
  }

  if (
    puestoNormalizado.includes('desarrollador') ||
    puestoNormalizado.includes('inge en sistemas') ||
    puestoNormalizado.includes('ing en sistemas') ||
    puestoNormalizado.includes('ingeniero en sistemas')
  ) {
    return 'tecnico';
  }

  if (puestoNormalizado.includes('asistente administrativo')) {
    return 'usuario';
  }

  return 'usuario';
};

const generarEmailEmpleado = ({ nombre, apellido, idEmpleado }) => {
  const limpiar = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  const baseNombre = limpiar(nombre) || 'empleado';
  const baseApellido = limpiar(apellido) || 'rrhh';
  return `${baseNombre}.${baseApellido}.${idEmpleado}@erp.local`;
};

const asegurarEsquemaEmpleadoUsuario = async () => {
  if (!ensureEmpleadoUsuarioSchemaPromise) {
    ensureEmpleadoUsuarioSchemaPromise = (async () => {
      try {
        await db.run('ALTER TABLE empleados_rrhh ADD COLUMN id_usuario INTEGER');
      } catch (error) {
        if (!String(error.message || '').includes('duplicate column name')) {
          throw error;
        }
      }
    })();
  }

  return ensureEmpleadoUsuarioSchemaPromise;
};

const crearUsuarioParaEmpleado = async ({ idEmpleado, nombre, apellido, puesto }) => {
  const rol = asignarRolPorPuesto(puesto);
  const email = generarEmailEmpleado({ nombre, apellido, idEmpleado });
  const nombreCompleto = `${String(nombre || '').trim()} ${String(apellido || '').trim()}`.trim();

  const resultUsuario = await db.run(
    'INSERT INTO usuarios (nombre, email, password, rol, estado, id_area) VALUES (?, ?, ?, ?, ?, ?)',
    [nombreCompleto, email, 'empleado123', rol, 'activo', null]
  );

  await db.run('UPDATE empleados_rrhh SET id_usuario = ? WHERE id_empleado = ?', [resultUsuario.id, idEmpleado]);

  return { id_usuario: resultUsuario.id, rol, email };
};

const asegurarUsuarioEmpleado = async (empleado) => {
  if (!empleado) return null;

  if (empleado.id_usuario) {
    const usuario = await db.get('SELECT id_usuario FROM usuarios WHERE id_usuario = ?', [empleado.id_usuario]);
    if (usuario) {
      const rol = asignarRolPorPuesto(empleado.puesto);
      const nombreCompleto = `${String(empleado.nombre || '').trim()} ${String(empleado.apellido || '').trim()}`.trim();
      await db.run('UPDATE usuarios SET nombre = ?, rol = ? WHERE id_usuario = ?', [nombreCompleto, rol, empleado.id_usuario]);
      return { id_usuario: empleado.id_usuario, creado: false, rol };
    }
  }

  const creado = await crearUsuarioParaEmpleado({
    idEmpleado: empleado.id_empleado,
    nombre: empleado.nombre,
    apellido: empleado.apellido,
    puesto: empleado.puesto
  });

  return { ...creado, creado: true };
};

const sincronizarEmpleadosComoUsuarios = async () => {
  await asegurarEsquemaEmpleadoUsuario();

  const empleados = await db.all('SELECT id_empleado, nombre, apellido, puesto, id_usuario FROM empleados_rrhh');
  let creados = 0;
  let actualizados = 0;

  for (const empleado of empleados) {
    const resultado = await asegurarUsuarioEmpleado(empleado);
    if (resultado?.creado) {
      creados += 1;
    } else {
      actualizados += 1;
    }
  }

  return {
    total_empleados: empleados.length,
    usuarios_creados: creados,
    usuarios_actualizados: actualizados
  };
};

// ===================== EMPLEADOS =====================

// GET todos los empleados
router.get('/empleados', async (req, res) => {
  try {
    await sincronizarEmpleadosComoUsuarios();
    const empleados = await db.all('SELECT * FROM empleados_rrhh');
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST sincronizar empleados -> usuarios
router.post('/empleados/sincronizar-usuarios', async (req, res) => {
  try {
    const resumen = await sincronizarEmpleadosComoUsuarios();
    res.json({
      mensaje: 'Sincronización completada',
      ...resumen
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear empleado
router.post('/empleados', async (req, res) => {
  try {
    const { nombre, apellido, puesto, salario, fecha_ingreso } = req.body;
    await asegurarEsquemaEmpleadoUsuario();
    
    // Crear empleado
    const result = await db.run(
      'INSERT INTO empleados_rrhh (nombre, apellido, puesto, salario, fecha_ingreso) VALUES (?, ?, ?, ?, ?)',
      [nombre, apellido, puesto, salario, fecha_ingreso]
    );
    
    // Crear automáticamente registro de nómina para el mes y año actual
    const currentDate = new Date();
    const mes = currentDate.getMonth() + 1; // Mes actual (1-12)
    const anio = currentDate.getFullYear(); // Año actual
    
    await db.run(
      'INSERT INTO planilla (id_empleado, mes, anio, total_pago) VALUES (?, ?, ?, ?)',
      [result.id, mes, anio, salario]
    );

    const usuarioCreado = await crearUsuarioParaEmpleado({
      idEmpleado: result.id,
      nombre,
      apellido,
      puesto
    });
    
    res.status(201).json({ 
      id: result.id, 
      id_usuario: usuarioCreado.id_usuario,
      rol_usuario: usuarioCreado.rol,
      mensaje: 'Empleado creado, usuario generado y nómina registrada automáticamente',
      detalles: {
        id_empleado: result.id,
        empleado: `${nombre} ${apellido}`,
        mes: mes,
        anio: anio,
        salario: salario,
        email_usuario: usuarioCreado.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar empleado
router.put('/empleados/:id', async (req, res) => {
  try {
    const { nombre, apellido, puesto, salario, fecha_ingreso } = req.body;
    await asegurarEsquemaEmpleadoUsuario();

    const empleadoAntes = await db.get(
      'SELECT id_empleado, salario FROM empleados_rrhh WHERE id_empleado = ?',
      [req.params.id]
    );

    if (!empleadoAntes) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    await db.run(
      'UPDATE empleados_rrhh SET nombre=?, apellido=?, puesto=?, salario=?, fecha_ingreso=? WHERE id_empleado=?',
      [nombre, apellido, puesto, salario, fecha_ingreso, req.params.id]
    );

    const empleado = await db.get(
      'SELECT id_empleado, nombre, apellido, puesto, id_usuario FROM empleados_rrhh WHERE id_empleado = ?',
      [req.params.id]
    );

    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const sync = await asegurarUsuarioEmpleado(empleado);
    const rol = asignarRolPorPuesto(empleado.puesto);
    const nombreCompleto = `${String(empleado.nombre || '').trim()} ${String(empleado.apellido || '').trim()}`.trim();

    await db.run(
      'UPDATE usuarios SET nombre = ?, rol = ? WHERE id_usuario = ?',
      [nombreCompleto, rol, sync.id_usuario]
    );

    const salarioAnterior = Number(empleadoAntes.salario || 0);
    const salarioNuevo = Number(salario || 0);
    if (salarioAnterior !== salarioNuevo) {
      await registrarAuditoria({
        entidad: 'empleados_rrhh',
        idRegistro: Number(req.params.id),
        campo: 'salario',
        valorAnterior: String(salarioAnterior),
        valorNuevo: String(salarioNuevo),
        usuario: String(req.body?.usuario || 'Sistema')
      });
    }

    res.json({ mensaje: 'Empleado actualizado y usuario sincronizado', rol_usuario: rol });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE eliminar empleado
router.delete('/empleados/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await asegurarEsquemaEmpleadoUsuario();

    const empleado = await db.get('SELECT id_usuario FROM empleados_rrhh WHERE id_empleado = ?', [id]);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    await db.run('DELETE FROM asistencia WHERE id_empleado = ?', [id]);
    await db.run('DELETE FROM planilla WHERE id_empleado = ?', [id]);
    await db.run('DELETE FROM ausencias WHERE id_empleado = ?', [id]);
    const result = await db.run('DELETE FROM empleados_rrhh WHERE id_empleado = ?', [id]);

    if (!result.changes) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    if (empleado.id_usuario) {
      await db.run('DELETE FROM usuarios WHERE id_usuario = ?', [empleado.id_usuario]);
    }

    res.json({ mensaje: 'Empleado y usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ASISTENCIA =====================

// GET registros de asistencia
router.get('/asistencia', async (req, res) => {
  try {
    const asistencias = await db.all(`
      SELECT a.*, e.nombre, e.apellido
      FROM asistencia a
      LEFT JOIN empleados_rrhh e ON a.id_empleado = e.id_empleado
      ORDER BY a.fecha DESC
    `);
    res.json(asistencias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST registrar asistencia
router.post('/asistencia', async (req, res) => {
  try {
    const { id_empleado, fecha, hora_entrada, hora_salida } = req.body;
    const result = await db.run(
      'INSERT INTO asistencia (id_empleado, fecha, hora_entrada, hora_salida) VALUES (?, ?, ?, ?)',
      [id_empleado, fecha, hora_entrada, hora_salida]
    );
    res.status(201).json({ id: result.id, mensaje: 'Asistencia registrada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== PLANILLA =====================

// GET planillas
router.get('/planilla', async (req, res) => {
  try {
    const planillas = await db.all(`
      SELECT p.*, e.nombre, e.apellido
      FROM planilla p
      LEFT JOIN empleados_rrhh e ON p.id_empleado = e.id_empleado
    `);
    const planillasConDeducciones = planillas.map((planillaItem) => {
      const deducciones = calcularDeduccionesNomina(planillaItem.total_pago);
      return {
        ...planillaItem,
        ...deducciones
      };
    });

    res.json(planillasConDeducciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear planilla
router.post('/planilla', async (req, res) => {
  try {
    const { id_empleado, mes, anio, total_pago } = req.body;

    if (!id_empleado || !mes || !anio) {
      return res.status(400).json({ error: 'id_empleado, mes y anio son requeridos' });
    }

    const empleado = await db.get('SELECT salario, nombre, apellido FROM empleados_rrhh WHERE id_empleado = ?', [id_empleado]);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const salarioBruto = Number(total_pago) > 0 ? Number(total_pago) : Number(empleado.salario || 0);
    const deducciones = calcularDeduccionesNomina(salarioBruto);

    const result = await db.run(
      'INSERT INTO planilla (id_empleado, mes, anio, total_pago) VALUES (?, ?, ?, ?)',
      [id_empleado, mes, anio, salarioBruto]
    );

    res.status(201).json({
      id: result.id,
      mensaje: 'Planilla creada con deducciones automáticas IHSS y RAP',
      detalles: {
        id_empleado,
        empleado: `${empleado.nombre} ${empleado.apellido}`,
        mes,
        anio,
        ...deducciones
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/planilla/:id/pagar', async (req, res) => {
  try {
    const idPlanilla = Number(req.params.id);
    if (!Number.isFinite(idPlanilla)) {
      return res.status(400).json({ error: 'id de planilla inválido' });
    }

    const planilla = await db.get(
      `SELECT p.*, e.nombre, e.apellido
       FROM planilla p
       INNER JOIN empleados_rrhh e ON e.id_empleado = p.id_empleado
       WHERE p.id_planilla = ?`,
      [idPlanilla]
    );

    if (!planilla) {
      return res.status(404).json({ error: 'Planilla no encontrada' });
    }

    const ausenciaPendiente = await db.get(
      `SELECT id_ausencia
       FROM ausencias
       WHERE id_empleado = ?
         AND estado = 'pendiente'
         AND strftime('%m', fecha_inicio) = ?
         AND strftime('%Y', fecha_inicio) = ?
       LIMIT 1`,
      [
        planilla.id_empleado,
        String(Number(planilla.mes)).padStart(2, '0'),
        String(Number(planilla.anio))
      ]
    );

    if (ausenciaPendiente) {
      return res.status(409).json({
        error: 'No se puede pagar la planilla: hay ausencias pendientes de aprobación para este empleado en el período.'
      });
    }

    await db.run(
      `UPDATE planilla
       SET pagada = 1,
           fecha_pago = datetime('now')
       WHERE id_planilla = ?`,
      [idPlanilla]
    );

    res.json({
      mensaje: 'Planilla pagada',
      planilla: {
        id_planilla: idPlanilla,
        empleado: `${planilla.nombre} ${planilla.apellido}`,
        total_pago: Number(planilla.total_pago || 0),
        mes: Number(planilla.mes),
        anio: Number(planilla.anio)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/planilla/pagar-lote', async (req, res) => {
  try {
    const mes = Number(req.body?.mes);
    const anio = Number(req.body?.anio);

    if (!Number.isFinite(mes) || !Number.isFinite(anio)) {
      return res.status(400).json({ error: 'mes y anio son requeridos' });
    }

    const pendientes = await db.all(
      `SELECT p.id_planilla, p.id_empleado
       FROM planilla p
       WHERE p.mes = ? AND p.anio = ? AND COALESCE(p.pagada, 0) = 0`,
      [mes, anio]
    );

    if (pendientes.length === 0) {
      return res.status(404).json({ error: 'No hay planillas pendientes para el período indicado' });
    }

    const empleadosIds = [...new Set(pendientes.map((row) => Number(row.id_empleado)))].filter(Number.isFinite);

    if (empleadosIds.length > 0) {
      const placeholders = empleadosIds.map(() => '?').join(',');
      const ausenciasPendientes = await db.get(
        `SELECT COUNT(*) AS total
         FROM ausencias
         WHERE estado = 'pendiente'
           AND id_empleado IN (${placeholders})
           AND strftime('%m', fecha_inicio) = ?
           AND strftime('%Y', fecha_inicio) = ?`,
        [
          ...empleadosIds,
          String(mes).padStart(2, '0'),
          String(anio)
        ]
      );

      if (Number(ausenciasPendientes?.total || 0) > 0) {
        return res.status(409).json({
          error: 'No se puede ejecutar pago masivo: existen ausencias pendientes en el período.'
        });
      }
    }

    const idsPlanilla = pendientes.map((row) => Number(row.id_planilla)).filter(Number.isFinite);
    const idPlaceholders = idsPlanilla.map(() => '?').join(',');

    const result = await db.run(
      `UPDATE planilla
       SET pagada = 1,
           fecha_pago = datetime('now')
       WHERE id_planilla IN (${idPlaceholders})`,
      idsPlanilla
    );

    res.json({
      mensaje: 'Pago masivo de planilla ejecutado',
      periodo: { mes, anio },
      registros_actualizados: Number(result.changes || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== AUSENCIAS =====================

// GET todas las ausencias
router.get('/ausencias', async (req, res) => {
  try {
    await asegurarEsquemaAusencias();

    const ausencias = await db.all(`
      SELECT a.*, 
             COALESCE(a.tipo, 'permiso') as tipo,
             COALESCE(a.estado, 'pendiente') as estado,
             e.nombre, e.apellido
      FROM ausencias a
      LEFT JOIN empleados_rrhh e ON a.id_empleado = e.id_empleado
      ORDER BY a.fecha_inicio DESC
    `);
    res.json(ausencias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ausencias de un empleado
router.get('/empleados/:id/ausencias', async (req, res) => {
  try {
    await asegurarEsquemaAusencias();

    const ausencias = await db.all(
      `SELECT *,
              COALESCE(tipo, 'permiso') as tipo,
              COALESCE(estado, 'pendiente') as estado
       FROM ausencias WHERE id_empleado = ? ORDER BY fecha_inicio DESC`,
      [req.params.id]
    );
    res.json(ausencias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear ausencia
router.post('/ausencias', async (req, res) => {
  try {
    await asegurarEsquemaAusencias();

    const { id_empleado, fecha_inicio, fecha_fin, descripcion_motivo, tipo, estado } = req.body;
    const tipoFinal = normalizarTipoAusencia(tipo);
    const estadoFinal = normalizarEstadoAusencia(estado);

    if (estadoFinal === 'aprobada') {
      const validacion = await validarDisponibilidadMinima({
        idEmpleadoSolicitante: id_empleado,
        fechaInicio: fecha_inicio,
        fechaFin: fecha_fin
      });

      if (!validacion.ok) {
        return res.status(409).json({
          error: `No se puede aprobar: el ${validacion.fecha} quedarían ${validacion.disponibles} disponibles (mínimo ${validacion.minimo_requerido})`,
          ...validacion
        });
      }
    }

    const result = await db.run(
      'INSERT INTO ausencias (id_empleado, fecha_inicio, fecha_fin, descripcion_motivo, tipo, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [id_empleado, fecha_inicio, fecha_fin, descripcion_motivo, tipoFinal, estadoFinal]
    );
    res.status(201).json({ id: result.id, mensaje: 'Ausencia creada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar ausencia
router.put('/ausencias/:id', async (req, res) => {
  try {
    await asegurarEsquemaAusencias();

    const { fecha_inicio, fecha_fin, descripcion_motivo, tipo, estado } = req.body;
    const tipoFinal = normalizarTipoAusencia(tipo);
    const estadoFinal = normalizarEstadoAusencia(estado);

    if (estadoFinal === 'aprobada') {
      const ausenciaActual = await db.get('SELECT id_empleado FROM ausencias WHERE id_ausencia = ?', [req.params.id]);
      if (!ausenciaActual) {
        return res.status(404).json({ error: 'Ausencia no encontrada' });
      }

      const validacion = await validarDisponibilidadMinima({
        idAusenciaExcluir: req.params.id,
        idEmpleadoSolicitante: ausenciaActual.id_empleado,
        fechaInicio: fecha_inicio,
        fechaFin: fecha_fin
      });

      if (!validacion.ok) {
        return res.status(409).json({
          error: `No se puede aprobar: el ${validacion.fecha} quedarían ${validacion.disponibles} disponibles (mínimo ${validacion.minimo_requerido})`,
          ...validacion
        });
      }
    }

    await db.run(
      'UPDATE ausencias SET fecha_inicio=?, fecha_fin=?, descripcion_motivo=?, tipo=?, estado=? WHERE id_ausencia=?',
      [fecha_inicio, fecha_fin, descripcion_motivo, tipoFinal, estadoFinal, req.params.id]
    );
    res.json({ mensaje: 'Ausencia actualizada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE ausencia
router.delete('/ausencias/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM ausencias WHERE id_ausencia = ?', [req.params.id]);
    res.json({ mensaje: 'Ausencia eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT aprobar/rechazar ausencia
router.put('/ausencias/:id/estado', async (req, res) => {
  try {
    await asegurarEsquemaAusencias();

    const estadoFinal = normalizarEstadoAusencia(req.body?.estado);

    if (estadoFinal === 'aprobada') {
      const ausencia = await db.get(
        'SELECT id_ausencia, id_empleado, fecha_inicio, fecha_fin FROM ausencias WHERE id_ausencia = ?',
        [req.params.id]
      );

      if (!ausencia) {
        return res.status(404).json({ error: 'Ausencia no encontrada' });
      }

      const validacion = await validarDisponibilidadMinima({
        idAusenciaExcluir: req.params.id,
        idEmpleadoSolicitante: ausencia.id_empleado,
        fechaInicio: ausencia.fecha_inicio,
        fechaFin: ausencia.fecha_fin
      });

      if (!validacion.ok) {
        return res.status(409).json({
          error: `No se puede aprobar: el ${validacion.fecha} quedarían ${validacion.disponibles} disponibles (mínimo ${validacion.minimo_requerido})`,
          ...validacion
        });
      }
    }

    await db.run(
      'UPDATE ausencias SET estado = ? WHERE id_ausencia = ?',
      [estadoFinal, req.params.id]
    );

    res.json({ mensaje: `Ausencia ${estadoFinal}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== DESCUENTOS RRHH =====================

// GET todos los descuentos
router.get('/descuentos', async (req, res) => {
  try {
    const descuentos = await db.all(`
      SELECT d.*, e.nombre, e.apellido
      FROM descuentos_rrhh d
      LEFT JOIN empleados_rrhh e ON d.id_empleado = e.id_empleado
    `);
    res.json(descuentos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET descuentos de un empleado
router.get('/empleados/:id/descuentos', async (req, res) => {
  try {
    const descuentos = await db.all(
      'SELECT * FROM descuentos_rrhh WHERE id_empleado = ?',
      [req.params.id]
    );
    res.json(descuentos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear descuento
router.post('/descuentos', async (req, res) => {
  try {
    const { id_empleado, concepto, monto } = req.body;
    const result = await db.run(
      'INSERT INTO descuentos_rrhh (id_empleado, concepto, monto) VALUES (?, ?, ?)',
      [id_empleado, concepto, monto]
    );
    res.status(201).json({ id: result.id, mensaje: 'Descuento creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar descuento
router.put('/descuentos/:id', async (req, res) => {
  try {
    const { concepto, monto } = req.body;
    await db.run(
      'UPDATE descuentos_rrhh SET concepto=?, monto=? WHERE id_descuento=?',
      [concepto, monto, req.params.id]
    );
    res.json({ mensaje: 'Descuento actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE descuento
router.delete('/descuentos/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM descuentos_rrhh WHERE id_descuento = ?', [req.params.id]);
    res.json({ mensaje: 'Descuento eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== SALARIOS ANUALES E ISR =====================

// Función para calcular ISR Honduras
const calcularISR = (salarioAnual) => {
  // Escala de ISR en Honduras (2024-2025)
  // 0 a 156,096: 0%
  // 156,096.01 a 283,646: 15%
  // 283,646.01 en adelante: 25%
  
  if (salarioAnual <= 156096) {
    return 0;
  } else if (salarioAnual <= 283646) {
    return (salarioAnual - 156096) * 0.15;
  } else {
    return ((283646 - 156096) * 0.15) + ((salarioAnual - 283646) * 0.25);
  }
};

// GET salarios anuales e ISR por empleado
router.get('/salarios-anuales-isr', async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    
    // Obtener todas las planillas del año actual agrupadas por empleado
    const salariosPorEmpleado = await db.all(`
      SELECT 
        e.id_empleado,
        e.nombre,
        e.apellido,
        COALESCE(SUM(p.total_pago), 0) as salario_anual
      FROM empleados_rrhh e
      LEFT JOIN planilla p ON e.id_empleado = p.id_empleado AND p.anio = ?
      GROUP BY e.id_empleado
      ORDER BY e.nombre
    `, [anioActual]);

    // Si no hay datos, retornar array vacío
    if (!salariosPorEmpleado || salariosPorEmpleado.length === 0) {
      return res.json([]);
    }

    // Calcular ISR para cada empleado
    const resultados = salariosPorEmpleado.map(empleado => {
      const isr = calcularISR(empleado.salario_anual);
      return {
        id_empleado: empleado.id_empleado,
        nombre_completo: `${empleado.nombre} ${empleado.apellido}`,
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        salario_anual: empleado.salario_anual,
        isr_calculado: Math.round(isr * 100) / 100,
        aplica_isr: empleado.salario_anual > 225000,
        anio: anioActual
      };
    });

    res.json(resultados);
  } catch (error) {
    console.error('Error en /salarios-anuales-isr:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
