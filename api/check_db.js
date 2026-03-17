const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'erpdb.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
});

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, tables) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Tablas existentes:');
    tables.forEach(t => console.log('  - ' + t.name));
  }
  db.close();
});
