const express = require('express');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

router.post('/video/script', requireAuth, async (req, res) => {
  try {
    const correlationId = req.correlationId || crypto.randomUUID();
    const response = await fetch(`${BACKEND_HTTP_URL}/video/script`, {
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

router.post('/video/terms', requireAuth, async (req, res) => {
  try {
    const correlationId = req.correlationId || crypto.randomUUID();
    const response = await fetch(`${BACKEND_HTTP_URL}/video/terms`, {
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
