const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const requireAuth = require('../middleware/requireAuth');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

/**
 * Forward a run request to the Python backend with a conservative timeout.
 *
 * @param {string} path - Backend path to forward to, e.g. `/v1/run`.
 * @param {express.Request} req - Incoming express request.
 * @param {express.Response} res - Express response to write to.
 * @param {boolean} stream - If true, pipe the backend response body.
 */
async function proxyRun(path, req, res, stream = false) {
  const question = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!question) {
    res.status(400).json({ error: 'query required' });
    return;
  }

  const correlationId = req.correlationId || crypto.randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const backendRes = await fetch(`${BACKEND_HTTP_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': correlationId,
      },
      body: JSON.stringify({ query: question }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (stream) {
      res.status(backendRes.status);
      backendRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      if (backendRes.body) {
        Readable.fromWeb(backendRes.body).pipe(res);
      } else {
        res.end();
      }
      return;
    }

    const text = await backendRes.text();
    res.status(backendRes.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    const status = err.name === 'AbortError' ? 504 : 500;
    res.status(status).json({ error: msg });
  }
}

router.post('/v1/run', requireAuth, (req, res) => proxyRun('/v1/run', req, res));
router.post('/v1/run/stream', requireAuth, (req, res) => proxyRun('/v1/run/stream', req, res, true));

module.exports = router;
