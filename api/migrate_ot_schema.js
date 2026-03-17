const db = require('./database');

const runSafe = async (sql) => {
  try {
    await db.run(sql);
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }
};

(async () => {
  try {
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

    await runSafe('ALTER TABLE ordenes_trabajo ADD COLUMN descripcion_problema TEXT');
    await runSafe('ALTER TABLE ordenes_trabajo ADD COLUMN diagnostico_tecnico TEXT');
    await runSafe("ALTER TABLE ordenes_trabajo ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'Media'");
    await runSafe('ALTER TABLE ordenes_trabajo ADD COLUMN celular_solicitante TEXT');
    await runSafe('ALTER TABLE ordenes_trabajo ADD COLUMN ubicacion_problema TEXT');

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

    const columnasOT = await db.all('PRAGMA table_info(ordenes_trabajo)');
    const columnasMateriales = await db.all('PRAGMA table_info(ordenes_trabajo_materiales)');

    console.log('✓ Migración OT aplicada');
    console.log('OT columnas:', columnasOT.map(c => c.name).join(', '));
    console.log('OT materiales columnas:', columnasMateriales.map(c => c.name).join(', '));
  } catch (error) {
    console.error('Error migrando OT:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
