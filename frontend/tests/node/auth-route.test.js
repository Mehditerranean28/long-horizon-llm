const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const fetch = require('node-fetch');

const { connect, disconnect } = require('./helpers/memory-db');
const createRoutes = require('../../server/routes');

let server;
let port;

// Start express server with in-memory MongoDB before tests

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
    })
  );
  app.use('/api', createRoutes({}));
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

const userData = {
  username: 'testuser',
  password: 'secret123',
  email: 'test@example.com',
};

test('register then login via Express server', async () => {
  let res = await fetch(apiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.userId, 'string');
  assert.equal(body.message, 'User registered successfully.');

  res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  assert.equal(res.status, 200);
  body = await res.json();
  assert.deepEqual(body, { success: true, subscriptionStatus: 'free' });
});


test('login fails with wrong password', async () => {
  let res = await fetch(apiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'u2',
      password: 'goodpass',
      email: 'u2@example.com',
    }),
  });
  assert.equal(res.status, 200);

  res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'u2', password: 'bad' }),
  });
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.match(json.error, /invalid/i);
});

test('login downgrades expired premium user', async () => {
  let res = await fetch(apiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'exp',
      password: 'goodpass',
      email: 'exp@example.com',
    }),
  });
  assert.equal(res.status, 200);

  // Manually set premium but already expired
  const User = require('../../server/models/user');
  await User.findOneAndUpdate(
    { username: 'exp' },
    {
      subscriptionStatus: 'premium',
      subscriptionValidUntil: new Date(Date.now() - 1000),
    },
  );

  res = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'exp', password: 'goodpass' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { success: true, subscriptionStatus: 'free' });
});

