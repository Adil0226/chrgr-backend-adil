const { haversineMeters, boundingBox } = require('./geo');

const CITIES = ['Hyderabad', 'Warangal'];
const STATUSES = ['worked', 'failed'];
const MAX_CHECKIN_DISTANCE_M = 100;
const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 100;

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ---------- small validation helpers ----------
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

function requireCoord(value, name, limit) {
  const n = toNumber(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) {
    throw new HttpError(400, `${name} must be a number between -${limit} and ${limit}`);
  }
  return n;
}

function requireId(value, name = 'id') {
  const n = toNumber(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${name} must be a positive integer`);
  return n;
}

function normaliseCity(city) {
  const match = CITIES.find((c) => c.toLowerCase() === String(city).trim().toLowerCase());
  if (!match) throw new HttpError(400, `city must be one of: ${CITIES.join(', ')}`);
  return match;
}

function findCharger(db, id) {
  const charger = db.prepare('SELECT * FROM chargers WHERE id = ?').get(id);
  if (!charger) throw new HttpError(404, `Charger ${id} not found`);
  return charger;
}

// ---------- chargers ----------
function listChargers(db, { city } = {}) {
  if (city === undefined || city === '') {
    return db.prepare('SELECT * FROM chargers ORDER BY id').all();
  }
  return db.prepare('SELECT * FROM chargers WHERE city = ? ORDER BY id').all(normaliseCity(city));
}

function getCharger(db, rawId) {
  return findCharger(db, requireId(rawId));
}

function nearbyChargers(db, { lat, lng, radius }) {
  const la = requireCoord(lat, 'lat', 90);
  const lo = requireCoord(lng, 'lng', 180);
  let radiusKm = DEFAULT_RADIUS_KM;
  if (radius !== undefined && radius !== '') {
    radiusKm = toNumber(radius);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
      throw new HttpError(400, `radius must be a number in km, > 0 and <= ${MAX_RADIUS_KM}`);
    }
  }

  const box = boundingBox(la, lo, radiusKm);
  const candidates = db
    .prepare(
      `SELECT * FROM chargers
       WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`
    )
    .all(box.minLat, box.maxLat, box.minLng, box.maxLng);

  return candidates
    .map((c) => ({ ...c, distance_km: haversineMeters(la, lo, c.latitude, c.longitude) / 1000 }))
    .filter((c) => c.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((c) => ({ ...c, distance_km: Math.round(c.distance_km * 100) / 100 }));
}

// ---------- check-ins ----------
function createCheckin(db, body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON body required');

  const chargerId = requireId(body.charger_id, 'charger_id');
  if (!STATUSES.includes(body.status)) {
    throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (body.status === 'failed' && !reason) {
    throw new HttpError(400, 'reason is required when status is "failed"');
  }
  if (reason.length > 500) throw new HttpError(400, 'reason must be 500 characters or fewer');
  const lat = requireCoord(body.lat, 'lat', 90);
  const lng = requireCoord(body.lng, 'lng', 180);

  const charger = findCharger(db, chargerId);
  const distance = haversineMeters(lat, lng, charger.latitude, charger.longitude);
  if (distance > MAX_CHECKIN_DISTANCE_M) {
    throw new HttpError(422, 'Check-in rejected: you are too far from the charger', {
      distance_m: Math.round(distance),
      max_distance_m: MAX_CHECKIN_DISTANCE_M,
    });
  }

  const info = db
    .prepare(
      `INSERT INTO checkins (charger_id, status, reason, latitude, longitude, distance_m)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(chargerId, body.status, reason || null, lat, lng, distance);

  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(Number(info.lastInsertRowid));
}

function reliability(db, rawId) {
  const charger = findCharger(db, requireId(rawId));
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'worked'), 0) AS worked,
              COALESCE(SUM(status = 'failed'), 0) AS failed,
              MAX(created_at) AS last_checkin_at
       FROM checkins WHERE charger_id = ?`
    )
    .get(charger.id);

  const total = Number(row.total);
  const worked = Number(row.worked);
  return {
    charger_id: charger.id,
    name: charger.name,
    total_checkins: total,
    worked,
    failed: Number(row.failed),
    // null (not 0) when there is no data, so the UI can show "No reports yet"
    reliability_score: total === 0 ? null : Math.round((worked / total) * 1000) / 10,
    last_checkin_at: row.last_checkin_at,
  };
}

module.exports = {
  HttpError, CITIES, MAX_CHECKIN_DISTANCE_M,
  listChargers, getCharger, nearbyChargers, createCheckin, reliability,
};
