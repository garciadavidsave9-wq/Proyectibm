const db = require('./database');

(async () => {
  const cols = await db.all("PRAGMA table_info(tickets)");
  console.log('Columnas de tickets:');
  cols.forEach(c => console.log(`  ${c.name}`));
})();
