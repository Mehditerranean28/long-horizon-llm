const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const requireAuth = require('../middleware/requireAuth');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

router.post('/v1/run', requireAuth, async (req, res) => {
  try {
    const question = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'query required' });
    }
    const correlationId = req.correlationId || crypto.randomUUID();
    const backendRes = await fetch(`${BACKEND_HTTP_URL}/v1/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': correlationId,
      },
      body: JSON.stringify({ query: question }),
    });
    const text = await backendRes.text();
    res.status(backendRes.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

router.post('/v1/run/stream', requireAuth, async (req, res) => {
  try {
    const question = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'query required' });
    }
    const correlationId = req.correlationId || crypto.randomUUID();
    const backendRes = await fetch(`${BACKEND_HTTP_URL}/v1/run/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': correlationId,
      },
      body: JSON.stringify({ query: question }),
    });
    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    if (backendRes.body) {
      Readable.fromWeb(backendRes.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
