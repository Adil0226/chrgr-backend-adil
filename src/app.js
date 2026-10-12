const express = require('express');
const cors = require('cors');
const svc = require('./services');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/', (req, res) =>
    res.json({
      name: 'Chrgr API',
      status: 'ok',
      endpoints: [
        'GET /chargers?city=',
        'GET /chargers/{id}',
        'GET /chargers/nearby?lat=&lng=&radius=',
        'GET /chargers/{id}/reliability',
        'POST /checkins',
      ],
    })
  );

  app.get('/chargers', (req, res) => {
    const chargers = svc.listChargers(db, { city: req.query.city });
    res.json({ count: chargers.length, chargers });
  });

  // NOTE: must be registered before /chargers/:id or "nearby" is parsed as an id
  app.get('/chargers/nearby', (req, res) => {
    const chargers = svc.nearbyChargers(db, req.query);
    res.json({ count: chargers.length, chargers });
  });

  app.get('/chargers/:id', (req, res) => res.json(svc.getCharger(db, req.params.id)));

  app.get('/chargers/:id/reliability', (req, res) => res.json(svc.reliability(db, req.params.id)));

  app.post('/checkins', (req, res) => {
    const checkin = svc.createCheckin(db, req.body);
    res.status(201).json(checkin);
  });

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof svc.HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
