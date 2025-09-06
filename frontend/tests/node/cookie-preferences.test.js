const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

const { connect, disconnect } = require('./helpers/memory-db');
const createRoutes = require('../../server/routes');
const { CookiePreference } = require('../../server/models');

let server;
let port;

test.before(async () => {
  await connect();
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'a'.repeat(64),
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ client: mongoose.connection.getClient() }),
    }),
  );
  app.use('/api', createRoutes());
  server = app.listen(0);
  port = server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnect();
});

test.beforeEach(async () => {
  await CookiePreference.deleteMany({});
});

function apiUrl(path) {
  return `http://localhost:${port}${path}`;
}

test('saves cookie preferences via POST', async () => {
  const prefs = { functional: false, performance: true, targeting: false };
  const res = await fetch(apiUrl('/api/cookie-preferences'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, { success: true });
  const docs = await CookiePreference.find({});
  assert.equal(docs.length, 1);
  assert.equal(docs[0].functional, prefs.functional);
  assert.equal(docs[0].performance, prefs.performance);
  assert.equal(docs[0].targeting, prefs.targeting);
});
