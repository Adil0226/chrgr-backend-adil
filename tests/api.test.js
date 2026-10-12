// Integration test: boots the real Express app on a random port and hits it over HTTP.
const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seedIfEmpty } = require('../src/seed');
const { createApp } = require('../src/app');

let server, base, db;
test.before(async () => {
  db = openDb(':memory:');
  seedIfEmpty(db);
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (body) =>
  fetch(`${base}/checkins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /chargers returns >= 30 and filters by city', async () => {
  const all = await (await fetch(`${base}/chargers`)).json();
  assert.ok(all.count >= 30);
  const w = await (await fetch(`${base}/chargers?city=warangal`)).json();
  assert.ok(w.count > 0 && w.chargers.every((c) => c.city === 'Warangal'));
  assert.strictEqual((await fetch(`${base}/chargers?city=Mumbai`)).status, 400);
});

test('GET /chargers/nearby is not swallowed by /:id', async () => {
  const r = await fetch(`${base}/chargers/nearby?lat=17.4352&lng=78.3869&radius=2`);
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.ok(body.count >= 1);
  assert.ok(body.chargers[0].distance_km <= body.chargers.at(-1).distance_km);
});

test('GET /chargers/:id 200 / 404 / 400', async () => {
  assert.strictEqual((await fetch(`${base}/chargers/1`)).status, 200);
  assert.strictEqual((await fetch(`${base}/chargers/9999`)).status, 404);
  assert.strictEqual((await fetch(`${base}/chargers/abc`)).status, 400);
});

test('POST /checkins validates GPS and updates reliability', async () => {
  const c = await (await fetch(`${base}/chargers/1`)).json();
  const far = await post({ charger_id: 1, status: 'worked', lat: c.latitude + 0.01, lng: c.longitude });
  assert.strictEqual(far.status, 422);
  assert.ok((await far.json()).details.distance_m > 100);

  assert.strictEqual((await post({ charger_id: 1, status: 'worked', lat: c.latitude, lng: c.longitude })).status, 201);
  assert.strictEqual((await post({ charger_id: 1, status: 'failed', reason: 'Connector jammed', lat: c.latitude, lng: c.longitude })).status, 201);
  assert.strictEqual((await post({ charger_id: 1, status: 'failed', lat: c.latitude, lng: c.longitude })).status, 400);

  const rel = await (await fetch(`${base}/chargers/1/reliability`)).json();
  assert.strictEqual(rel.total_checkins, 2);
  assert.strictEqual(rel.reliability_score, 50);
});

test('malformed JSON -> 400, unknown route -> 404', async () => {
  const r = await fetch(`${base}/checkins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await fetch(`${base}/nope`)).status, 404);
});
