const express = require('express');
const { join } = require('path');
const { readFile, writeFile, mkdir, readdir, rm } = require('fs/promises');

const router = express.Router();

const USERS_DIR = join(process.cwd(), 'data', 'users');

// Remove invalid session entries and ensure ids are unique.
function sanitizeSessions(list) {
  if (!Array.isArray(list)) return [];
  const unique = new Set();
  return list.filter((s) => {
    const valid =
      s &&
      typeof s.id === 'string' &&
      typeof s.title === 'string' &&
      typeof s.dateCategory === 'string' &&
      !unique.has(s.id);
    if (valid) unique.add(s.id);
    return valid;
  });
}

// Ensure the per-user directories for storing chat history exist.
async function ensureUserDirs(userId) {
  const userDir = join(USERS_DIR, userId);
  const chatsDir = join(userDir, 'chats');
  await mkdir(chatsDir, { recursive: true });
  return { sessionsFile: join(userDir, 'sessions.json'), chatsDir };
}

// Load the saved session metadata for the user from disk.
async function loadSessions(userId) {
  const { sessionsFile } = await ensureUserDirs(userId);
  try {
    const data = await readFile(sessionsFile, 'utf8');
    return sanitizeSessions(JSON.parse(data));
  } catch {
    return [];
  }
}

// Persist the user's session list back to disk.
async function saveSessions(userId, sessions) {
  const { sessionsFile } = await ensureUserDirs(userId);
  await writeFile(sessionsFile, JSON.stringify(sanitizeSessions(sessions), null, 2));
}

// Remove a single chat file when a session is deleted.
async function deleteChatFile(userId, id) {
  const { chatsDir } = await ensureUserDirs(userId);
  try {
    await rm(join(chatsDir, `${id}.json`), { force: true });
  } catch {}
}

// ---------------------------------------------------------------------------
// GET /history
// Returns the list of saved chat sessions for the logged-in user.
// ---------------------------------------------------------------------------
router.get('/history', async (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.json([]);
  }
  const sessions = await loadSessions(userId);
  res.json(sessions);
});

// ---------------------------------------------------------------------------
// POST /history
// Update the user's session metadata (add, rename or archive a session).
// ---------------------------------------------------------------------------
router.post('/history', async (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.json({ success: true });
  }
  const data = req.body || {};
  const sessions = await loadSessions(userId);

  if (data.action === 'rename') {
    const session = sessions.find((s) => s.id === data.id);
    if (session) session.title = data.title;
  } else if (data.action === 'archive') {
    const index = sessions.findIndex((s) => s.id === data.id);
    if (index !== -1) sessions.splice(index, 1);
  } else if (data.action === 'add') {
    sessions.push({ id: data.id, title: data.title, dateCategory: data.dateCategory });
  }

  await saveSessions(userId, sessions);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /history/:id
// Remove a single session and its associated chat file.
// ---------------------------------------------------------------------------
router.delete('/history/:id', async (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.json({ success: true });
  }
  const id = req.params.id;
  const sessions = await loadSessions(userId);
  const filtered = sessions.filter((s) => s.id !== id);
  await saveSessions(userId, filtered);
  await deleteChatFile(userId, id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /history
// Clears all chat history for the current user.
// ---------------------------------------------------------------------------
router.delete('/history', async (req, res) => {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.json({ success: true });
  }
  await saveSessions(userId, []);
  try {
    const { chatsDir } = await ensureUserDirs(userId);
    const files = await readdir(chatsDir);
    await Promise.all(files.map((f) => rm(join(chatsDir, f))));
  } catch {}
  res.json({ success: true });
});

module.exports = router;
