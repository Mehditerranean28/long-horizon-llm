const express = require('express');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

router.post('/research/quick', requireAuth, async (req, res) => {
  try {
    const correlationId = req.correlationId || crypto.randomUUID();
    const response = await fetch(`${BACKEND_HTTP_URL}/research/quick_summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(req.body || {}),
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

router.post('/research/report', requireAuth, async (req, res) => {
  try {
    const correlationId = req.correlationId || crypto.randomUUID();
    const response = await fetch(`${BACKEND_HTTP_URL}/research/generate_report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(req.body || {}),
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
