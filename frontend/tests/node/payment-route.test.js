const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const { User } = require('../../server/models');

const { connect, disconnect } = require('./helpers/memory-db');
const createRoutes = require('../../server/routes');

let server;
let port;
let createCalls;

const stripeStub = {
  checkout: {
    sessions: {
      create: async (opts) => {
        createCalls.push(opts);
        return { url: 'https://stripe.example/session', id: 'cs_test_123' };
      },
    },
  },
};

const userData = {
  username: 'payuser',
  password: 'secret123',
  email: 'pay@example.com',
};

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
  app.use('/api', createRoutes(stripeStub, 'price_123', null));
  server = app.listen(0);
  port = server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnect();
});

function apiUrl(path) {
  return `http://localhost:${port}${path}`;
}

test('create-checkout-session requires auth', async () => {
  createCalls = [];
  const res = await fetch(apiUrl('/api/create-checkout-session'), { method: 'POST' });
  assert.equal(res.status, 403);
  assert.equal(createCalls.length, 0);
});

test('create-checkout-session associates session with user', async () => {
  let res = await fetch(apiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  assert.equal(res.status, 200);

  res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userData.username, password: userData.password }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');

  createCalls = [];
  res = await fetch(apiUrl('/api/create-checkout-session'), {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.url, 'https://stripe.example/session');
  assert.ok(body.id.startsWith('cs_'));
  const user = await User.findOne({ username: userData.username });
  assert.equal(user.pendingCheckoutSessionId, body.id);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].client_reference_id.length, 24);
});
