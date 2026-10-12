const { openDb } = require('./db');
const { seedIfEmpty } = require('./seed');
const { createApp } = require('./app');

const db = openDb();
const inserted = seedIfEmpty(db); // no-op if already seeded (handy on Render's ephemeral disk)
if (inserted) console.log(`Seeded ${inserted} chargers.`);

const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`Chrgr API listening on http://localhost:${port}`));
