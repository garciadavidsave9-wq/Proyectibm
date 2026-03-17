const express = require('express');
const router = express.Router();
const db = require('../database');
const { registrarAuditoria } = require('../services/auditoria');

const UNIDADES_PERMITIDAS = ['Unidad', 'PK', 'Par'];

const normalizarUnidad = (unidad) => {
  const value = String(unidad || '').trim();
  return UNIDADES_PERMITIDAS.includes(value) ? value : 'Unidad';
};

const generarSiguienteItemId = async () => {
  const row = await db.get(
    `SELECT item_id
     FROM item_master
     WHERE item_id LIKE '91G%'
     ORDER BY CAST(SUBSTR(item_id, 4) AS INTEGER) DESC
     LIMIT 1`
  );

  const correlativoActual = row?.item_id
    ? Number(String(row.item_id).replace('91G', ''))
    : 0;

  const siguiente = Number.isFinite(correlativoActual) ? correlativoActual + 1 : 1;
  return `91G${String(siguiente).padStart(3, '0')}`;
};

const validarPayload = ({ item_id, descripcion, numero_partes, proveedor, precio, unidad_medida, stock_actual }, { exigirItemId = false } = {}) => {
  if (exigirItemId && (!item_id || !String(item_id).trim())) {
    return 'El item_id es obligatorio';
  }

  if (!descripcion || !String(descripcion).trim()) {
    return 'La descripción es obligatoria';
  }

  const numeroPartes = Number(numero_partes);
  if (!Number.isInteger(numeroPartes) || numeroPartes < 1) {
    return 'El número de partes debe ser un entero mayor a 0';
  }

  if (!proveedor || !String(proveedor).trim()) {
    return 'El proveedor es obligatorio';
  }

  const precioNum = Number(precio);
  if (!Number.isFinite(precioNum) || precioNum < 0) {
    return 'El precio debe ser un número mayor o igual a 0';
  }

  if (stock_actual !== undefined) {
    const stockNum = Number(stock_actual);
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      return 'El stock debe ser un número mayor o igual a 0';
    }
  }

  const unidadNormalizada = normalizarUnidad(unidad_medida);
  if (unidad_medida && !UNIDADES_PERMITIDAS.includes(String(unidad_medida).trim()) && unidadNormalizada === 'Unidad') {
    return 'Unidad de medida inválida';
  }

  return null;
};

// GET listado completo
router.get('/item-master', async (req, res) => {
  try {
    const items = await db.all(
      `SELECT id_item, item_id, descripcion, numero_partes, proveedor, precio, COALESCE(stock_actual, 0) AS stock_actual, unidad_medida, fecha_creacion
       FROM item_master
       ORDER BY id_item DESC`
    );
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/item-master-disponible', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const items = await db.all(
      `SELECT id_item, item_id, descripcion, proveedor, precio, COALESCE(stock_actual, 0) AS stock_actual, unidad_medida
       FROM item_master
       WHERE COALESCE(stock_actual, 0) > 0
       ORDER BY descripcion ASC`
    );

    const filtrados = q
      ? items.filter((item) =>
          String(item.descripcion || '').toLowerCase().includes(q) ||
          String(item.item_id || '').toLowerCase().includes(q)
        )
      : items;

    res.json({
      total: filtrados.length,
      items: filtrados
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET item por ID interno
router.get('/item-master/:id', async (req, res) => {
  try {
    const item = await db.get(
      `SELECT id_item, item_id, descripcion, numero_partes, proveedor, precio, COALESCE(stock_actual, 0) AS stock_actual, unidad_medida, fecha_creacion
       FROM item_master
       WHERE id_item = ?`,
      [req.params.id]
    );

    if (!item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear item
router.post('/item-master', async (req, res) => {
  try {
    const payload = req.body || {};
    const errorValidacion = validarPayload(payload, { exigirItemId: false });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const itemIdFinal = payload.item_id && String(payload.item_id).trim()
      ? String(payload.item_id).trim()
      : await generarSiguienteItemId();

    const result = await db.run(
      `INSERT INTO item_master (item_id, descripcion, numero_partes, proveedor, precio, stock_actual, unidad_medida)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        itemIdFinal,
        String(payload.descripcion).trim(),
        Number(payload.numero_partes),
        String(payload.proveedor).trim(),
        Number(payload.precio),
        payload.stock_actual !== undefined ? Number(payload.stock_actual) : Number(payload.numero_partes),
        normalizarUnidad(payload.unidad_medida)
      ]
    );

    const nuevoItem = await db.get(
      `SELECT id_item, item_id, descripcion, numero_partes, proveedor, precio, COALESCE(stock_actual, 0) AS stock_actual, unidad_medida, fecha_creacion
       FROM item_master
       WHERE id_item = ?`,
      [result.id]
    );

    res.status(201).json({ mensaje: 'Item creado', item: nuevoItem });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE constraint failed: item_master.item_id')) {
      return res.status(409).json({ error: 'El item_id ya existe' });
    }

    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar item
router.put('/item-master/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const errorValidacion = validarPayload(payload, { exigirItemId: true });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const itemActual = await db.get('SELECT id_item, precio FROM item_master WHERE id_item = ?', [req.params.id]);
    if (!itemActual) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const result = await db.run(
      `UPDATE item_master
       SET item_id = ?, descripcion = ?, numero_partes = ?, proveedor = ?, precio = ?, stock_actual = ?, unidad_medida = ?
       WHERE id_item = ?`,
      [
        String(payload.item_id).trim(),
        String(payload.descripcion).trim(),
        Number(payload.numero_partes),
        String(payload.proveedor).trim(),
        Number(payload.precio),
        payload.stock_actual !== undefined ? Number(payload.stock_actual) : Number(payload.numero_partes),
        normalizarUnidad(payload.unidad_medida),
        req.params.id
      ]
    );

    if (!result.changes) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const precioAnterior = Number(itemActual.precio || 0);
    const precioNuevo = Number(payload.precio || 0);
    if (precioAnterior !== precioNuevo) {
      await registrarAuditoria({
        entidad: 'item_master',
        idRegistro: Number(req.params.id),
        campo: 'precio',
        valorAnterior: String(precioAnterior),
        valorNuevo: String(precioNuevo),
        usuario: String(req.body?.usuario || 'Sistema')
      });
    }

    res.json({ mensaje: 'Item actualizado' });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE constraint failed: item_master.item_id')) {
      return res.status(409).json({ error: 'El item_id ya existe' });
    }

    res.status(500).json({ error: error.message });
  }
});

// DELETE item
router.delete('/item-master/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM item_master WHERE id_item = ?', [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    res.json({ mensaje: 'Item eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
