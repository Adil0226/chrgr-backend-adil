CREATE TABLE IF NOT EXISTS chargers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  location_name  TEXT NOT NULL,
  latitude       REAL NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude      REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  connector_type TEXT NOT NULL,
  operator       TEXT NOT NULL,
  city           TEXT NOT NULL CHECK (city IN ('Hyderabad', 'Warangal')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_chargers_city ON chargers (city);
CREATE INDEX IF NOT EXISTS idx_chargers_lat_lng ON chargers (latitude, longitude);

CREATE TABLE IF NOT EXISTS checkins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  charger_id  INTEGER NOT NULL REFERENCES chargers (id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('worked', 'failed')),
  reason      TEXT,
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  distance_m  REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_charger ON checkins (charger_id);
