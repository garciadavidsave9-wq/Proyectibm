const db = require('../database');

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getOrCreateCuenta = async ({ codigo, nombre, tipo }) => {
  const existente = await db.get('SELECT id_cuenta FROM cuentas_contables WHERE codigo = ? LIMIT 1', [codigo]);
  if (existente?.id_cuenta) return existente.id_cuenta;

  const creada = await db.run(
    'INSERT INTO cuentas_contables (codigo, nombre, tipo) VALUES (?, ?, ?)',
    [codigo, nombre, tipo]
  );

  return creada.id;
};

const calcularCostoHoraEmpleado = async (idTecnico, costoHoraOverride = null) => {
  if (Number.isFinite(Number(costoHoraOverride)) && Number(costoHoraOverride) >= 0) {
    return round2(Number(costoHoraOverride));
  }

  if (!idTecnico) return 0;

  const tecnico = await db.get('SELECT id_usuario FROM tecnicos WHERE id_tecnico = ? LIMIT 1', [idTecnico]);
  if (!tecnico?.id_usuario) return 0;

  const empleado = await db.get(
    'SELECT salario FROM empleados_rrhh WHERE id_usuario = ? LIMIT 1',
    [tecnico.id_usuario]
  );

  const salario = Number(empleado?.salario || 0);
  if (!Number.isFinite(salario) || salario <= 0) return 0;

  return round2(salario / 160);
};

const registrarMovimiento261 = async ({ idTicket, materiales }) => {
  const movimientos = [];
  let costoMateriales = 0;

  for (const material of materiales) {
    const idItem = Number(material.id_item);
    const cantidad = Number(material.cantidad || 0);

    if (!Number.isFinite(idItem) || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('Material inválido en ticket_materiales');
    }

    const item = await db.get(
      `SELECT id_item, item_id, descripcion, precio, COALESCE(stock_actual, numero_partes, 0) AS stock_actual
       FROM item_master WHERE id_item = ? LIMIT 1`,
      [idItem]
    );

    if (!item) {
      throw new Error(`Material con id_item=${idItem} no existe en Item Master`);
    }

    const stockActual = Number(item.stock_actual || 0);
    if (stockActual < cantidad) {
      throw new Error(`Stock insuficiente para ${item.item_id}. Disponible: ${stockActual}, solicitado: ${cantidad}`);
    }

    const precioUnitario = round2(material.precio_unitario_snapshot ?? item.precio ?? 0);
    const costoTotal = round2(precioUnitario * cantidad);

    await db.run(
      'UPDATE item_master SET stock_actual = ? WHERE id_item = ?',
      [round2(stockActual - cantidad), idItem]
    );

    const movimiento = await db.run(
      `INSERT INTO movimientos_mercancia
       (id_ticket, id_item, movement_type, cantidad, precio_unitario, costo_total, referencia_documento)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idTicket, idItem, '261', cantidad, precioUnitario, costoTotal, `TICKET-${idTicket}`]
    );

    movimientos.push({
      id_movimiento_mercancia: movimiento.id,
      id_item: item.id_item,
      item_id: item.item_id,
      descripcion: item.descripcion,
      movement_type: '261',
      cantidad: cantidad,
      precio_unitario: precioUnitario,
      costo_total: costoTotal,
      stock_restante: round2(stockActual - cantidad)
    });

    costoMateriales = round2(costoMateriales + costoTotal);
  }

  return { movimientos, costoMateriales };
};

const crearAsientoIntegracionTicket = async ({
  idTicket,
  costoMateriales,
  horasTicket,
  costoHoraEmpleado,
  idCentroCosto = null
}) => {
  const costoManoObra = round2((Number(horasTicket || 0) * Number(costoHoraEmpleado || 0)));
  const costoTotal = round2(costoMateriales + costoManoObra);

  if (costoTotal <= 0) {
    return {
      id_asiento: null,
      costo_materiales: costoMateriales,
      costo_mano_obra: costoManoObra,
      costo_total: costoTotal,
      movimientos_contables: []
    };
  }

  const idCuentaGasto = await getOrCreateCuenta({ codigo: '501', nombre: 'Gastos Operativos', tipo: 'Gasto' });
  const idCuentaInventario = await getOrCreateCuenta({ codigo: '103', nombre: 'Inventario de Repuestos', tipo: 'Activo' });
  const idCuentaManoObra = await getOrCreateCuenta({ codigo: '202', nombre: 'Sueldos por Pagar', tipo: 'Pasivo' });

  const asiento = await db.run(
    'INSERT INTO asientos_contables (fecha, descripcion, referencia_modulo, referencia_id, id_centro_costo) VALUES (date("now"), ?, ?, ?, ?)',
    [`Consumo ticket ${idTicket} (MM 261 + FI/CO)`, 'Soporte', idTicket, idCentroCosto]
  );

  const movimientosContables = [];

  const lineaDebe = await db.run(
    'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
    [asiento.id, idCuentaGasto, costoTotal, 0]
  );
  movimientosContables.push({ id_movimiento: lineaDebe.id, id_cuenta: idCuentaGasto, debe: costoTotal, haber: 0 });

  if (costoMateriales > 0) {
    const lineaHaberInventario = await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaInventario, 0, costoMateriales]
    );
    movimientosContables.push({ id_movimiento: lineaHaberInventario.id, id_cuenta: idCuentaInventario, debe: 0, haber: costoMateriales });
  }

  if (costoManoObra > 0) {
    const lineaHaberManoObra = await db.run(
      'INSERT INTO movimientos_contables (id_asiento, id_cuenta, debe, haber) VALUES (?, ?, ?, ?)',
      [asiento.id, idCuentaManoObra, 0, costoManoObra]
    );
    movimientosContables.push({ id_movimiento: lineaHaberManoObra.id, id_cuenta: idCuentaManoObra, debe: 0, haber: costoManoObra });
  }

  return {
    id_asiento: asiento.id,
    costo_materiales: costoMateriales,
    costo_mano_obra: costoManoObra,
    costo_total: costoTotal,
    movimientos_contables: movimientosContables
  };
};

const procesarCierreTicketSAP = async ({ idTicket, idTecnico, horasTicket = 0, costoHoraEmpleado = null, idCentroCosto = null }) => {
  await db.run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const materiales = await db.all(
      `SELECT tm.id_item, tm.cantidad, tm.precio_unitario_snapshot
       FROM ticket_materiales tm
       WHERE tm.id_ticket = ?`,
      [idTicket]
    );

    const costoHora = await calcularCostoHoraEmpleado(idTecnico, costoHoraEmpleado);
    const movimientoMM = await registrarMovimiento261({ idTicket, materiales });

    const asientoFI = await crearAsientoIntegracionTicket({
      idTicket,
      costoMateriales: movimientoMM.costoMateriales,
      horasTicket,
      costoHoraEmpleado: costoHora,
      idCentroCosto
    });

    await db.run(
      'UPDATE tickets SET horas_ticket = ?, costo_hora_empleado = ?, costo_total_ticket = ? WHERE id_ticket = ?',
      [
        Number(horasTicket || 0),
        costoHora,
        Number(asientoFI?.costo_total || 0),
        idTicket
      ]
    );

    await db.run('COMMIT');

    return {
      movement_type: '261',
      ticket_id: idTicket,
      horas_ticket: Number(horasTicket || 0),
      costo_hora_empleado: costoHora,
      movimientos_mercancia: movimientoMM.movimientos,
      asiento_contable: asientoFI
    };
  } catch (error) {
    try {
      await db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error en rollback de integración SAP:', rollbackError.message);
    }
    throw error;
  }
};

module.exports = {
  procesarCierreTicketSAP
};
