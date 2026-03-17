const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'erpdb.db');

// Eliminar BD anterior si existe
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Base de datos anterior eliminada');
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log('✓ Base de datos creada');
});

const sql = `
-- 1. Tablas de Soporte y Estructura Organizativa
CREATE TABLE IF NOT EXISTS areas_soporte (
    id_area INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol VARCHAR(50),
    estado VARCHAR(50) DEFAULT 'pendiente',
    id_area INTEGER,
    FOREIGN KEY (id_area) REFERENCES areas_soporte(id_area)
);

-- 2. Gestión de Tickets y Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT
);

CREATE TABLE IF NOT EXISTS categorias_tickets (
    id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS subcategorias_tickets (
    id_subcategoria INTEGER PRIMARY KEY AUTOINCREMENT,
    id_categoria INTEGER,
    nombre VARCHAR(100),
    FOREIGN KEY (id_categoria) REFERENCES categorias_tickets(id_categoria)
);

CREATE TABLE IF NOT EXISTS estados_tickets (
    id_estado INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS tecnicos (
    id_tecnico INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER,
    especialidad VARCHAR(100),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE IF NOT EXISTS tickets (
    id_ticket INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo VARCHAR(150),
    descripcion TEXT,
    id_cliente INTEGER,
    id_tecnico INTEGER,
    id_subcategoria INTEGER,
    id_estado INTEGER,
    horas_ticket REAL DEFAULT 0,
    costo_hora_empleado REAL DEFAULT 0,
    costo_total_ticket REAL DEFAULT 0,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id_tecnico),
    FOREIGN KEY (id_subcategoria) REFERENCES subcategorias_tickets(id_subcategoria),
    FOREIGN KEY (id_estado) REFERENCES estados_tickets(id_estado)
);

-- 3. Recursos Humanos (RRHH)
CREATE TABLE IF NOT EXISTS empleados_rrhh (
    id_empleado INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    puesto VARCHAR(100),
    salario DECIMAL(10,2),
    fecha_ingreso DATE,
    id_usuario INTEGER,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE IF NOT EXISTS asistencia (
    id_asistencia INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER,
    fecha DATE,
    hora_entrada TIME,
    hora_salida TIME,
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);

CREATE TABLE IF NOT EXISTS planilla (
    id_planilla INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER,
    mes INTEGER,
    anio INTEGER,
    total_pago DECIMAL(10,2),
    pagada INTEGER DEFAULT 0,
    fecha_pago DATETIME,
    FOREIGN KEY (id_empleado) REFERENCES empleados_rrhh(id_empleado)
);

-- 4. Contabilidad
CREATE TABLE IF NOT EXISTS cuentas_contables (
    id_cuenta INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo VARCHAR(20) UNIQUE,
    nombre VARCHAR(100),
    tipo VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS asientos_contables (
    id_asiento INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE,
    descripcion TEXT,
    referencia_modulo TEXT,
    referencia_id INTEGER,
    id_centro_costo INTEGER
);

CREATE TABLE IF NOT EXISTS movimientos_contables (
    id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
    id_asiento INTEGER,
    id_cuenta INTEGER,
    debe DECIMAL(12,2),
    haber DECIMAL(12,2),
    FOREIGN KEY (id_asiento) REFERENCES asientos_contables(id_asiento),
    FOREIGN KEY (id_cuenta) REFERENCES cuentas_contables(id_cuenta)
);

-- 5. Tablas Adicionales de Seguimiento
CREATE TABLE IF NOT EXISTS historial_tickets (
    id_historial INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ticket INTEGER,
    estado_anterior VARCHAR(50),
    estado_nuevo VARCHAR(50),
    fecha DATETIME,
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket)
);

CREATE TABLE IF NOT EXISTS llamadas (
    id_llamada INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER,
    id_usuario INTEGER,
    id_ticket INTEGER,
    fecha DATETIME,
    duracion INTEGER,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_ticket) REFERENCES tickets(id_ticket)
);

-- 6. Inventario - Item Master
CREATE TABLE IF NOT EXISTS item_master (
    id_item INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id VARCHAR(20) NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    numero_partes INTEGER NOT NULL CHECK (numero_partes > 0),
    proveedor VARCHAR(150) NOT NULL,
    precio DECIMAL(12,2) NOT NULL CHECK (precio >= 0),
    stock_actual REAL NOT NULL DEFAULT 0,
    unidad_medida TEXT NOT NULL CHECK (unidad_medida IN ('Unidad', 'PK', 'Par')),
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS centros_de_costo (
    id_centro_costo INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    modulo_origen TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

-- 7. Órdenes de Trabajo (OT)
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
    estado_liquidacion TEXT DEFAULT 'Pendiente',
    costo_total_liquidacion REAL DEFAULT 0,
    id_centro_costo INTEGER,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE IF NOT EXISTS ordenes_trabajo_materiales (
    id_material_ot INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ot INTEGER NOT NULL,
    id_item INTEGER NOT NULL,
    cantidad REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    FOREIGN KEY (id_ot) REFERENCES ordenes_trabajo(id_ot) ON DELETE CASCADE,
    FOREIGN KEY (id_item) REFERENCES item_master(id_item)
);

CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
    id_cxp INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL,
    id_factura_compra INTEGER,
    monto_total REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    fecha_vencimiento DATE,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
);

CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id_cxc INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL,
    referencia TEXT,
    monto_total REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
);

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
);

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
);

CREATE TABLE IF NOT EXISTS asientos (
    id_asiento_link INTEGER PRIMARY KEY AUTOINCREMENT,
    id_factura_compra INTEGER,
    id_asiento_contable INTEGER NOT NULL,
    tipo_origen TEXT NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_factura_compra) REFERENCES facturas_compra(id_factura_compra),
    FOREIGN KEY (id_asiento_contable) REFERENCES asientos_contables(id_asiento)
);

CREATE TABLE IF NOT EXISTS logs_auditoria (
    id_log INTEGER PRIMARY KEY AUTOINCREMENT,
    entidad TEXT NOT NULL,
    id_registro INTEGER NOT NULL,
    campo TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario TEXT NOT NULL DEFAULT 'Sistema',
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(sql, (err) => {
  if (err) {
    console.error('Error creando tablas:', err);
    process.exit(1);
  }
  
    console.log('✓ Total de tablas creadas: 29');
  console.log('\nTablas:');
  console.log('  - areas_soporte');
  console.log('  - usuarios');
  console.log('  - clientes');
  console.log('  - categorias_tickets');
  console.log('  - subcategorias_tickets');
  console.log('  - estados_tickets');
  console.log('  - tecnicos');
  console.log('  - tickets');
  console.log('  - empleados_rrhh');
  console.log('  - asistencia');
  console.log('  - planilla');
  console.log('  - cuentas_contables');
  console.log('  - asientos_contables');
  console.log('  - movimientos_contables');
  console.log('  - historial_tickets');
  console.log('  - llamadas');
    console.log('  - item_master');
    console.log('  - centros_de_costo');
    console.log('  - ticket_materiales');
    console.log('  - movimientos_mercancia');
    console.log('  - ordenes_trabajo');
    console.log('  - ordenes_trabajo_materiales');
    console.log('  - cuentas_por_pagar');
    console.log('  - cuentas_por_cobrar');
    console.log('  - facturas_compra');
    console.log('  - detalles_compra');
    console.log('  - asientos');
    console.log('  - logs_auditoria');
  
  db.close();
  console.log('\n✓ Base de datos inicializada correctamente');
});
