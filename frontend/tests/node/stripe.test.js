const test = require('node:test');
const assert = require('node:assert/strict');
const { createCheckoutSession } = require('../../src/lib/payment.cjs');

const fetchMock = require('./helpers/fetch-mock');

test.before(() => {
  fetchMock.install();
  fetchMock.reset();
});

test.beforeEach(() => {
  fetchMock.reset();
});

test.after(() => {
  fetchMock.restore();
});

test('createCheckoutSession calls backend and returns url', async () => {
  fetchMock.setResponse({ body: { url: 'https://stripe.example/session' } });
  const res = await createCheckoutSession();
  const call = fetchMock.getCalls()[0];
  assert.equal(res.url, 'https://stripe.example/session');
  assert.ok(call.url.includes('/create-checkout-session'));
});

test('createCheckoutSession returns parsed object from backend', async () => {
  fetchMock.setResponse({ body: { url: 'https://stripe.example/abc', id: 'sess_1' } });
  const res = await createCheckoutSession();
  assert.deepEqual(res, { url: 'https://stripe.example/abc', id: 'sess_1' });
});

test('createCheckoutSession throws with status and body on error response', async () => {
  fetchMock.setResponse({ ok: false, status: 400, body: { message: 'bad req' } });
  await assert.rejects(
    createCheckoutSession(),
    (err) => {
      assert.match(err.message, /Checkout session failed: 400/);
      assert.match(err.message, /bad req/);
      return true;
    }
  );
});

test('createCheckoutSession propagates network failures', async () => {
  fetchMock.setResponse({ error: new Error('network oops') });
  await assert.rejects(createCheckoutSession(), /network oops/);
});

test('createCheckoutSession sends POST request', async () => {
  fetchMock.setResponse({ body: { url: 'https://stripe.example/a' } });
  await createCheckoutSession();
  const call = fetchMock.getCalls()[0];
  assert.equal(call.opts.method, 'POST');
});
