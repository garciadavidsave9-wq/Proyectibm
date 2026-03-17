const express = require('express');
const router = express.Router();
const db = require('../database');

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
let seedContabilidadPromise = null;

const cuentasDemo = [
  { codigo: '101', nombre: 'Caja', tipo: 'Activo' },
  { codigo: '102', nombre: 'Bancos', tipo: 'Activo' },
  { codigo: '201', nombre: 'Proveedores', tipo: 'Pasivo' },
  { codigo: '401', nombre: 'Ventas', tipo: 'Ingreso' },
  { codigo: '501', nombre: 'Gastos Operativos', tipo: 'Gasto' }
];

const obtenerFechaHoy = () => {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const crearAsientoDemo = async (fecha, descripcion, lineas) => {
  const asiento = await db.run(
    'INSERT INTO asientos_contables (fecha, descripcion) VALUES (?, ?)',
    [fecha, descripcion]
  );

  for (const linea of lineas) {
    await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, linea.id_cuenta, linea.debe, linea.haber]
    );
  }
};

const ensureDatosInicialesContabilidad = async () => {
  if (!seedContabilidadPromise) {
    seedContabilidadPromise = (async () => {
      const totalAsientosRow = await db.get('SELECT COUNT(*) as total FROM asientos_contables');
      const totalAsientos = Number(totalAsientosRow?.total || 0);

      if (totalAsientos > 0) {
        return;
      }

      for (const cuenta of cuentasDemo) {
        await db.run(
          'INSERT OR IGNORE INTO cuentas_contables (codigo, nombre, tipo) VALUES (?, ?, ?)',
          [cuenta.codigo, cuenta.nombre, cuenta.tipo]
        );
      }

      const cuentas = await db.all('SELECT id_cuenta, codigo FROM cuentas_contables');
      const cuentaPorCodigo = Object.fromEntries(cuentas.map(c => [String(c.codigo), c.id_cuenta]));

      const fecha = obtenerFechaHoy();

      await crearAsientoDemo(fecha, 'Venta al contado', [
        { id_cuenta: cuentaPorCodigo['101'], debe: 15000, haber: 0 },
        { id_cuenta: cuentaPorCodigo['401'], debe: 0, haber: 15000 }
      ]);

      await crearAsientoDemo(fecha, 'Pago a proveedores por transferencia', [
        { id_cuenta: cuentaPorCodigo['201'], debe: 4500, haber: 0 },
        { id_cuenta: cuentaPorCodigo['102'], debe: 0, haber: 4500 }
      ]);

      await crearAsientoDemo(fecha, 'Registro de gasto operativo', [
        { id_cuenta: cuentaPorCodigo['501'], debe: 2200, haber: 0 },
        { id_cuenta: cuentaPorCodigo['101'], debe: 0, haber: 2200 }
      ]);
    })();
  }

  return seedContabilidadPromise;
};

const formatDateParam = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getResumenAsiento = async (idAsiento) => {
  const resumen = await db.get(
    `SELECT
      COALESCE(SUM(m.debe), 0) AS total_debe,
      COALESCE(SUM(m.haber), 0) AS total_haber,
      COUNT(m.id_movimiento) AS total_movimientos
    FROM movimientos_contables m
    WHERE m.id_asiento = ?`,
    [idAsiento]
  );

  const totalDebe = round2(resumen?.total_debe || 0);
  const totalHaber = round2(resumen?.total_haber || 0);
  const diferencia = round2(totalDebe - totalHaber);

  return {
    total_debe: totalDebe,
    total_haber: totalHaber,
    diferencia,
    total_movimientos: Number(resumen?.total_movimientos || 0),
    esta_cuadrado: diferencia === 0
  };
};

const getAsientosConValidacion = async ({ fechaDesde, fechaHasta, montoMin, montoMax, idCuenta }) => {
  const where = [];
  const params = [];

  if (fechaDesde) {
    where.push('date(a.fecha) >= date(?)');
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    where.push('date(a.fecha) <= date(?)');
    params.push(fechaHasta);
  }
  if (idCuenta) {
    where.push(`EXISTS (
      SELECT 1
      FROM movimientos_contables mc
      WHERE mc.id_asiento = a.id_asiento AND mc.id_cuenta = ?
    )`);
    params.push(idCuenta);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const asientos = await db.all(
    `SELECT
      a.id_asiento,
      a.fecha,
      a.descripcion,
      COALESCE(SUM(m.debe), 0) AS total_debe,
      COALESCE(SUM(m.haber), 0) AS total_haber,
      COUNT(m.id_movimiento) AS total_movimientos,
      GROUP_CONCAT(DISTINCT (c.codigo || ' - ' || c.nombre)) AS cuentas
    FROM asientos_contables a
    LEFT JOIN movimientos_contables m ON a.id_asiento = m.id_asiento
    LEFT JOIN cuentas_contables c ON m.id_cuenta = c.id_cuenta
    ${whereClause}
    GROUP BY a.id_asiento, a.fecha, a.descripcion
    ORDER BY date(a.fecha) DESC, a.id_asiento DESC`,
    params
  );

  return asientos
    .map((a) => {
      const totalDebe = round2(a.total_debe);
      const totalHaber = round2(a.total_haber);
      const montoAsiento = round2(Math.max(totalDebe, totalHaber));
      const diferencia = round2(totalDebe - totalHaber);
      return {
        ...a,
        total_debe: totalDebe,
        total_haber: totalHaber,
        monto_asiento: montoAsiento,
        diferencia,
        esta_cuadrado: diferencia === 0,
        cuentas: a.cuentas ? a.cuentas.split(',').filter(Boolean) : []
      };
    })
    .filter((a) => {
      if (montoMin !== null && a.monto_asiento < montoMin) return false;
      if (montoMax !== null && a.monto_asiento > montoMax) return false;
      return true;
    });
};

// ===================== CUENTAS CONTABLES =====================

// GET todas las cuentas
router.get('/cuentas', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const cuentas = await db.all('SELECT * FROM cuentas_contables');
    res.json(cuentas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear cuenta
router.post('/cuentas', async (req, res) => {
  try {
    const { codigo, nombre, tipo } = req.body;
    const result = await db.run(
      'INSERT INTO cuentas_contables (codigo, nombre, tipo) VALUES (?, ?, ?)',
      [codigo, nombre, tipo]
    );
    res.status(201).json({ id: result.id, mensaje: 'Cuenta creada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== ASIENTOS CONTABLES =====================

// GET asientos
router.get('/asientos', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const fechaDesde = formatDateParam(req.query.fechaDesde);
    const fechaHasta = formatDateParam(req.query.fechaHasta);
    const montoMin = req.query.montoMin !== undefined && req.query.montoMin !== ''
      ? Number(req.query.montoMin)
      : null;
    const montoMax = req.query.montoMax !== undefined && req.query.montoMax !== ''
      ? Number(req.query.montoMax)
      : null;
    const idCuenta = req.query.idCuenta ? Number(req.query.idCuenta) : null;

    const asientos = await getAsientosConValidacion({
      fechaDesde,
      fechaHasta,
      montoMin: Number.isFinite(montoMin) ? montoMin : null,
      montoMax: Number.isFinite(montoMax) ? montoMax : null,
      idCuenta: Number.isFinite(idCuenta) ? idCuenta : null
    });

    res.json(asientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET validación de asiento específico
router.get('/asientos/:id/validacion', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const asiento = await db.get('SELECT * FROM asientos_contables WHERE id_asiento = ?', [req.params.id]);
    if (!asiento) {
      return res.status(404).json({ error: 'Asiento no encontrado' });
    }

    const resumen = await getResumenAsiento(req.params.id);
    res.json({ id_asiento: Number(req.params.id), ...resumen });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear asiento
router.post('/asientos', async (req, res) => {
  try {
    const { fecha, descripcion } = req.body;
    const result = await db.run(
      'INSERT INTO asientos_contables (fecha, descripcion) VALUES (?, ?)',
      [fecha, descripcion]
    );
    res.status(201).json({
      id: result.id,
      mensaje: 'Asiento creado',
      validacion: {
        total_debe: 0,
        total_haber: 0,
        diferencia: 0,
        total_movimientos: 0,
        esta_cuadrado: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== MOVIMIENTOS CONTABLES =====================

// GET movimientos
router.get('/movimientos', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const movimientos = await db.all(`
      SELECT m.*, c.codigo, c.nombre as cuenta_nombre, a.descripcion as asiento_desc, a.fecha as asiento_fecha
      FROM movimientos_contables m
      LEFT JOIN cuentas_contables c ON m.id_cuenta = c.id_cuenta
      LEFT JOIN asientos_contables a ON m.id_asiento = a.id_asiento
      ORDER BY date(a.fecha) DESC, m.id_movimiento DESC
    `);
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear movimiento
router.post('/movimientos', async (req, res) => {
  try {
    const { id_asiento, id_cuenta, debe, haber } = req.body;

    const debeNum = Number(debe || 0);
    const haberNum = Number(haber || 0);

    if (!id_asiento || !id_cuenta) {
      return res.status(400).json({ error: 'id_asiento e id_cuenta son requeridos' });
    }

    if ((debeNum > 0 && haberNum > 0) || (debeNum <= 0 && haberNum <= 0)) {
      return res.status(400).json({ error: 'Cada movimiento debe tener valor en Debe o en Haber, pero no en ambos' });
    }

    const asientoExiste = await db.get('SELECT id_asiento FROM asientos_contables WHERE id_asiento = ?', [id_asiento]);
    const cuentaExiste = await db.get('SELECT id_cuenta FROM cuentas_contables WHERE id_cuenta = ?', [id_cuenta]);

    if (!asientoExiste) {
      return res.status(404).json({ error: 'Asiento no encontrado' });
    }

    if (!cuentaExiste) {
      return res.status(404).json({ error: 'Cuenta contable no encontrada' });
    }

    const result = await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [id_asiento, id_cuenta, debeNum, haberNum]
    );

    const resumen = await getResumenAsiento(id_asiento);

    res.status(201).json({
      id: result.id,
      mensaje: resumen.esta_cuadrado
        ? 'Movimiento creado. El asiento está cuadrado.'
        : 'Movimiento creado. El asiento aún no está cuadrado.',
      validacion_asiento: {
        id_asiento: Number(id_asiento),
        ...resumen
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================== REPORTES =====================

// GET balance de cuentas
router.get('/balance', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const balance = await db.all(`
      SELECT c.codigo, c.nombre, c.tipo,
             SUM(COALESCE(m.debe, 0)) as total_debe,
             SUM(COALESCE(m.haber, 0)) as total_haber
      FROM cuentas_contables c
      LEFT JOIN movimientos_contables m ON c.id_cuenta = m.id_cuenta
      GROUP BY c.id_cuenta, c.codigo, c.nombre, c.tipo
    `);
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Estado de Resultados (P&L)
router.get('/reportes/estado-resultados', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const fechaDesde = formatDateParam(req.query.fechaDesde);
    const fechaHasta = formatDateParam(req.query.fechaHasta);

    const where = [];
    const params = [];

    if (fechaDesde) {
      where.push('date(a.fecha) >= date(?)');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      where.push('date(a.fecha) <= date(?)');
      params.push(fechaHasta);
    }

    const whereClause = where.length > 0 ? `AND ${where.join(' AND ')}` : '';

    const cuentas = await db.all(
      `SELECT
        c.id_cuenta,
        c.codigo,
        c.nombre,
        c.tipo,
        COALESCE(SUM(m.debe), 0) AS total_debe,
        COALESCE(SUM(m.haber), 0) AS total_haber
      FROM cuentas_contables c
      LEFT JOIN movimientos_contables m ON c.id_cuenta = m.id_cuenta
      LEFT JOIN asientos_contables a ON m.id_asiento = a.id_asiento
      WHERE LOWER(c.tipo) IN ('ingreso', 'gasto')
      ${whereClause}
      GROUP BY c.id_cuenta, c.codigo, c.nombre, c.tipo
      ORDER BY c.codigo`,
      params
    );

    const ingresos = cuentas
      .filter(c => String(c.tipo || '').toLowerCase() === 'ingreso')
      .map(c => ({
        ...c,
        saldo: round2(Number(c.total_haber || 0) - Number(c.total_debe || 0))
      }));

    const gastos = cuentas
      .filter(c => String(c.tipo || '').toLowerCase() === 'gasto')
      .map(c => ({
        ...c,
        saldo: round2(Number(c.total_debe || 0) - Number(c.total_haber || 0))
      }));

    const totalIngresos = round2(ingresos.reduce((sum, c) => sum + c.saldo, 0));
    const totalGastos = round2(gastos.reduce((sum, c) => sum + c.saldo, 0));
    const utilidadNeta = round2(totalIngresos - totalGastos);

    res.json({
      rango: { fechaDesde, fechaHasta },
      ingresos,
      gastos,
      resumen: {
        total_ingresos: totalIngresos,
        total_gastos: totalGastos,
        utilidad_neta: utilidadNeta
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Balance General automático
router.get('/reportes/balance-general', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const fechaHasta = formatDateParam(req.query.fechaHasta);
    const params = [];

    const filtroFecha = fechaHasta ? 'AND date(a.fecha) <= date(?)' : '';
    if (fechaHasta) params.push(fechaHasta);

    const cuentas = await db.all(
      `SELECT
        c.id_cuenta,
        c.codigo,
        c.nombre,
        c.tipo,
        COALESCE(SUM(m.debe), 0) AS total_debe,
        COALESCE(SUM(m.haber), 0) AS total_haber
      FROM cuentas_contables c
      LEFT JOIN movimientos_contables m ON c.id_cuenta = m.id_cuenta
      LEFT JOIN asientos_contables a ON m.id_asiento = a.id_asiento
      WHERE LOWER(c.tipo) IN ('activo', 'pasivo', 'patrimonio')
      ${filtroFecha}
      GROUP BY c.id_cuenta, c.codigo, c.nombre, c.tipo
      ORDER BY c.codigo`,
      params
    );

    const normalizarCuenta = (c) => {
      const tipo = String(c.tipo || '').toLowerCase();
      let saldo = 0;

      if (tipo === 'activo') {
        saldo = round2(Number(c.total_debe || 0) - Number(c.total_haber || 0));
      } else {
        saldo = round2(Number(c.total_haber || 0) - Number(c.total_debe || 0));
      }

      return { ...c, saldo };
    };

    const activos = cuentas.filter(c => String(c.tipo || '').toLowerCase() === 'activo').map(normalizarCuenta);
    const pasivos = cuentas.filter(c => String(c.tipo || '').toLowerCase() === 'pasivo').map(normalizarCuenta);
    const patrimonio = cuentas.filter(c => String(c.tipo || '').toLowerCase() === 'patrimonio').map(normalizarCuenta);

    const totalActivos = round2(activos.reduce((sum, c) => sum + c.saldo, 0));
    const totalPasivos = round2(pasivos.reduce((sum, c) => sum + c.saldo, 0));
    const totalPatrimonio = round2(patrimonio.reduce((sum, c) => sum + c.saldo, 0));
    const pasivoMasPatrimonio = round2(totalPasivos + totalPatrimonio);

    res.json({
      fecha_hasta: fechaHasta,
      activos,
      pasivos,
      patrimonio,
      resumen: {
        total_activos: totalActivos,
        total_pasivos: totalPasivos,
        total_patrimonio: totalPatrimonio,
        total_pasivo_mas_patrimonio: pasivoMasPatrimonio,
        diferencia_balance: round2(totalActivos - pasivoMasPatrimonio),
        esta_cuadrado: round2(totalActivos - pasivoMasPatrimonio) === 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Flujo de caja mensual (ingresos vs egresos)
router.get('/reportes/flujo-caja-mensual', async (req, res) => {
  try {
    await ensureDatosInicialesContabilidad();
    const anio = Number(req.query.anio) || new Date().getFullYear();

    const rows = await db.all(
      `SELECT
        CAST(strftime('%m', a.fecha) AS INTEGER) AS mes,
        LOWER(c.tipo) AS tipo,
        COALESCE(SUM(m.debe), 0) AS total_debe,
        COALESCE(SUM(m.haber), 0) AS total_haber
      FROM movimientos_contables m
      INNER JOIN cuentas_contables c ON m.id_cuenta = c.id_cuenta
      INNER JOIN asientos_contables a ON m.id_asiento = a.id_asiento
      WHERE CAST(strftime('%Y', a.fecha) AS INTEGER) = ?
        AND LOWER(c.tipo) IN ('ingreso', 'gasto')
      GROUP BY mes, tipo
      ORDER BY mes`,
      [anio]
    );

    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const flujo = meses.map((nombre, index) => ({
      mes_numero: index + 1,
      mes: nombre,
      ingresos: 0,
      egresos: 0,
      neto: 0
    }));

    rows.forEach((r) => {
      const idx = Number(r.mes) - 1;
      if (idx < 0 || idx > 11) return;

      if (r.tipo === 'ingreso') {
        flujo[idx].ingresos += round2(Number(r.total_haber || 0) - Number(r.total_debe || 0));
      } else if (r.tipo === 'gasto') {
        flujo[idx].egresos += round2(Number(r.total_debe || 0) - Number(r.total_haber || 0));
      }
    });

    flujo.forEach((f) => {
      f.ingresos = round2(f.ingresos);
      f.egresos = round2(f.egresos);
      f.neto = round2(f.ingresos - f.egresos);
    });

    res.json({ anio, flujo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
