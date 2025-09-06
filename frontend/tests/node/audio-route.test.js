const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

const fetchMock = require('./helpers/fetch-mock');
const { connect, disconnect } = require('./helpers/memory-db');
const createRoutes = require('../../server/routes');

let server;
let port;

// Spin up express app using in-memory MongoDB and fetch mock
test.before(async () => {
  await connect();
  fetchMock.install();
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'a'.repeat(64),
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ client: mongoose.connection.getClient() }),
    })
  );
  app.use('/api', createRoutes({}));
  server = app.listen(0);
  port = server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fetchMock.restore();
  await disconnect();
});

test.beforeEach(() => {
  fetchMock.reset();
});

function apiUrl(path) {
  return `http://localhost:${port}${path}`;
}

const user = { username: 'audio', password: 'secret1', email: 'a@b.com' };

// Helper to register and login user
async function login() {
  await fetch(apiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  const res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

test('ingest audio forwards to backend', async () => {
  const cookie = await login();
  const wavData = Buffer.from('RIFF');
  const dataUri = `data:audio/wav;base64,${wavData.toString('base64')}`;
  fetchMock.setResponse({ body: { status: 'stored' } });

  const res = await fetch(apiUrl('/api/ingest/audio'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      attachment_name: 'sample.wav',
      attachment_type: 'audio/wav',
      attachment_data_uri: dataUri,
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: 'stored' });
  const call = fetchMock.getCalls()[0];
  assert.ok(call.url.includes('/ingest/audio'));
});
