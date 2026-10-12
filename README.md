# Chrgr Backend – Charger Database & REST API

Backend for **Chrgr**: a database of public EV charging stations in **Hyderabad** and **Warangal**, plus a REST API for chargers, driver check-ins and reliability scores.

**Stack:** Node.js 18+ · Express 4 · SQLite (`better-sqlite3`)

**Live API:** https://chrgr-backend-adil.onrender.com  
**Repository:** https://github.com/Adil0226/chrgr-backend-adil

> Free-tier hosting sleeps when idle (first request can take ~30-60 s) and resets check-ins on restart. The curl examples below use `http://localhost:3000`; swap in the live URL to try them against the deployed API.

---

## 1. Setup

```bash
git clone https://github.com/Adil0226/chrgr-backend-adil.git
cd chrgr-backend-adil
npm install
npm start            # http://localhost:3000
```

On first start the server creates `chrgr.db` and seeds it from `data/chargers.json` (37 chargers). Nothing else to configure.

| Command | What it does |
|---|---|
| `npm start` | Start the API (auto-seeds an empty DB) |
| `npm run dev` | Start with auto-reload |
| `npm run seed` | Wipe and re-seed the database |
| `npm run sql` | Regenerate `data/seed.sql` from `data/chargers.json` |
| `npm test` | Run unit + HTTP integration tests |

Environment variables (optional, see `.env.example`): `PORT` (default `3000`), `DB_PATH` (default `./chrgr.db`).

Prefer raw SQL? `sqlite3 chrgr.db < data/seed.sql` builds the schema and loads all chargers.

---

## 2. Data model

**chargers** – `id`, `name`, `location_name`, `latitude`, `longitude`, `connector_type`, `operator`, `city` (`Hyderabad` | `Warangal`), `created_at`

**checkins** – `id`, `charger_id` → chargers, `status` (`worked` | `failed`), `reason`, `latitude`, `longitude`, `distance_m` (driver→charger at submit time), `created_at`

---

## 3. Endpoints

All responses are JSON. Errors look like `{ "error": "message", "details": { ... } }`.

### `GET /chargers` – list chargers (optional `?city=`)

```bash
curl "http://localhost:3000/chargers"
curl "http://localhost:3000/chargers?city=Warangal"      # case-insensitive
```
```json
{ "count": 9, "chargers": [ { "id": 29, "name": "Warangal Railway Station Charger", "location_name": "Warangal Railway Station", "latitude": 17.972, "longitude": 79.602, "connector_type": "Type 2 AC", "operator": "TGREDCO", "city": "Warangal", "created_at": "2026-10-12T06:51:42.227Z" } ] }
```
`400` if `city` is not Hyderabad/Warangal.

### `GET /chargers/{id}` – single charger

```bash
curl http://localhost:3000/chargers/1
```
`400` if the id isn't a positive integer · `404` if not found.

### `GET /chargers/nearby?lat=&lng=&radius=` – chargers within a radius

`radius` is in **km** (default `5`, max `100`). Results are sorted nearest-first and include `distance_km`.

```bash
curl "http://localhost:3000/chargers/nearby?lat=17.4400&lng=78.3800&radius=3"
```
```json
{ "count": 4, "chargers": [ { "id": 1, "name": "Inorbit Mall EV Charging", "distance_km": 0.7, "...": "..." } ] }
```
`400` for missing/invalid `lat`, `lng` or `radius`.

### `POST /checkins` – submit a driver check-in

| Field | Rules |
|---|---|
| `charger_id` | required, existing charger |
| `status` | required: `worked` or `failed` |
| `reason` | **required when `failed`**, max 500 chars, optional otherwise |
| `lat`, `lng` | required; must be **within 100 m** of the charger |

```bash
# worked
curl -X POST http://localhost:3000/checkins -H "Content-Type: application/json" \
  -d '{"charger_id":1,"status":"worked","lat":17.4352,"lng":78.3869}'

# failed (reason required)
curl -X POST http://localhost:3000/checkins -H "Content-Type: application/json" \
  -d '{"charger_id":1,"status":"failed","reason":"Connector jammed","lat":17.4353,"lng":78.3870}'
```
`201` → the stored check-in. Too far away:
```json
// 422
{ "error": "Check-in rejected: you are too far from the charger", "details": { "distance_m": 1112, "max_distance_m": 100 } }
```
`400` for validation errors or malformed JSON · `404` if the charger doesn't exist.

### `GET /chargers/{id}/reliability` – reliability score

`reliability_score = worked ÷ total check-ins × 100` (1 decimal). It is `null` – not `0` – when a charger has no check-ins yet, so the UI can show "No reports yet" instead of "0% reliable".

```bash
curl http://localhost:3000/chargers/1/reliability
```
```json
{ "charger_id": 1, "name": "Inorbit Mall EV Charging", "total_checkins": 2, "worked": 1, "failed": 1, "reliability_score": 50, "last_checkin_at": "2026-10-12T06:51:42.227Z" }
```

### `GET /health` – liveness probe (for Render/Railway)

```bash
curl http://localhost:3000/health
```

---

## 4. Design notes

- **GPS validation:** distance uses the haversine formula (`src/geo.js`); check-ins over 100 m return `422`. The computed distance is stored with each check-in for auditing.
- **Nearby search:** SQL narrows candidates with a lat/lng bounding box (indexed), then exact haversine distance filters and sorts.
- **Layering:** `services.js` holds all business logic and has no Express dependency; `app.js` is thin routing. Route order matters: `/chargers/nearby` is registered before `/chargers/:id`.
- **Reliability** is all-time. A natural next step is weighting recent check-ins more heavily.

## 5. Deploying (Render / Railway free tier)

Build command `npm install`, start command `npm start`. The server auto-seeds on boot. **Caveat:** free-tier disks are ephemeral, so SQLite check-ins reset on redeploy. For persistence, attach a disk (`DB_PATH=/data/chrgr.db`) or move to PostgreSQL.

## 6. Seed data – read before demoing

`data/chargers.json` (also `data/seed.sql`) contains 37 stations (28 Hyderabad, 9 Warangal). Coordinates are **landmark-level approximations** and operator/connector fields are indicative. **Verify each station against the BEEP portal / Google Maps / PlugShare and correct its lat/lng before relying on the 100 m check-in rule.** Then run `npm run seed && npm run sql`.
