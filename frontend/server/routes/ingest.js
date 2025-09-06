const express = require('express');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /ingest
// Receives a base64 encoded file in JSON and proxies it as multipart/form-data
// to the Python backend for ingestion.
// ---------------------------------------------------------------------------
router.post('/ingest', requireAuth, async (req, res) => {
  try {
    // 1️⃣ Grab the correlation id for tracing this request in logs.
    const correlationId = req.correlationId || crypto.randomUUID();

    // 2️⃣ Extract the relevant fields from the posted JSON body.
    const {
      attachment_name: name,
      attachment_type: type,
      attachment_data_uri: dataUri,
      attachment_data_uri_chunks: chunks,
    } = req.body || {};

    // 3️⃣ Validate that we actually received an attachment to ingest.
    if (!name || !(dataUri || Array.isArray(chunks))) {
      return res.status(400).json({ error: 'Missing attachment' });
    }

    // 4️⃣ Combine chunked data if necessary and strip the data URI prefix.
    const combined =
      typeof dataUri === 'string' && dataUri.startsWith('data:')
        ? dataUri
        : Array.isArray(chunks)
        ? chunks.join('')
        : null;
    if (!combined) {
      return res.status(400).json({ error: 'Invalid attachment data' });
    }

    // 5️⃣ Convert the base64 payload into a binary Blob and build form-data.
    const base64 = combined.split(',')[1] || '';
    const buf = Buffer.from(base64, 'base64');
    const form = new FormData();
    const file = new Blob([buf], { type: type || 'application/octet-stream' });
    form.append('file', file, name);
    form.append('user_id', req.session.userId);

    // 6️⃣ Forward the multipart form directly to the backend.
    const response = await fetch(`${BACKEND_HTTP_URL}/ingest`, {
      method: 'POST',
      headers: { 'x-correlation-id': correlationId },
      body: form,
    });

    // 7️⃣ Relay whatever the backend responded with back to the client.
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

// Accept base64-encoded audio and forward as multipart form-data to /ingest/audio
// ---------------------------------------------------------------------------
// POST /ingest/audio
// Similar to the /ingest route but specifically for audio. Handles base64
// encoded sound files captured in the browser or uploaded by the user and
// forwards them to the backend for transcription or processing.
// ---------------------------------------------------------------------------
router.post('/ingest/audio', requireAuth, async (req, res) => {
  try {
    // 1️⃣ Generate correlation id for tracing.
    const correlationId = req.correlationId || crypto.randomUUID();

    // 2️⃣ Parse JSON fields from the request body.
    const {
      attachment_name: name,
      attachment_type: type,
      attachment_data_uri: dataUri,
      attachment_data_uri_chunks: chunks,
      source = 'upload',
    } = req.body || {};

    // 3️⃣ Validate presence of audio data.
    if (!name || !(dataUri || Array.isArray(chunks))) {
      return res.status(400).json({ error: 'Missing attachment' });
    }

    // 4️⃣ Combine data chunks if needed to get the full data URI.
    const combined =
      typeof dataUri === 'string' && dataUri.startsWith('data:')
        ? dataUri
        : Array.isArray(chunks)
        ? chunks.join('')
        : null;
    if (!combined) {
      return res.status(400).json({ error: 'Invalid attachment data' });
    }

    // 5️⃣ Convert base64 string to binary and build multipart form.
    const base64 = combined.split(',')[1] || '';
    const buf = Buffer.from(base64, 'base64');
    const form = new FormData();
    const file = new Blob([buf], { type: type || 'audio/wav' });
    form.append('file', file, name);
    form.append('user_id', req.session.userId);
    form.append('source', source);

    // 6️⃣ Forward to the backend /ingest/audio endpoint.
    const response = await fetch(`${BACKEND_HTTP_URL}/ingest/audio`, {
      method: 'POST',
      headers: { 'x-correlation-id': correlationId },
      body: form,
    });

    // 7️⃣ Relay the backend response.
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
