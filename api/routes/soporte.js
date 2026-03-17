const express = require('express');
const router = express.Router();
const db = require('../database');
const { procesarCierreTicketSAP } = require('../services/sapIntegration');

// ===================== FUNCIONES DE PRIORIDAD Y SLA =====================

// Palabras clave para detectar prioridad
const palabrasClavePrioridad = {
  Crítica: {
    palabras: [
      'caído', 'caida', 'caid',
      'bloqueado', 'bloqueada', 'bloquead',
      'urgente', 'urgencia',
      'no funciona',
      'inactivo', 'sin acceso',
      'falla crítica', 'error crítico',
      'servicio abajo', 'sistema down',
      'pérdida de datos', 'perdida de datos',
      'incidente mayor',
      'emergencia'
    ],
    gravedad: 'Crítica'
  },
  Alta: {
    palabras: [
      'lento', 'muy lento',
      'error', 'falla',
      'problema', 'problemas',
      'no carga', 'tarda',
      'timeout', 'conexión perdida', 'conexion perdida',
      'error de acceso'
    ],
    gravedad: 'Alta'
  },
  Baja: {
    palabras: [
      'consulta', 'consultas',
      'información', 'informacion',
      'duda', 'dudas',
      'cómo', 'como',
      'pregunta', 'preguntas',
      'solicitud', 'solicitudes'
    ],
    gravedad: 'Baja'
  }
};

// Mapeo de Prioridad a SLA
const mapeoSLA = {
  Crítica: 2,  // Soporte Urgente
  Alta: 2,     // Soporte Urgente
  Media: 3,    // Soporte Normal
  Baja: 4      // Consultas
};

const especialidadesOT = ['Electricidad', 'Plomería', 'Mecánica', 'Climatización', 'Obra Civil'];
const estadosOT = ['Pendiente', 'En Proceso', 'Finalizada'];
const prioridadesOT = ['Baja', 'Media', 'Alta'];

const slaPorTipoCliente = {
  vip: {
    nombre: 'SLA Cliente VIP',
    tiempo_respuesta: 120,
    tiempo_resolucion: 480,
    prioridad: 'Alta'
  },
  estandar: {
    nombre: 'SLA Cliente Estandar',
    tiempo_respuesta: 1440,
    tiempo_resolucion: 2880,
    prioridad: 'Media'
  }
};

let ensureClienteTipoColumnPromise = null;

function normalizarTipoCliente(tipo) {
  const value = String(tipo || '').toLowerCase().trim();
  if (value === 'vip') return 'vip';
  return 'estandar';
}

async function ensureClienteTipoColumn() {
  if (!ensureClienteTipoColumnPromise) {
    ensureClienteTipoColumnPromise = (async () => {
      try {
        await db.run("ALTER TABLE clientes ADD COLUMN tipo_cliente TEXT DEFAULT 'estandar'");
      } catch (error) {
        if (!String(error.message || '').includes('duplicate column name')) {
          throw error;
        }
      }

      await db.run("UPDATE clientes SET tipo_cliente='estandar' WHERE tipo_cliente IS NULL OR TRIM(tipo_cliente) = ''");
    })();
  }

  return ensureClienteTipoColumnPromise;
}

async function ensureSLAClienteTipo(tipoCliente) {
  const tipoNormalizado = normalizarTipoCliente(tipoCliente);
  const config = slaPorTipoCliente[tipoNormalizado] || slaPorTipoCliente.estandar;

  let sla = await db.get('SELECT * FROM slas WHERE nombre = ? LIMIT 1', [config.nombre]);
  if (sla) return sla;

  const result = await db.run(
    'INSERT INTO slas (nombre, tiempo_respuesta, tiempo_resolucion, prioridad) VALUES (?, ?, ?, ?)',
    [config.nombre, config.tiempo_respuesta, config.tiempo_resolucion, config.prioridad]
  );

  sla = await db.get('SELECT * FROM slas WHERE id_sla = ?', [result.id]);
  return sla;
}

// FUNCIÓN: Detectar prioridad según palabras clave
function detectarPrioridad(descripcion, titulo) {
  const textoCompleto = `${titulo} ${descripcion}`.toLowerCase();
  
  // Buscar palabras críticas primero (máxima prioridad)
  if (palabrasClavePrioridad.Crítica.palabras.some(p => textoCompleto.includes(p))) {
    return 'Crítica';
  }
  
  // Luego palabras de alta prioridad
  if (palabrasClavePrioridad.Alta.palabras.some(p => textoCompleto.includes(p))) {
    return 'Alta';
  }
  
  // Si no contiene ninguna palabra clave, es baja por defecto
  return 'Baja';
}

// FUNCIÓN: Asignar SLA según prioridad
async function asignarSLAPorPrioridad(prioridad) {
  const id_sla = mapeoSLA[prioridad] || mapeoSLA.Baja;
  const sla = await db.get('SELECT * FROM slas WHERE id_sla = ?', [id_sla]);
  return sla;
}

// FUNCIÓN: Calcular fecha límite
function calcularFechaLimite(minutos) {
  const ahora = new Date();
  return new Date(ahora.getTime() + minutos * 60000);
}

function calcularFechaLimiteDesde(fechaBase, minutos) {
  const base = fechaBase ? new Date(fechaBase) : new Date();
  const baseValida = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(baseValida.getTime() + minutos * 60000);
}

async function ensureOrdenesTrabajoTable() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_trabajo (
      id_ot INTEGER PRIMARY KEY AUTOINCREMENT,
      folio_ot TEXT NOT NULL UNIQUE,
      solicitante_nombre TEXT NOT NULL,
      descripcion_problema TEXT,
      diagnostico_tecnico TEXT,
      prioridad TEXT NOT NULL DEFAULT 'Media',
      celular_solicitante TEXT,
      ubicacion_problema TEXT,
      id_usuario INTEGER,
      especialidad TEXT NOT NULL,
      taller_asignado TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Pendiente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
    )
  `);

  try {
    await db.run('ALTER TABLE ordenes_trabajo ADD COLUMN celular_solicitante TEXT');
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.run('ALTER TABLE ordenes_trabajo ADD COLUMN ubicacion_problema TEXT');
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.run('ALTER TABLE ordenes_trabajo ADD COLUMN descripcion_problema TEXT');
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.run("ALTER TABLE ordenes_trabajo ADD COLUMN diagnostico_tecnico TEXT");
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.run("ALTER TABLE ordenes_trabajo ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'Media'");
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column name')) {
      throw error;
    }
  }
}

async function ensureOrdenesTrabajoMaterialesTable() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS ordenes_trabajo_materiales (
      id_material_ot INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ot INTEGER NOT NULL,
      id_item INTEGER NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      FOREIGN KEY (id_ot) REFERENCES ordenes_trabajo(id_ot) ON DELETE CASCADE,
      FOREIGN KEY (id_item) REFERENCES item_master(id_item)
    )
  `);
}

async function obtenerMaterialesOT(idOT) {
  await ensureOrdenesTrabajoMaterialesTable();

  const materiales = await db.all(
    `SELECT m.id_material_ot,
            m.id_ot,
            m.id_item,
            im.item_id as codigo_91g,
            im.descripcion,
            m.cantidad,
            m.precio_unitario
     FROM ordenes_trabajo_materiales m
     LEFT JOIN item_master im ON im.id_item = m.id_item
     WHERE m.id_ot = ?
     ORDER BY m.id_material_ot ASC`,
    [idOT]
  );

  return materiales;
}

async function reemplazarMaterialesOT(idOT, materiales = []) {
  await ensureOrdenesTrabajoMaterialesTable();

  await db.run('DELETE FROM ordenes_trabajo_materiales WHERE id_ot = ?', [idOT]);

  for (const material of materiales) {
    const idItem = Number(material?.id_item);
    const cantidad = Number(material?.cantidad);
    const precioUnitario = Number(material?.precio_unitario);

    if (!Number.isInteger(idItem) || idItem < 1) {
      throw new Error('Material inválido: id_item requerido');
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('Material inválido: cantidad debe ser mayor a 0');
    }

    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new Error('Material inválido: precio_unitario debe ser mayor o igual a 0');
    }

    const itemExiste = await db.get('SELECT id_item FROM item_master WHERE id_item = ?', [idItem]);
    if (!itemExiste) {
      throw new Error(`Material inválido: item ${idItem} no existe`);
    }

    await db.run(
      `INSERT INTO ordenes_trabajo_materiales (id_ot, id_item, cantidad, precio_unitario)
       VALUES (?, ?, ?, ?)`,
      [idOT, idItem, cantidad, precioUnitario]
    );
  }
}

function formatearFechaYYYYMMDD(fecha = new Date()) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function generarFolioOT() {
  await ensureOrdenesTrabajoTable();

  const fecha = formatearFechaYYYYMMDD();
  const prefijo = `OT-${fecha}-`;
  const row = await db.get(
    'SELECT COUNT(*) as total FROM ordenes_trabajo WHERE folio_ot LIKE ?',
    [`${prefijo}%`]
  );

  const siguiente = Number(row?.total || 0) + 1;
  return `${prefijo}${String(siguiente).padStart(4, '0')}`;
}

// ===================== USUARIOS =====================

// POST login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }
    
    const usuario = await db.get('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password]);
    
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    // Verificar si el estado es activo
    if (usuario.estado !== 'activo') {
      return res.status(403).json({ 
        error: 'Cuenta pendiente de aprobación',
        estado: usuario.estado
      });
    }
    
    // Login exitoso
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
    res.json({ 
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        estado: usuario.estado
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET todos los usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const usuarios = await db.all('SELECT * FROM usuarios');
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET usuario específico
router.get('/usuarios/:id', async (req, res) => {
  try {
    const usuario = await db.get('SELECT * FROM usuarios WHERE id_usuario = ?', [req.params.id]);
    if (usuario) {
      res.json(usuario);
    } else {
      res.status(404).json({ error: 'Usuario no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear usuario
router.post('/usuarios', async (req, res) => {
  try {
    const { nombre, email, password, rol, id_area, estado } = req.body;
    const rolFinal = rol || 'cliente';
    const estadoFinal = estado || 'pendiente';
    const result = await db.run(
      'INSERT INTO usuarios (nombre, email, password, rol, estado, id_area) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, email, password, rolFinal, estadoFinal, id_area]
    );
    res.status(201).json({ id: result.id, mensaje: 'Usuario creado', estado: estadoFinal, rol: rolFinal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar usuario
router.put('/usuarios/:id', async (req, res) => {
  try {
    const { nombre, email, password, rol, id_area, estado } = req.body;
    await db.run(
      'UPDATE usuarios SET nombre=?, email=?, password=?, rol=?, estado=?, id_area=? WHERE id_usuario=?',
      [nombre, email, password, rol, estado, id_area, req.params.id]
    );
    res.json({ mensaje: 'Usuario actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE usuario
router.delete('/usuarios/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM usuarios WHERE id_usuario = ?', [req.params.id]);
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== CLIENTES =====================

// GET todos los clientes
router.get('/clientes', async (req, res) => {
  try {
    await ensureClienteTipoColumn();

    const clientes = await db.all(`
      SELECT *, COALESCE(tipo_cliente, 'estandar') as tipo_cliente
      FROM clientes
    `);
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear cliente
router.post('/clientes', async (req, res) => {
  try {
    await ensureClienteTipoColumn();

    const { nombre, telefono, email, direccion, tipo_cliente } = req.body;
    const tipoCliente = normalizarTipoCliente(tipo_cliente);

    const result = await db.run(
      'INSERT INTO clientes (nombre, telefono, email, direccion, tipo_cliente) VALUES (?, ?, ?, ?, ?)',
      [nombre, telefono, email, direccion, tipoCliente]
    );
    res.status(201).json({ id: result.id, mensaje: 'Cliente creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar cliente
router.put('/clientes/:id', async (req, res) => {
  try {
    await ensureClienteTipoColumn();

    const { nombre, telefono, email, direccion, tipo_cliente } = req.body;
    const tipoCliente = normalizarTipoCliente(tipo_cliente);

    await db.run(
      'UPDATE clientes SET nombre=?, telefono=?, email=?, direccion=?, tipo_cliente=? WHERE id_cliente=?',
      [nombre, telefono, email, direccion, tipoCliente, req.params.id]
    );
    res.json({ mensaje: 'Cliente actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE cliente
router.delete('/clientes/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM clientes WHERE id_cliente = ?', [req.params.id]);
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ÓRDENES DE TRABAJO =====================

// GET listado de órdenes de trabajo
router.get('/ordenes-trabajo', async (req, res) => {
  try {
    await ensureOrdenesTrabajoTable();

    const ordenes = await db.all(`
      SELECT ot.*, u.nombre as usuario_nombre
      FROM ordenes_trabajo ot
      LEFT JOIN usuarios u ON ot.id_usuario = u.id_usuario
      ORDER BY ot.id_ot DESC
    `);

    res.json(ordenes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET siguiente folio de orden de trabajo
router.get('/ordenes-trabajo/siguiente-folio', async (req, res) => {
  try {
    const folio = await generarFolioOT();
    res.json({ folio_ot: folio });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET detalle de OT (incluye materiales)
router.get('/ordenes-trabajo/:id/detalle', async (req, res) => {
  try {
    await ensureOrdenesTrabajoTable();

    const orden = await db.get(
      `SELECT ot.*, u.nombre as usuario_nombre
       FROM ordenes_trabajo ot
       LEFT JOIN usuarios u ON ot.id_usuario = u.id_usuario
       WHERE ot.id_ot = ?`,
      [req.params.id]
    );

    if (!orden) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada' });
    }

    const materiales = await obtenerMaterialesOT(req.params.id);

    res.json({ ...orden, materiales });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear orden de trabajo
router.post('/ordenes-trabajo', async (req, res) => {
  try {
    await ensureOrdenesTrabajoTable();

    const {
      id_usuario,
      solicitante_nombre,
      descripcion_problema,
      diagnostico_tecnico,
      prioridad,
      celular_solicitante,
      ubicacion_problema,
      especialidad,
      taller_asignado,
      materiales
    } = req.body;
    const especialidadValida = especialidadesOT.includes(especialidad);

    if (!especialidadValida) {
      return res.status(400).json({ error: 'Especialidad no válida' });
    }

    const prioridadFinal = prioridadesOT.includes(prioridad) ? prioridad : 'Media';

    if (!String(taller_asignado || '').trim()) {
      return res.status(400).json({ error: 'El taller asignado es obligatorio' });
    }

    if (!String(celular_solicitante || '').trim()) {
      return res.status(400).json({ error: 'El celular del solicitante es obligatorio' });
    }

    if (!String(ubicacion_problema || '').trim()) {
      return res.status(400).json({ error: 'La ubicación del problema es obligatoria' });
    }

    if (!String(descripcion_problema || '').trim()) {
      return res.status(400).json({ error: 'La descripción del problema es obligatoria' });
    }

    let solicitanteFinal = String(solicitante_nombre || '').trim();
    let idUsuarioFinal = null;

    if (id_usuario !== null && id_usuario !== undefined && id_usuario !== '') {
      const usuario = await db.get('SELECT id_usuario, nombre FROM usuarios WHERE id_usuario = ?', [id_usuario]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuario solicitante no encontrado' });
      }
      idUsuarioFinal = usuario.id_usuario;
      solicitanteFinal = usuario.nombre;
    }

    if (!solicitanteFinal) {
      return res.status(400).json({ error: 'Debes seleccionar un usuario o ingresar un solicitante manual' });
    }

    const folio = await generarFolioOT();

    const result = await db.run(
      `INSERT INTO ordenes_trabajo
       (folio_ot, solicitante_nombre, descripcion_problema, diagnostico_tecnico, prioridad, celular_solicitante, ubicacion_problema, id_usuario, especialidad, taller_asignado, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        folio,
        solicitanteFinal,
        String(descripcion_problema).trim(),
        String(diagnostico_tecnico || '').trim(),
        prioridadFinal,
        String(celular_solicitante).trim(),
        String(ubicacion_problema).trim(),
        idUsuarioFinal,
        especialidad,
        String(taller_asignado).trim(),
        'Pendiente'
      ]
    );

    if (Array.isArray(materiales) && materiales.length > 0) {
      await reemplazarMaterialesOT(result.id, materiales);
    }

    res.status(201).json({ id: result.id, folio_ot: folio, mensaje: 'Orden de trabajo creada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar orden de trabajo
router.put('/ordenes-trabajo/:id', async (req, res) => {
  try {
    await ensureOrdenesTrabajoTable();

    const {
      id_usuario,
      solicitante_nombre,
      descripcion_problema,
      diagnostico_tecnico,
      prioridad,
      celular_solicitante,
      ubicacion_problema,
      especialidad,
      taller_asignado,
      estado,
      materiales
    } = req.body;

    if (!especialidadesOT.includes(especialidad)) {
      return res.status(400).json({ error: 'Especialidad no válida' });
    }

    if (!estadosOT.includes(estado)) {
      return res.status(400).json({ error: 'Estado de OT no válido' });
    }

    if (!prioridadesOT.includes(prioridad)) {
      return res.status(400).json({ error: 'Prioridad de OT no válida' });
    }

    const tallerFinal = String(taller_asignado || '').trim();
    if (!tallerFinal) {
      return res.status(400).json({ error: 'El taller asignado es obligatorio' });
    }

    const celularFinal = String(celular_solicitante || '').trim();
    if (!celularFinal) {
      return res.status(400).json({ error: 'El celular del solicitante es obligatorio' });
    }

    const ubicacionFinal = String(ubicacion_problema || '').trim();
    if (!ubicacionFinal) {
      return res.status(400).json({ error: 'La ubicación del problema es obligatoria' });
    }

    const descripcionFinal = String(descripcion_problema || '').trim();
    if (!descripcionFinal) {
      return res.status(400).json({ error: 'La descripción del problema es obligatoria' });
    }

    const diagnosticoFinal = String(diagnostico_tecnico || '').trim();

    let solicitanteFinal = String(solicitante_nombre || '').trim();
    let idUsuarioFinal = null;

    if (id_usuario !== null && id_usuario !== undefined && id_usuario !== '') {
      const usuario = await db.get('SELECT id_usuario, nombre FROM usuarios WHERE id_usuario = ?', [id_usuario]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuario solicitante no encontrado' });
      }
      idUsuarioFinal = usuario.id_usuario;
      solicitanteFinal = usuario.nombre;
    }

    if (!solicitanteFinal) {
      return res.status(400).json({ error: 'Debes seleccionar un usuario o ingresar un solicitante manual' });
    }

    await db.run(
      `UPDATE ordenes_trabajo
       SET solicitante_nombre = ?,
           descripcion_problema = ?,
           diagnostico_tecnico = ?,
           prioridad = ?,
           celular_solicitante = ?,
           ubicacion_problema = ?,
           id_usuario = ?,
           especialidad = ?,
           taller_asignado = ?,
           estado = ?
       WHERE id_ot = ?`,
      [
        solicitanteFinal,
        descripcionFinal,
        diagnosticoFinal,
        prioridad,
        celularFinal,
        ubicacionFinal,
        idUsuarioFinal,
        especialidad,
        tallerFinal,
        estado,
        req.params.id
      ]
    );

    if (Array.isArray(materiales)) {
      await reemplazarMaterialesOT(req.params.id, materiales);
    }

    res.json({ mensaje: 'Orden de trabajo actualizada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== TICKETS =====================

// GET todos los tickets
router.get('/tickets', async (req, res) => {
  try {
    const tickets = await db.all(`
      SELECT t.*, 
             c.nombre as cliente_nombre, 
            COALESCE(c.tipo_cliente, 'estandar') as cliente_tipo,
             tc.nombre as estado_nombre,
             s.nombre as sla_nombre,
             s.tiempo_respuesta as sla_tiempo_respuesta,
             s.tiempo_resolucion as sla_tiempo_resolucion
      FROM tickets t
      LEFT JOIN clientes c ON t.id_cliente = c.id_cliente
      LEFT JOIN estados_tickets tc ON t.id_estado = tc.id_estado
      LEFT JOIN slas s ON t.id_sla = s.id_sla
      ORDER BY t.fecha_limite_resolucion ASC
    `);

    // Calcular tiempos restantes en el backend
    const ahora = new Date();
    const ticketsConTiempos = tickets.map(ticket => {
      const fechaLimiteRespuesta = ticket.fecha_limite_respuesta ? new Date(ticket.fecha_limite_respuesta) : null;
      const fechaLimiteResolucion = ticket.fecha_limite_resolucion ? new Date(ticket.fecha_limite_resolucion) : null;

      const minutosRespuesta = fechaLimiteRespuesta 
        ? Math.max(0, Math.floor((fechaLimiteRespuesta - ahora) / 60000))
        : null;
      const minutosResolucion = fechaLimiteResolucion 
        ? Math.max(0, Math.floor((fechaLimiteResolucion - ahora) / 60000))
        : null;

      const vencidoRespuesta = minutosRespuesta === 0 && ahora > fechaLimiteRespuesta;
      const vencidoResolucion = minutosResolucion === 0 && ahora > fechaLimiteResolucion;

      return {
        ...ticket,
        cliente_tipo: normalizarTipoCliente(ticket.cliente_tipo),
        criterio_sla: ticket.sla_nombre && ticket.sla_nombre.toLowerCase().includes('cliente')
          ? 'tipo_cliente'
          : 'prioridad',
        minutos_restantes_respuesta: minutosRespuesta,
        minutos_restantes_resolucion: minutosResolucion,
        vencido_respuesta: vencidoRespuesta,
        vencido_resolucion: vencidoResolucion,
        estado_sla_resolucion: minutosResolucion 
          ? (minutosResolucion > 60 ? 'Normal' : minutosResolucion > 30 ? 'Advertencia' : 'Crítico')
          : 'N/A'
      };
    });

    res.json(ticketsConTiempos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear ticket
router.post('/tickets', async (req, res) => {
  try {
    const { titulo, descripcion, id_cliente, id_usuario_cliente, id_usuario, id_tecnico, id_subcategoria, id_estado } = req.body;

    await ensureClienteTipoColumn();

    let idClienteFinal = id_cliente;
    const idUsuarioClienteFinal = Number(id_usuario_cliente || id_usuario || 0);

    if (!String(titulo || '').trim() || !String(descripcion || '').trim()) {
      return res.status(400).json({ error: 'Título y descripción son obligatorios' });
    }

    if (!idUsuarioClienteFinal && !idClienteFinal) {
      return res.status(400).json({ error: 'Debes seleccionar un usuario para crear el ticket' });
    }

    if (idUsuarioClienteFinal) {
      const usuario = await db.get('SELECT id_usuario, nombre, email FROM usuarios WHERE id_usuario = ?', [idUsuarioClienteFinal]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado para crear el ticket' });
      }

      let clienteAsociado = null;

      if (usuario.email) {
        clienteAsociado = await db.get(
          'SELECT id_cliente FROM clientes WHERE LOWER(email) = LOWER(?) LIMIT 1',
          [usuario.email]
        );
      }

      if (!clienteAsociado) {
        clienteAsociado = await db.get(
          'SELECT id_cliente FROM clientes WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
          [usuario.nombre]
        );
      }

      if (!clienteAsociado) {
        const insertCliente = await db.run(
          'INSERT INTO clientes (nombre, telefono, email, direccion, tipo_cliente) VALUES (?, ?, ?, ?, ?)',
          [usuario.nombre, null, usuario.email || null, null, 'estandar']
        );
        clienteAsociado = { id_cliente: insertCliente.id };
      }

      idClienteFinal = clienteAsociado.id_cliente;
    }

    const cliente = await db.get('SELECT id_cliente, nombre, COALESCE(tipo_cliente, "estandar") as tipo_cliente FROM clientes WHERE id_cliente = ?', [idClienteFinal]);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado para aplicar SLA' });
    }
    
    // 1. Detectar prioridad automáticamente
    const prioridad = detectarPrioridad(descripcion, titulo);
    
    // 2. Asignar SLA según tipo de cliente (VIP/Estándar)
    let sla = await ensureSLAClienteTipo(cliente.tipo_cliente);
    if (!sla) {
      sla = await asignarSLAPorPrioridad(prioridad);
    }

    if (!sla) {
      return res.status(500).json({ error: 'No fue posible determinar el SLA para este ticket' });
    }

    const id_sla = sla.id_sla;
    
    // 3. Calcular fechas límite
    const ahora = new Date();
    const fecha_limite_respuesta = calcularFechaLimite(sla.tiempo_respuesta);
    const fecha_limite_resolucion = calcularFechaLimite(sla.tiempo_resolucion);
    
    // 4. Guardar ticket con SLA
    const result = await db.run(
      `INSERT INTO tickets 
       (titulo, descripcion, id_cliente, id_tecnico, id_subcategoria, id_estado,
        prioridad, id_sla, fecha_creacion, fecha_limite_respuesta, 
        fecha_limite_resolucion, estado_respuesta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [titulo, descripcion, idClienteFinal, id_tecnico, id_subcategoria, id_estado,
       prioridad, id_sla, ahora, fecha_limite_respuesta, fecha_limite_resolucion,
       'No respondido']
    );
    
    res.status(201).json({ 
      id: result.id, 
      mensaje: 'Ticket creado con SLA',
      prioridad: prioridad,
      cliente: cliente.nombre,
      tipo_cliente: normalizarTipoCliente(cliente.tipo_cliente),
      criterio_sla: 'tipo_cliente',
      sla: sla.nombre,
      fecha_limite_respuesta: fecha_limite_respuesta,
      fecha_limite_resolucion: fecha_limite_resolucion
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar ticket
router.put('/tickets/:id', async (req, res) => {
  try {
    const { titulo, descripcion, id_cliente, id_tecnico, id_subcategoria, id_estado } = req.body;
    await db.run(
      `UPDATE tickets SET titulo=?, descripcion=?, id_cliente=?, id_tecnico=?, 
       id_subcategoria=?, id_estado=? WHERE id_ticket=?`,
      [titulo, descripcion, id_cliente, id_tecnico, id_subcategoria, id_estado, req.params.id]
    );
    res.json({ mensaje: 'Ticket actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST recalcular SLA en tickets históricos
router.post('/tickets/recalcular-sla-clientes', async (req, res) => {
  try {
    await ensureClienteTipoColumn();

    const incluirConSLA = Boolean(req.body?.incluirConSLA);
    const where = incluirConSLA ? '' : 'WHERE t.id_sla IS NULL';

    const tickets = await db.all(`
      SELECT t.*, COALESCE(c.tipo_cliente, 'estandar') as tipo_cliente
      FROM tickets t
      LEFT JOIN clientes c ON t.id_cliente = c.id_cliente
      ${where}
      ORDER BY t.id_ticket ASC
    `);

    let actualizados = 0;
    let omitidos = 0;

    for (const ticket of tickets) {
      if (!ticket.id_cliente) {
        omitidos++;
        continue;
      }

      const tipoCliente = normalizarTipoCliente(ticket.tipo_cliente);
      let sla = await ensureSLAClienteTipo(tipoCliente);

      if (!sla) {
        const prioridadDetectada = detectarPrioridad(ticket.descripcion || '', ticket.titulo || '');
        sla = await asignarSLAPorPrioridad(prioridadDetectada);
      }

      if (!sla) {
        omitidos++;
        continue;
      }

      const prioridadFinal = ticket.prioridad || detectarPrioridad(ticket.descripcion || '', ticket.titulo || '');
      const fechaBase = ticket.fecha_creacion || new Date();
      const fechaLimiteRespuesta = calcularFechaLimiteDesde(fechaBase, sla.tiempo_respuesta);
      const fechaLimiteResolucion = calcularFechaLimiteDesde(fechaBase, sla.tiempo_resolucion);

      await db.run(
        `UPDATE tickets
         SET prioridad = ?,
             id_sla = ?,
             fecha_limite_respuesta = ?,
             fecha_limite_resolucion = ?,
             estado_respuesta = COALESCE(estado_respuesta, 'No Respondido')
         WHERE id_ticket = ?`,
        [
          prioridadFinal,
          sla.id_sla,
          fechaLimiteRespuesta.toISOString(),
          fechaLimiteResolucion.toISOString(),
          ticket.id_ticket
        ]
      );

      actualizados++;
    }

    res.json({
      mensaje: 'Recalculo de SLA completado',
      total_procesados: tickets.length,
      actualizados,
      omitidos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== COMENTARIOS TICKETS =====================

// GET comentarios de un ticket
router.get('/tickets/:id/comentarios', async (req, res) => {
  try {
    const comentarios = await db.all(`
      SELECT c.*, u.nombre as usuario_nombre
      FROM comentarios_tickets c
      LEFT JOIN usuarios u ON c.id_usuario = u.id_usuario
      WHERE c.id_ticket = ?
      ORDER BY c.fecha DESC
    `, [req.params.id]);
    res.json(comentarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear comentario en ticket
router.post('/tickets/:id/comentarios', async (req, res) => {
  try {
    const { id_usuario, comentario } = req.body;
    const result = await db.run(
      'INSERT INTO comentarios_tickets (id_ticket, id_usuario, comentario) VALUES (?, ?, ?)',
      [req.params.id, id_usuario, comentario]
    );
    res.status(201).json({ id: result.id, mensaje: 'Comentario creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ADJUNTOS TICKETS =====================

// GET adjuntos de un ticket
router.get('/tickets/:id/adjuntos', async (req, res) => {
  try {
    const adjuntos = await db.all(
      'SELECT * FROM adjuntos_tickets WHERE id_ticket = ? ORDER BY fecha DESC',
      [req.params.id]
    );
    res.json(adjuntos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear adjunto en ticket
router.post('/tickets/:id/adjuntos', async (req, res) => {
  try {
    const { nombre_archivo, ruta_archivo } = req.body;
    const result = await db.run(
      'INSERT INTO adjuntos_tickets (id_ticket, nombre_archivo, ruta_archivo) VALUES (?, ?, ?)',
      [req.params.id, nombre_archivo, ruta_archivo]
    );
    res.status(201).json({ id: result.id, mensaje: 'Adjunto creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE adjunto
router.delete('/adjuntos/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM adjuntos_tickets WHERE id_adjunto = ?', [req.params.id]);
    res.json({ mensaje: 'Adjunto eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== SLAs =====================

// GET todos los SLAs
router.get('/slas', async (req, res) => {
  try {
    const slas = await db.all('SELECT * FROM slas');
    res.json(slas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear SLA
router.post('/slas', async (req, res) => {
  try {
    const { nombre, tiempo_respuesta, tiempo_resolucion, prioridad } = req.body;
    const result = await db.run(
      'INSERT INTO slas (nombre, tiempo_respuesta, tiempo_resolucion, prioridad) VALUES (?, ?, ?, ?)',
      [nombre, tiempo_respuesta, tiempo_resolucion, prioridad]
    );
    res.status(201).json({ id: result.id, mensaje: 'SLA creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar SLA
router.put('/slas/:id', async (req, res) => {
  try {
    const { nombre, tiempo_respuesta, tiempo_resolucion, prioridad } = req.body;
    await db.run(
      'UPDATE slas SET nombre=?, tiempo_respuesta=?, tiempo_resolucion=?, prioridad=? WHERE id_sla=?',
      [nombre, tiempo_respuesta, tiempo_resolucion, prioridad, req.params.id]
    );
    res.json({ mensaje: 'SLA actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE SLA
router.delete('/slas/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM slas WHERE id_sla = ?', [req.params.id]);
    res.json({ mensaje: 'SLA eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ROLES =====================

// GET todos los roles
router.get('/roles', async (req, res) => {
  try {
    await db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id_rol INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE
      )
    `);

    const rolesBase = ['admin', 'tecnico', 'cliente', 'usuario'];
    for (const nombreRol of rolesBase) {
      await db.run('INSERT OR IGNORE INTO roles (nombre) VALUES (?)', [nombreRol]);
    }

    const roles = await db.all('SELECT * FROM roles');
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear rol
router.post('/roles', async (req, res) => {
  try {
    const { nombre } = req.body;
    const result = await db.run(
      'INSERT INTO roles (nombre) VALUES (?)',
      [nombre]
    );
    res.status(201).json({ id: result.id, mensaje: 'Rol creado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE rol
router.delete('/roles/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM roles WHERE id_rol = ?', [req.params.id]);
    res.json({ mensaje: 'Rol eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ENCUESTAS =====================

// GET todas las encuestas
router.get('/encuestas', async (req, res) => {
  try {
    const encuestas = await db.all(`
      SELECT e.*, u.nombre as usuario_nombre
      FROM encuestas e
      LEFT JOIN usuarios u ON e.id_usuario = u.id_usuario
      ORDER BY e.fecha DESC
    `);
    res.json(encuestas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear encuesta
router.post('/encuestas', async (req, res) => {
  try {
    const { id_usuario, apreciacion } = req.body;
    const result = await db.run(
      'INSERT INTO encuestas (id_usuario, apreciacion) VALUES (?, ?)',
      [id_usuario, apreciacion]
    );
    res.status(201).json({ id: result.id, mensaje: 'Encuesta creada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== SUBCATEGORÍAS =====================

// GET todas las subcategorías
router.get('/subcategorias', async (req, res) => {
  try {
    const subcategorias = await db.all('SELECT * FROM subcategorias_tickets');
    res.json(subcategorias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== NOTIFICACIONES Y ALERTAS SLA =====================

// GET tickets con SLA por vencer (próximos 10 minutos)
router.get('/tickets-alertas-sla', async (req, res) => {
  try {
    const ahora = new Date();
    const en10Min = new Date(ahora.getTime() + 10 * 60000);

    const tickets = await db.all(`
      SELECT t.*, 
             c.nombre as cliente_nombre, 
             s.nombre as sla_nombre,
             s.tiempo_resolucion as sla_tiempo_resolucion,
             tc.nombre as estado_nombre
      FROM tickets t
      LEFT JOIN clientes c ON t.id_cliente = c.id_cliente
      LEFT JOIN slas s ON t.id_sla = s.id_sla
      LEFT JOIN estados_tickets tc ON t.id_estado = tc.id_estado
      WHERE t.fecha_limite_resolucion BETWEEN ? AND ?
        AND t.notificacion_enviada = 0
        AND t.estado_nombre != 'Finalizado'
      ORDER BY t.fecha_limite_resolucion ASC
    `, [ahora.toISOString(), en10Min.toISOString()]);

    res.json({
      total: tickets.length,
      tickets: tickets,
      mensaje: `${tickets.length} tickets con SLA por vencer en los próximos 10 minutos`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT marcar notificación como enviada
router.put('/tickets/:id/notificacion-enviada', async (req, res) => {
  try {
    await db.run(
      'UPDATE tickets SET notificacion_enviada = 1 WHERE id_ticket = ?',
      [req.params.id]
    );
    res.json({ mensaje: 'Notificación marcada como enviada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== REPORTE DE CUMPLIMIENTO SLA =====================

// GET reporte de cumplimiento de SLAs
router.get('/reporte-sla', async (req, res) => {
  try {
    const tickets = await db.all(`
      SELECT t.*, 
             c.nombre as cliente_nombre, 
             s.nombre as sla_nombre,
             s.tiempo_resolucion as sla_tiempo_resolucion,
             tc.nombre as estado_nombre
      FROM tickets t
      LEFT JOIN clientes c ON t.id_cliente = c.id_cliente
      LEFT JOIN slas s ON t.id_sla = s.id_sla
      LEFT JOIN estados_tickets tc ON t.id_estado = tc.id_estado
    `);

    const ahora = new Date();
    let cumplidos = 0;
    let incumplidos = 0;
    let pendientes = 0;

    const detalles = tickets.map(t => {
      const fechaLimite = new Date(t.fecha_limite_resolucion);
      let cumplimiento = 'Pendiente';

      if (t.estado_nombre === 'Finalizado') {
        if (ahora <= fechaLimite) {
          cumplimiento = 'Cumplido';
          cumplidos++;
        } else {
          cumplimiento = 'Incumplido';
          incumplidos++;
        }
      } else {
        pendientes++;
      }

      return {
        id_ticket: t.id_ticket,
        titulo: t.titulo,
        cliente: t.cliente_nombre,
        sla: t.sla_nombre,
        fecha_limite: t.fecha_limite_resolucion,
        estado: t.estado_nombre,
        cumplimiento: cumplimiento
      };
    });

    const tasaCumplimiento = cumplidos + incumplidos > 0 
      ? ((cumplidos / (cumplidos + incumplidos)) * 100).toFixed(2)
      : 0;

    res.json({
      resumen: {
        total_tickets: tickets.length,
        cumplidos: cumplidos,
        incumplidos: incumplidos,
        pendientes: pendientes,
        tasa_cumplimiento: `${tasaCumplimiento}%`
      },
      detalles: detalles
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== MATERIALES POR TICKET =====================

router.get('/tickets/:id/materiales', async (req, res) => {
  try {
    const materiales = await db.all(
      `SELECT tm.id_ticket_material, tm.id_ticket, tm.id_item, tm.cantidad,
              tm.precio_unitario_snapshot, tm.id_centro_costo,
              im.item_id, im.descripcion, COALESCE(im.stock_actual, 0) AS stock_actual, im.unidad_medida
       FROM ticket_materiales tm
       INNER JOIN item_master im ON im.id_item = tm.id_item
       WHERE tm.id_ticket = ?
       ORDER BY tm.id_ticket_material DESC`,
      [req.params.id]
    );

    res.json({
      id_ticket: Number(req.params.id),
      total: materiales.length,
      materiales
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tickets/:id/materiales', async (req, res) => {
  try {
    const idTicket = Number(req.params.id);
    const materiales = Array.isArray(req.body?.materiales) ? req.body.materiales : [];

    if (!Number.isFinite(idTicket)) {
      return res.status(400).json({ error: 'id de ticket inválido' });
    }

    const ticket = await db.get('SELECT id_ticket FROM tickets WHERE id_ticket = ?', [idTicket]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    await db.run('BEGIN IMMEDIATE TRANSACTION');

    try {
      await db.run('DELETE FROM ticket_materiales WHERE id_ticket = ?', [idTicket]);

      for (const material of materiales) {
        const idItem = Number(material.id_item);
        const cantidad = Number(material.cantidad || 0);
        const idCentroCosto = material.id_centro_costo ? Number(material.id_centro_costo) : null;

        if (!Number.isFinite(idItem) || !Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error('Material inválido. Verifica id_item y cantidad.');
        }

        const item = await db.get(
          'SELECT id_item, precio FROM item_master WHERE id_item = ? LIMIT 1',
          [idItem]
        );

        if (!item) {
          throw new Error(`No existe el material id_item=${idItem}`);
        }

        await db.run(
          `INSERT INTO ticket_materiales
           (id_ticket, id_item, cantidad, precio_unitario_snapshot, id_centro_costo)
           VALUES (?, ?, ?, ?, ?)`,
          [idTicket, idItem, cantidad, Number(item.precio || 0), idCentroCosto]
        );
      }

      await db.run('COMMIT');
    } catch (errorTx) {
      await db.run('ROLLBACK');
      throw errorTx;
    }

    const resultado = await db.all(
      `SELECT tm.id_ticket_material, tm.id_item, tm.cantidad, tm.precio_unitario_snapshot,
              im.item_id, im.descripcion, COALESCE(im.stock_actual, 0) AS stock_actual
       FROM ticket_materiales tm
       INNER JOIN item_master im ON im.id_item = tm.id_item
       WHERE tm.id_ticket = ?
       ORDER BY tm.id_ticket_material DESC`,
      [idTicket]
    );

    res.status(201).json({
      mensaje: 'Materiales del ticket guardados',
      id_ticket: idTicket,
      total: resultado.length,
      materiales: resultado
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== HISTORIAL DE CAMBIOS =====================

// Función auxiliar: registrar cambio en historial
async function registrarCambioHistorial(id_ticket, campo, valor_anterior, valor_nuevo, usuario = 'Sistema') {
  try {
    await db.run(
      `INSERT INTO historial_cambios_tickets 
       (id_ticket, campo_modificado, valor_anterior, valor_nuevo, usuario_modificador)
       VALUES (?, ?, ?, ?, ?)`,
      [id_ticket, campo, valor_anterior, valor_nuevo, usuario]
    );
  } catch (error) {
    console.error('Error registrando historial:', error.message);
  }
}

// GET historial de cambios de un ticket
router.get('/tickets/:id/historial', async (req, res) => {
  try {
    const historial = await db.all(
      `SELECT * FROM historial_cambios_tickets 
       WHERE id_ticket = ? 
       ORDER BY fecha_cambio DESC`,
      [req.params.id]
    );
    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ACTUALIZACIÓN DE ESTADO CON HISTORIAL =====================

// PUT actualizar ticket CON historial automático
router.put('/tickets/:id/actualizar-con-historial', async (req, res) => {
  try {
    const { 
      titulo, descripcion, id_cliente, id_tecnico, id_subcategoria, id_estado, 
      usuario_modificador = 'Sistema',
      horas_ticket,
      costo_hora_empleado,
      id_centro_costo
    } = req.body;

    // Obtener ticket actual para comparar cambios
    const ticketActual = await db.get('SELECT * FROM tickets WHERE id_ticket = ?', [req.params.id]);

    if (!ticketActual) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    // Actual estado del ticket
    const estadoAnterior = await db.get(
      'SELECT nombre FROM estados_tickets WHERE id_estado = ?',
      [ticketActual.id_estado]
    );
    const estadoNuevo = await db.get(
      'SELECT nombre FROM estados_tickets WHERE id_estado = ?',
      [id_estado]
    );

     // Actualizar ticket
    await db.run(
      `UPDATE tickets SET titulo=?, descripcion=?, id_cliente=?, id_tecnico=?, 
       id_subcategoria=?, id_estado=?, horas_ticket=?, costo_hora_empleado=? WHERE id_ticket=?`,
      [titulo || ticketActual.titulo, 
       descripcion || ticketActual.descripcion, 
       id_cliente || ticketActual.id_cliente,
       id_tecnico || ticketActual.id_tecnico, 
       id_subcategoria || ticketActual.id_subcategoria, 
       id_estado, 
       Number.isFinite(Number(horas_ticket)) ? Number(horas_ticket) : Number(ticketActual.horas_ticket || 0),
       Number.isFinite(Number(costo_hora_empleado)) ? Number(costo_hora_empleado) : Number(ticketActual.costo_hora_empleado || 0),
       req.params.id]
    );

    // Registrar cambio de estado en historial si cambió
    if (Number(ticketActual.id_estado) !== Number(id_estado)) {
      await registrarCambioHistorial(
        req.params.id,
        'estado',
        estadoAnterior?.nombre || 'N/A',
        estadoNuevo?.nombre || 'N/A',
        usuario_modificador
      );

      // Si cambia a "Procesando", marcar como respondido
      if (estadoNuevo?.nombre === 'Procesando') {
        await db.run(
          'UPDATE tickets SET estado_respuesta = ? WHERE id_ticket = ?',
          ['Respondido', req.params.id]
        );
        await registrarCambioHistorial(
          req.params.id,
          'estado_respuesta',
          'No respondido',
          'Respondido',
          usuario_modificador
        );
      }

      // Si cambia a "Finalizado" o "Cerrado", verificar cumplimiento de SLA e integrar MM/FI
      if (estadoNuevo?.nombre === 'Finalizado' || estadoNuevo?.nombre === 'Cerrado') {
        const ahora = new Date();
        const fechaLimite = new Date(ticketActual.fecha_limite_resolucion);
        const cumplimiento = ahora <= fechaLimite ? 'Cumplido' : 'Incumplido';

        await db.run(
          'UPDATE tickets SET cumplimiento_sla = ? WHERE id_ticket = ?',
          [cumplimiento, req.params.id]
        );
        await registrarCambioHistorial(
          req.params.id,
          'cumplimiento_sla',
          'Pendiente',
          cumplimiento,
          usuario_modificador
        );

        const integracion = await procesarCierreTicketSAP({
          idTicket: Number(req.params.id),
          idTecnico: id_tecnico || ticketActual.id_tecnico,
          horasTicket: Number.isFinite(Number(horas_ticket))
            ? Number(horas_ticket)
            : Number(ticketActual.horas_ticket || 0),
          costoHoraEmpleado: Number.isFinite(Number(costo_hora_empleado))
            ? Number(costo_hora_empleado)
            : null,
          idCentroCosto: Number.isFinite(Number(id_centro_costo))
            ? Number(id_centro_costo)
            : null
        });

        await registrarCambioHistorial(
          req.params.id,
          'integracion_sap',
          'Pendiente',
          `MM-${integracion.movimientos_mercancia.length} / FI-${integracion.asiento_contable?.id_asiento || 'N/A'}`,
          usuario_modificador
        );

        return res.json({
          mensaje: 'Ticket cerrado con integración SAP MM/FI',
          id_ticket: Number(req.params.id),
          cumplimiento_sla: cumplimiento,
          integracion
        });
      }
    }

    res.json({ 
      mensaje: 'Ticket actualizado con historial', 
      id_ticket: req.params.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ESTADOS TICKETS =====================

// GET todos los estados de tickets
router.get('/estados', async (req, res) => {
  try {
    const estados = await db.all('SELECT * FROM estados_tickets');
    res.json(estados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ENCUESTAS OPTIMIZADAS (CX) =====================

// GET preguntas predefinidas de encuesta
router.get('/preguntas-encuestas', async (req, res) => {
  try {
    const preguntas = await db.all('SELECT * FROM preguntas_encuestas ORDER BY orden ASC');
    res.json(preguntas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear encuesta de satisfacción
router.post('/encuestas-satisfaccion', async (req, res) => {
  try {
    const { id_ticket, id_tecnico, id_cliente, calificacion_general, pregunta_demora_sla, comentario } = req.body;
    
    // Verificar si ticket superó SLA
    const ticket = await db.get('SELECT * FROM tickets WHERE id_ticket = ?', [id_ticket]);
    const cumplioSLA = ticket?.cumplimiento_sla === 'Cumplido' ? 0 : 1;

    const result = await db.run(
      `INSERT INTO encuestas_satisfaccion (id_ticket, id_tecnico, id_cliente, calificacion_general, 
       cumplimiento_sla, pregunta_demora_sla, comentario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id_ticket, id_tecnico, id_cliente, calificacion_general, cumplioSLA, pregunta_demora_sla, comentario]
    );

    res.status(201).json({ id: result.id, mensaje: 'Encuesta registrada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST responder pregunta de encuesta
router.post('/encuestas-satisfaccion/:id_encuesta/respuestas', async (req, res) => {
  try {
    const { numero_pregunta, respuesta } = req.body;
    
    const result = await db.run(
      `INSERT INTO respuestas_encuestas (id_encuesta, numero_pregunta, respuesta)
       VALUES (?, ?, ?)`,
      [req.params.id_encuesta, numero_pregunta, respuesta]
    );

    res.status(201).json({ id: result.id, mensaje: 'Respuesta registrada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET todas las encuestas de satisfacción con respuestas
router.get('/encuestas-satisfaccion', async (req, res) => {
  try {
    const encuestas = await db.all(`
      SELECT e.*, 
             t.titulo as ticket_titulo,
             c.nombre as cliente_nombre,
             u.nombre as tecnico_nombre
      FROM encuestas_satisfaccion e
      LEFT JOIN tickets t ON e.id_ticket = t.id_ticket
      LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
      LEFT JOIN usuarios u ON e.id_tecnico = u.id_usuario
      ORDER BY e.fecha_creacion DESC
    `);

    // Obtener respuestas para cada encuesta
    const encuestasConRespuestas = await Promise.all(encuestas.map(async (e) => {
      const respuestas = await db.all(
        'SELECT * FROM respuestas_encuestas WHERE id_encuesta = ? ORDER BY numero_pregunta',
        [e.id_encuesta]
      );
      return { ...e, respuestas };
    }));

    res.json(encuestasConRespuestas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET encuesta de un ticket específico
router.get('/encuestas-ticket/:id_ticket', async (req, res) => {
  try {
    const encuesta = await db.get(`
      SELECT e.*, 
             t.titulo as ticket_titulo,
             c.nombre as cliente_nombre,
             u.nombre as tecnico_nombre
      FROM encuestas_satisfaccion e
      LEFT JOIN tickets t ON e.id_ticket = t.id_ticket
      LEFT JOIN clientes c ON e.id_cliente = c.id_cliente
      LEFT JOIN usuarios u ON e.id_tecnico = u.id_usuario
      WHERE e.id_ticket = ?
    `, [req.params.id_ticket]);

    if (encuesta) {
      const respuestas = await db.all(
        'SELECT * FROM respuestas_encuestas WHERE id_encuesta = ? ORDER BY numero_pregunta',
        [encuesta.id_encuesta]
      );
      res.json({ ...encuesta, respuestas });
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET reporte de calidad de técnicos
router.get('/reporte-calidad-tecnicos', async (req, res) => {
  try {
    const tecnicos = await db.all(`
      SELECT DISTINCT u.id_usuario, u.nombre
      FROM usuarios u
      WHERE u.rol = 'técnico' OR u.rol = 'soporte'
      ORDER BY u.nombre
    `);

    const reporteTecnicos = await Promise.all(tecnicos.map(async (tecnico) => {
      const encuestas = await db.all(`
        SELECT calificacion_general, cumplimiento_sla
        FROM encuestas_satisfaccion
        WHERE id_tecnico = ?
      `, [tecnico.id_usuario]);

      const total = encuestas.length;
      const promedio = total > 0 ? (encuestas.reduce((sum, e) => sum + e.calificacion_general, 0) / total) : 0;
      
      const distribucion = {
        excelente: encuestas.filter(e => e.calificacion_general === 5).length,
        muy_bueno: encuestas.filter(e => e.calificacion_general === 4).length,
        bueno: encuestas.filter(e => e.calificacion_general === 3).length,
        regular: encuestas.filter(e => e.calificacion_general === 2).length,
        malo: encuestas.filter(e => e.calificacion_general === 1).length
      };

      const porcentajeNegativo = total > 0 ? ((distribucion.bueno + distribucion.regular + distribucion.malo) / total * 100) : 0;

      const encuestasIncumplidas = encuestas.filter(e => e.cumplimiento_sla === 1).length;

      return {
        id_usuario: tecnico.id_usuario,
        nombre: tecnico.nombre,
        total_encuestas: total,
        promedio_calificacion: promedio.toFixed(2),
        distribucion,
        porcentaje_calificaciones_bajas: porcentajeNegativo.toFixed(2),
        necesita_capacitacion: porcentajeNegativo > 40,
        encuestas_con_sla_incumplido: encuestasIncumplidas
      };
    }));

    res.json({
      date: new Date(),
      tecnicos: reporteTecnicos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
