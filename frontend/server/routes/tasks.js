const express = require('express');
const crypto = require('crypto');
const requireAuth = require('../middleware/requireAuth');
const { sanitizeId } = require('../utils/sanitize');
const TaskQueue = require('../utils/taskQueue');
const {
  BACKEND_HTTP_URL,
  USER_CONCURRENCY,
} = require('../utils/constants');

const router = express.Router();

// Map of userId -> TaskQueue instance. Each user gets a queue so we can
// throttle how many requests they run concurrently against the Python backend.
const userQueues = new Map();

// Retrieve (or lazily create) the queue for a specific user. This ensures that
// no matter how many browser tabs the user has open we respect the configured
// USER_CONCURRENCY limit for their requests.
function getUserQueue(userId) {
  if (!userQueues.has(userId)) {
    userQueues.set(userId, new TaskQueue(USER_CONCURRENCY));
  }
  return userQueues.get(userId);
}

const taskCache = new Map();

// ---------------------------------------------------------------------------
// POST /tasks
// Handles creation of a new task. The request payload is forwarded to the
// Python backend while enforcing per-user concurrency via TaskQueue.
// ---------------------------------------------------------------------------
router.post('/tasks', requireAuth, async (req, res) => {
  try {
    // 1️⃣ Correlation ID allows tracking this request end-to-end.
    const correlationId = req.correlationId || crypto.randomUUID();

    // 2️⃣ Sanitize incoming JSON body to basic primitives only. This prevents
    // unexpected types from being forwarded to the backend.
    const payload =
      typeof req.body === 'object' && req.body !== null
        ? Object.fromEntries(
            Object.entries(req.body).filter(([_, v]) =>
              ['string', 'number', 'boolean'].includes(typeof v)
            )
          )
        : {};

    // 3️⃣ Always inject user_id from the authenticated session rather than
    // trusting the client provided value.
    payload.user_id = req.session.userId;

    // 4️⃣ Temporarily cache the payload so follow-up GETs can retrieve it even
    // if the backend hasn't processed it yet.
    const cacheId = crypto.randomUUID();
    taskCache.set(cacheId, payload);
    setTimeout(() => taskCache.delete(cacheId), 5 * 60 * 1000);
    payload.cache_id = cacheId;

    // 5️⃣ Enqueue the request in the per-user TaskQueue. This may delay the
    // call if the user has other active tasks running.
    const queue = getUserQueue(req.session.userId);
    const wasQueued = queue.activeCount >= queue.concurrency;
    const response = await queue.add(() =>
      fetch(`${BACKEND_HTTP_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    );

    // 6️⃣ Return the backend's raw response back to the browser. If it was
    // queued we include a header so the client knows.
    const text = await response.text();
    if (response.ok) {
      taskCache.delete(cacheId);
    }
    if (wasQueued) res.set('x-task-queued', '1');
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /tasks/:id
// Fetch the latest status/result for a task from the backend. We also forward
// a correlation ID for logging on the Python side.
// ---------------------------------------------------------------------------
router.get('/tasks/:id', requireAuth, async (req, res) => {
  try {
    // 1️⃣ Validate the task id path parameter.
    const taskId = sanitizeId(req.params.id);

    // 2️⃣ Each request gets its own correlation id for tracing.
    const correlationId = req.correlationId || crypto.randomUUID();

    // 3️⃣ Proxy the request to the Python backend.
    const response = await fetch(`${BACKEND_HTTP_URL}/tasks/${taskId}`, {
      keepalive: true,
      headers: {
        'x-correlation-id': correlationId,
      },
    });

    // 4️⃣ Relay the backend response directly to the caller.
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
