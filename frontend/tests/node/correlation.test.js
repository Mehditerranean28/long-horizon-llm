const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const correlationId = require('../../server/middleware/correlationId');

function startServer() {
  const app = express();
  app.use(session({ secret: 't', resave: false, saveUninitialized: true }));
  app.use(correlationId);
  app.get('/', (req, res) => {
    res.json({ cid: req.session.correlationId });
  });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('correlationId persisted in session', async () => {
  const server = await startServer();
  const { port } = server.address();
  const res1 = await fetch(`http://localhost:${port}/`, {
    headers: { 'x-correlation-id': 'abc' },
  });
  const cookie = res1.headers.get('set-cookie').split(';')[0];
  const data1 = await res1.json();
  assert.equal(data1.cid, 'abc');

  const res2 = await fetch(`http://localhost:${port}/`, {
    headers: { Cookie: cookie },
  });
  const data2 = await res2.json();
  assert.equal(data2.cid, 'abc');
  server.close();
});
