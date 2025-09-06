const express = require('express');
const crypto = require('crypto');
const { BACKEND_HTTP_URL } = require('../utils/constants');

const router = express.Router();

async function pollTask(taskId, correlationId) {
  while (true) {
    const res = await fetch(`${BACKEND_HTTP_URL}/tasks/${taskId}`, {
      headers: { 'x-correlation-id': correlationId },
    });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    const data = await res.json();
    if (data.status === 'finished') {
      return data.result?.final_answer || data.result;
    }
    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(data.error || 'task failed');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

router.post('/public-chat', async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'question required' });
    }
    const correlationId = req.correlationId || crypto.randomUUID();
    const payload = { query: question, callId: 'simple-reflection', proto_brain_name: 'InitialProtoBrain' };
    const createRes = await fetch(`${BACKEND_HTTP_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlationId },
      body: JSON.stringify(payload),
    });
    const createData = await createRes.json();
    const answer = await pollTask(createData.task_id, correlationId);
    res.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
