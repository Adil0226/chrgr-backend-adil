// Unit tests for the business logic (no HTTP).
const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seedIfEmpty } = require('../src/seed');
const { haversineMeters } = require('../src/geo');
const svc = require('../src/services');

const db = openDb(':memory:');
seedIfEmpty(db);

test('seed has >= 30 chargers across both cities', () => {
  assert.ok(svc.listChargers(db).length >= 30);
  assert.ok(svc.listChargers(db, { city: 'Hyderabad' }).length > 0);
  assert.ok(svc.listChargers(db, { city: 'Warangal' }).length > 0);
});

test('haversine: ~111.2 km per degree of latitude', () => {
  const d = haversineMeters(17, 78, 18, 78);
  assert.ok(Math.abs(d - 111195) < 200);
});

test('100 m boundary: ~90 m accepted, ~120 m rejected', () => {
  const c = svc.getCharger(db, 5);
  const metresToDeg = (m) => m / 111195;
  const ok = svc.createCheckin(db, { charger_id: 5, status: 'worked', lat: c.latitude + metresToDeg(90), lng: c.longitude });
  assert.ok(ok.distance_m < 100);
  assert.throws(
    () => svc.createCheckin(db, { charger_id: 5, status: 'worked', lat: c.latitude + metresToDeg(120), lng: c.longitude }),
    (e) => e.status === 422
  );
});

test('reliability is null with no check-ins', () => {
  assert.strictEqual(svc.reliability(db, 7).reliability_score, null);
});

test('nearby validates input', () => {
  assert.throws(() => svc.nearbyChargers(db, { lat: 'x', lng: 78 }), (e) => e.status === 400);
  assert.throws(() => svc.nearbyChargers(db, { lat: 17, lng: 78, radius: -1 }), (e) => e.status === 400);
});
