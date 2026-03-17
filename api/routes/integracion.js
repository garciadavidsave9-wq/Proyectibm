const express = require('express');
const router = express.Router();
const db = require('../database');

const ISV_RATE = 0.15;

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const generarNumeroFactura = async () => {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  const prefijo = `FC${y}${m}${d}`;

  for (let intento = 0; intento < 10; intento += 1) {
    const sufijo = Math.random().toString(36).slice(2, 8).toUpperCase();
    const candidato = `${prefijo}-${sufijo}`;
    const existente = await db.get(
      'SELECT id_factura_compra FROM facturas_compra WHERE numero_factura = ? LIMIT 1',
      [candidato]
    );
    if (!existente) {
      return candidato;
    }
  }

  throw new Error('No se pudo generar un número de factura único');
};

const getOrCreateCuenta = async ({ codigo, nombre, tipo }) => {
  const cuenta = await db.get('SELECT id_cuenta FROM cuentas_contables WHERE codigo = ? LIMIT 1', [codigo]);
  if (cuenta?.id_cuenta) return cuenta.id_cuenta;

  const creada = await db.run(
    'INSERT INTO cuentas_contables (codigo, nombre, tipo) VALUES (?, ?, ?)',
    [codigo, nombre, tipo]
  );

  return creada.id;
};

const getOrCreateCentroCosto = async ({ codigo, nombre, moduloOrigen = 'Soporte' }) => {
  const existente = await db.get(
    'SELECT id_centro_costo FROM centros_de_costo WHERE codigo = ? LIMIT 1',
    [codigo]
  );

  if (existente?.id_centro_costo) {
    return existente.id_centro_costo;
  }

  const creado = await db.run(
    'INSERT INTO centros_de_costo (codigo, nombre, modulo_origen, activo) VALUES (?, ?, ?, ?)',
    [codigo, nombre, moduloOrigen, 1]
  );

  return creado.id;
};

router.get('/compras/proveedores', async (req, res) => {
  try {
    const proveedores = await db.all(
      'SELECT id_cliente, nombre, telefono, email, direccion FROM clientes ORDER BY nombre ASC'
    );

    res.json({ total: proveedores.length, proveedores });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/compras/facturas', async (req, res) => {
  await db.run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const {
      id_proveedor,
      fecha_factura,
      fecha_vencimiento,
      items,
      usuario = 'Sistema'
    } = req.body || {};

    if (!Number.isFinite(Number(id_proveedor))) {
      return res.status(400).json({ error: 'id_proveedor es requerido' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos un ítem de compra' });
    }

    const proveedor = await db.get('SELECT id_cliente, nombre FROM clientes WHERE id_cliente = ?', [id_proveedor]);
    if (!proveedor) {
      return res.status(404).json({ error: 'Proveedor no encontrado en tabla clientes' });
    }

    const numeroFacturaGenerado = await generarNumeroFactura();

    let subtotal = 0;

    const factura = await db.run(
      `INSERT INTO facturas_compra (numero_factura, id_proveedor, fecha_factura, subtotal, isv, total, estado)
       VALUES (?, ?, ?, 0, 0, 0, 'Registrada')`,
      [numeroFacturaGenerado, Number(id_proveedor), fecha_factura || new Date().toISOString().slice(0, 10)]
    );

    for (const item of items) {
      const idItem = Number(item.id_item);
      const cantidad = Number(item.cantidad || 0);
      const precioUnitario = Number(item.precio_unitario || 0);

      if (!Number.isFinite(idItem) || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error('Ítem inválido en detalle de compra');
      }

      const inventario = await db.get(
        `SELECT id_item, precio, COALESCE(stock_actual, numero_partes, 0) AS stock_actual
         FROM item_master WHERE id_item = ? LIMIT 1`,
        [idItem]
      );

      if (!inventario) {
        throw new Error(`No existe id_item=${idItem} en inventario`);
      }

      const precio = Number.isFinite(precioUnitario) && precioUnitario > 0
        ? precioUnitario
        : Number(inventario.precio || 0);

      const baseLinea = round2(precio * cantidad);
      const isvLinea = round2(baseLinea * ISV_RATE);
      const totalLinea = round2(baseLinea + isvLinea);

      await db.run(
        `INSERT INTO detalles_compra
         (id_factura_compra, id_item, cantidad, precio_unitario, base_linea, isv_linea, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [factura.id, idItem, cantidad, precio, baseLinea, isvLinea, totalLinea]
      );

      await db.run(
        'UPDATE item_master SET stock_actual = ? WHERE id_item = ?',
        [round2(Number(inventario.stock_actual || 0) + cantidad), idItem]
      );

      subtotal = round2(subtotal + baseLinea);
    }

    const isv = round2(subtotal * ISV_RATE);
    const total = round2(subtotal + isv);

    const cxp = await db.run(
      `INSERT INTO cuentas_por_pagar
       (id_cliente, id_factura_compra, monto_total, saldo_pendiente, fecha_vencimiento, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Number(id_proveedor), factura.id, total, total, fecha_vencimiento || null, 'Pendiente']
    );

    await db.run(
      'UPDATE facturas_compra SET subtotal = ?, isv = ?, total = ?, id_cuenta_por_pagar = ? WHERE id_factura_compra = ?',
      [subtotal, isv, total, cxp.id, factura.id]
    );

    const idCuentaCompras = await getOrCreateCuenta({ codigo: '601', nombre: 'Compras de Repuestos', tipo: 'Gasto' });
    const idCuentaISVCredito = await getOrCreateCuenta({ codigo: '105', nombre: 'ISV Crédito Fiscal', tipo: 'Activo' });
    const idCuentaCXP = await getOrCreateCuenta({ codigo: '201', nombre: 'Cuentas por Pagar Proveedores', tipo: 'Pasivo' });

    const asiento = await db.run(
      `INSERT INTO asientos_contables
       (fecha, descripcion, referencia_modulo, referencia_id)
       VALUES (date('now'), ?, ?, ?)`,
      [`Factura compra ${numeroFacturaGenerado} - ${proveedor.nombre}`, 'Compras', factura.id]
    );

    await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaCompras, subtotal, 0]
    );

    await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaISVCredito, isv, 0]
    );

    await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaCXP, 0, total]
    );

    await db.run(
      'INSERT INTO asientos (id_factura_compra, id_asiento_contable, tipo_origen) VALUES (?, ?, ?)',
      [factura.id, asiento.id, 'MM-FI-Compra']
    );

    await db.run('COMMIT');

    res.status(201).json({
      mensaje: 'Factura de compra registrada',
      factura: {
        id_factura_compra: factura.id,
        numero_factura: numeroFacturaGenerado,
        id_proveedor: Number(id_proveedor),
        subtotal,
        isv,
        total,
        id_cuenta_por_pagar: cxp.id,
        id_asiento_contable: asiento.id,
        usuario
      }
    });
  } catch (error) {
    try {
      await db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error en rollback compras:', rollbackError.message);
    }

    res.status(500).json({ error: error.message });
  }
});

const liquidarOrden = async ({ ordenId, horasTrabajadas = 1, centroCosto = 'Mantenimiento', usuario = 'Sistema' }) => {
  await db.run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const orden = await db.get(
      'SELECT * FROM ordenes_trabajo WHERE id_ot = ? LIMIT 1',
      [ordenId]
    );

    if (!orden) {
      throw new Error('Orden de trabajo no encontrada');
    }

    const materiales = await db.all(
      `SELECT om.*, im.item_id, im.descripcion
       FROM ordenes_trabajo_materiales om
       INNER JOIN item_master im ON im.id_item = om.id_item
       WHERE om.id_ot = ?`,
      [ordenId]
    );

    const costoRepuestos = round2(
      materiales.reduce((acc, material) => acc + (Number(material.cantidad || 0) * Number(material.precio_unitario || 0)), 0)
    );

    let costoHora = 0;
    if (orden.id_usuario) {
      const empleado = await db.get(
        'SELECT salario FROM empleados_rrhh WHERE id_usuario = ? LIMIT 1',
        [orden.id_usuario]
      );

      if (empleado?.salario) {
        costoHora = round2(Number(empleado.salario) / 160);
      }
    }

    const costoManoObra = round2(Number(horasTrabajadas || 0) * Number(costoHora || 0));
    const totalLiquidacion = round2(costoRepuestos + costoManoObra);

    const codigoCentro = String(centroCosto || 'Mantenimiento').toUpperCase().replace(/\s+/g, '_');
    const idCentroCosto = await getOrCreateCentroCosto({
      codigo: codigoCentro,
      nombre: String(centroCosto || 'Mantenimiento'),
      moduloOrigen: 'Soporte'
    });

    const idCuentaGasto = await getOrCreateCuenta({ codigo: '501', nombre: 'Gastos Operativos', tipo: 'Gasto' });
    const idCuentaInventario = await getOrCreateCuenta({ codigo: '103', nombre: 'Inventario de Repuestos', tipo: 'Activo' });
    const idCuentaManoObra = await getOrCreateCuenta({ codigo: '202', nombre: 'Sueldos por Pagar', tipo: 'Pasivo' });

    const asiento = await db.run(
      `INSERT INTO asientos_contables
       (fecha, descripcion, referencia_modulo, referencia_id, id_centro_costo)
       VALUES (date('now'), ?, ?, ?, ?)`,
      [`Liquidación OT ${orden.folio_ot || ordenId}`, 'SoporteOT', ordenId, idCentroCosto]
    );

    await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaGasto, totalLiquidacion, 0]
    );

    if (costoRepuestos > 0) {
      await db.run(
        'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
        [asiento.id, idCuentaInventario, 0, costoRepuestos]
      );
    }

    if (costoManoObra > 0) {
      await db.run(
        'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
        [asiento.id, idCuentaManoObra, 0, costoManoObra]
      );
    }

    await db.run(
      `UPDATE ordenes_trabajo
       SET estado_liquidacion = 'Liquidada',
           costo_total_liquidacion = ?,
           id_centro_costo = ?
       WHERE id_ot = ?`,
      [totalLiquidacion, idCentroCosto, ordenId]
    );

    await db.run('COMMIT');

    return {
      id_ot: Number(ordenId),
      centro_costo: centroCosto,
      id_centro_costo: idCentroCosto,
      horas_trabajadas: Number(horasTrabajadas || 0),
      costo_hora_empleado: costoHora,
      costo_repuestos: costoRepuestos,
      costo_mano_obra: costoManoObra,
      total_liquidacion: totalLiquidacion,
      id_asiento_contable: asiento.id,
      usuario
    };
  } catch (error) {
    try {
      await db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error en rollback liquidarOrden:', rollbackError.message);
    }
    throw error;
  }
};

router.post('/ordenes-trabajo/:id/liquidar', async (req, res) => {
  try {
    const resultado = await liquidarOrden({
      ordenId: Number(req.params.id),
      horasTrabajadas: Number(req.body?.horas_trabajadas || 1),
      centroCosto: req.body?.centro_costo || 'Mantenimiento',
      usuario: req.body?.usuario || 'Sistema'
    });

    res.json({ mensaje: 'Orden de trabajo liquidada', liquidacion: resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cashflow/proyeccion', async (req, res) => {
  try {
    const hoy = new Date();
    const mes = Number(req.query.mes || hoy.getMonth() + 1);
    const anio = Number(req.query.anio || hoy.getFullYear());

    const cxc = await db.get(
      `SELECT COALESCE(SUM(saldo_pendiente), 0) AS total
       FROM cuentas_por_cobrar
       WHERE estado IN ('Pendiente', 'Parcial')`
    );

    const cxp = await db.get(
      `SELECT COALESCE(SUM(saldo_pendiente), 0) AS total
       FROM cuentas_por_pagar
       WHERE estado IN ('Pendiente', 'Parcial')`
    );

    const nomina = await db.get(
      `SELECT COALESCE(SUM(total_pago), 0) AS total
       FROM planilla
       WHERE mes = ? AND anio = ?`,
      [mes, anio]
    );

    const totalCxc = round2(cxc?.total || 0);
    const totalCxp = round2(cxp?.total || 0);
    const totalNomina = round2(nomina?.total || 0);
    const liquidezProyectada = round2(totalCxc - totalCxp - totalNomina);

    res.json({
      periodo: { mes, anio },
      cuentas_por_cobrar: totalCxc,
      cuentas_por_pagar: totalCxp,
      nomina_mes: totalNomina,
      liquidez_proyectada: liquidezProyectada
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auditoria/logs', async (req, res) => {
  try {
    const logs = await db.all(
      `SELECT * FROM logs_auditoria
       ORDER BY datetime(fecha) DESC, id_log DESC
       LIMIT 500`
    );

    res.json({ total: logs.length, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  liquidarOrden
};
