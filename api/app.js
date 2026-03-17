const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const soporteRoutes = require('./routes/soporte');
const db = require('./database');
const rrhhRoutes = require('./routes/rrhh');
const contabilidadRoutes = require('./routes/contabilidad');
const inventarioRoutes = require('./routes/inventario');
const { router: integracionRoutes } = require('./routes/integracion');

const app = express();

const runSafeMigration = async (sql) => {
  try {
    await db.run(sql);
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }
};

const ensureOrdenesTrabajoSchema = async () => {
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

  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN descripcion_problema TEXT');
  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN diagnostico_tecnico TEXT');
  await runSafeMigration("ALTER TABLE ordenes_trabajo ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'Media'");
  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN celular_solicitante TEXT');
  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN ubicacion_problema TEXT');

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
};

const ensureSAPIntegrationSchema = async () => {
  await runSafeMigration('ALTER TABLE item_master ADD COLUMN stock_actual REAL DEFAULT 0');

  await runSafeMigration('ALTER TABLE tickets ADD COLUMN horas_ticket REAL DEFAULT 0');
  await runSafeMigration('ALTER TABLE tickets ADD COLUMN costo_hora_empleado REAL DEFAULT 0');
  await runSafeMigration('ALTER TABLE tickets ADD COLUMN costo_total_ticket REAL DEFAULT 0');

  await db.run(`
    CREATE TABLE IF NOT EXISTS centros_de_costo (
      id_centro_costo INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      modulo_origen TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS ticket_materiales (
      id_ticket_material INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ticket INTEGER NOT NULL,
      id_item INTEGER NOT NULL,
      cantidad REAL NOT NULL CHECK (cantidad > 0),
      precio_unitario_snapshot REAL NOT NULL DEFAULT 0,
      id_centro_costo INTEGER,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket) ON DELETE CASCADE,
      FOREIGN KEY (id_item) REFERENCES item_master(id_item),
      FOREIGN KEY (id_centro_costo) REFERENCES centros_de_costo(id_centro_costo),
      UNIQUE (id_ticket, id_item)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS movimientos_mercancia (
      id_movimiento_mercancia INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ticket INTEGER NOT NULL,
      id_item INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      cantidad REAL NOT NULL CHECK (cantidad > 0),
      precio_unitario REAL NOT NULL DEFAULT 0,
      costo_total REAL NOT NULL DEFAULT 0,
      referencia_documento TEXT,
      fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket),
      FOREIGN KEY (id_item) REFERENCES item_master(id_item)
    )
  `);

  const totalMovimientos = await db.get('SELECT COUNT(*) AS total FROM movimientos_mercancia');
  if (Number(totalMovimientos?.total || 0) === 0) {
    await db.run('UPDATE item_master SET stock_actual = numero_partes WHERE stock_actual = 0');
  }

  await runSafeMigration('ALTER TABLE asientos_contables ADD COLUMN referencia_modulo TEXT');
  await runSafeMigration('ALTER TABLE asientos_contables ADD COLUMN referencia_id INTEGER');
  await runSafeMigration('ALTER TABLE asientos_contables ADD COLUMN id_centro_costo INTEGER');

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_ticket_materiales_ticket
    ON ticket_materiales(id_ticket)
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS facturas_compra (
      id_factura_compra INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_factura TEXT NOT NULL UNIQUE,
      id_proveedor INTEGER NOT NULL,
      fecha_factura DATE NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      isv REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Registrada',
      id_cuenta_por_pagar INTEGER,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_proveedor) REFERENCES clientes(id_cliente),
      FOREIGN KEY (id_cuenta_por_pagar) REFERENCES cuentas_por_pagar(id_cxp)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS detalles_compra (
      id_detalle_compra INTEGER PRIMARY KEY AUTOINCREMENT,
      id_factura_compra INTEGER NOT NULL,
      id_item INTEGER NOT NULL,
      cantidad REAL NOT NULL CHECK (cantidad > 0),
      precio_unitario REAL NOT NULL DEFAULT 0,
      base_linea REAL NOT NULL DEFAULT 0,
      isv_linea REAL NOT NULL DEFAULT 0,
      total_linea REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (id_factura_compra) REFERENCES facturas_compra(id_factura_compra) ON DELETE CASCADE,
      FOREIGN KEY (id_item) REFERENCES item_master(id_item)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
      id_cxp INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cliente INTEGER NOT NULL,
      id_factura_compra INTEGER,
      monto_total REAL NOT NULL DEFAULT 0,
      saldo_pendiente REAL NOT NULL DEFAULT 0,
      fecha_vencimiento DATE,
      estado TEXT NOT NULL DEFAULT 'Pendiente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
      FOREIGN KEY (id_factura_compra) REFERENCES facturas_compra(id_factura_compra)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
      id_cxc INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cliente INTEGER NOT NULL,
      referencia TEXT,
      monto_total REAL NOT NULL DEFAULT 0,
      saldo_pendiente REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Pendiente',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS asientos (
      id_asiento_link INTEGER PRIMARY KEY AUTOINCREMENT,
      id_factura_compra INTEGER,
      id_asiento_contable INTEGER NOT NULL,
      tipo_origen TEXT NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_factura_compra) REFERENCES facturas_compra(id_factura_compra),
      FOREIGN KEY (id_asiento_contable) REFERENCES asientos_contables(id_asiento)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS logs_auditoria (
      id_log INTEGER PRIMARY KEY AUTOINCREMENT,
      entidad TEXT NOT NULL,
      id_registro INTEGER NOT NULL,
      campo TEXT NOT NULL,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      usuario TEXT NOT NULL DEFAULT 'Sistema',
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runSafeMigration("ALTER TABLE ordenes_trabajo ADD COLUMN estado_liquidacion TEXT DEFAULT 'Pendiente'");
  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN costo_total_liquidacion REAL DEFAULT 0');
  await runSafeMigration('ALTER TABLE ordenes_trabajo ADD COLUMN id_centro_costo INTEGER');

  await runSafeMigration('ALTER TABLE planilla ADD COLUMN pagada INTEGER DEFAULT 0');
  await runSafeMigration('ALTER TABLE planilla ADD COLUMN fecha_pago DATETIME');

  await db.run('CREATE INDEX IF NOT EXISTS idx_detalles_compra_factura ON detalles_compra(id_factura_compra)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_cxp_cliente ON cuentas_por_pagar(id_cliente)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_logs_auditoria_entidad ON logs_auditoria(entidad, id_registro)');
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ mensaje: 'API ERP activa', version: '1.0', endpoint: '/api/health' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'API activa', version: '1.0' });
});

// Migraciones de arranque
Promise.resolve()
  .then(() => runSafeMigration("ALTER TABLE usuarios ADD COLUMN estado VARCHAR(50) DEFAULT 'pendiente'"))
  .then(() => db.run("UPDATE usuarios SET estado='pendiente' WHERE estado IS NULL").catch(() => {}))
  .then(() => ensureOrdenesTrabajoSchema())
  .then(() => ensureSAPIntegrationSchema())
  .then(() => {
    console.log('✓ Migraciones de BD aplicadas');
  })
  .catch((error) => {
    console.error('Error en migraciones de BD:', error.message);
  });

// Rutas
app.use('/api/soporte', soporteRoutes);
app.use('/api/rrhh', rrhhRoutes);
app.use('/api/contabilidad', contabilidadRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/integracion', integracionRoutes);

// Manejo de errores - DEBE IR AL FINAL
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, 'localhost', () => {
  console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`✓ CORS habilitado`);
});
