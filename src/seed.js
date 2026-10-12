const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'chargers.json');

function loadSeedData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).chargers;
}

function seedIfEmpty(db, { reset = false } = {}) {
  if (reset) {
    db.exec('DELETE FROM checkins; DELETE FROM chargers; DELETE FROM sqlite_sequence;');
  }
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM chargers').get();
  if (n > 0) return 0;

  const insert = db.prepare(
    `INSERT INTO chargers (name, location_name, latitude, longitude, connector_type, operator, city)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const chargers = loadSeedData();
  db.transaction(() => {
    for (const c of chargers) {
      insert.run(c.name, c.location_name, c.latitude, c.longitude, c.connector_type, c.operator, c.city);
    }
  })();
  return chargers.length;
}

module.exports = { seedIfEmpty, loadSeedData };

if (require.main === module) {
  const { openDb } = require('./db');
  const db = openDb();
  const inserted = seedIfEmpty(db, { reset: process.argv.includes('--reset') });
  console.log(`Seeded ${inserted} chargers.`);
}
