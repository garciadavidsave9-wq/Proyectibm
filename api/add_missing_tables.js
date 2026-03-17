const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'erpdb.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar:', err);
    process.exit(1);
  }
});

const sqlFaltante = `
-- Roles de usuario
CREATE TABLE IF NOT EXISTS roles (
    id_rol INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

-- SLA
CREATE TABLE IF NOT EXISTS slas (
    id_sla INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tiempo_respuesta INTEGER NOT NULL,
    tiempo_resolucion INTEGER,
    prioridad TEXT
);

-- Comentarios en tickets
CREATE TABLE IF NOT EXISTS comentarios_tickets (
    id_comentario INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ticket INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

-- Adjuntos en tickets
CREATE TABLE IF NOT EXISTS adjuntos_tickets (
    id_adjunto INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ticket INTEGER NOT NULL,
    nombre_archivo TEXT NOT NULL,
    ruta_archivo TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket)
);

-- Ausencias
CREATE TABLE IF NOT EXISTS ausencias (
    id_ausencia INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER NOT NULL,
    fecha_inicio DATE,
    fecha_fin DATE,
    descripcion_motivo TEXT,
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);

-- Descuentos RRHH
CREATE TABLE IF NOT EXISTS descuentos_rrhh (
    id_descuento INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER NOT NULL,
    concepto TEXT,
    monto DECIMAL(10,2),
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);

-- Encuestas
CREATE TABLE IF NOT EXISTS encuestas (
    id_encuesta INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    apreciacion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

-- Inventario: Item Master
CREATE TABLE IF NOT EXISTS item_master (
  id_item INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  numero_partes INTEGER NOT NULL CHECK (numero_partes > 0),
  proveedor TEXT NOT NULL,
  precio DECIMAL(12,2) NOT NULL CHECK (precio >= 0),
  unidad_medida TEXT NOT NULL CHECK (unidad_medida IN ('Unidad', 'PK', 'Par')),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(sqlFaltante, (err) => {
  if (err) {
    console.error('Error creando tablas:', err);
    process.exit(1);
  }

  db.run('ALTER TABLE empleados_rrhh ADD COLUMN id_usuario INTEGER', (alterErr) => {
    if (alterErr && !String(alterErr.message || '').includes('duplicate column name')) {
      console.error('Error agregando columna id_usuario a empleados_rrhh:', alterErr.message);
      process.exit(1);
    }

    console.log('✓ Columna verificada en empleados_rrhh: id_usuario');

    db.close();
    console.log('\n✓ Base de datos actualizada correctamente');
  });
  
  console.log('✓ Tablas creadas exitosamente:');
  console.log('  - roles');
  console.log('  - slas');
  console.log('  - comentarios_tickets');
  console.log('  - adjuntos_tickets');
  console.log('  - ausencias');
  console.log('  - descuentos_rrhh');
  console.log('  - encuestas');
  console.log('  - item_master');
});
