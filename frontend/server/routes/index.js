module.exports = function createRoutes(stripe, priceId, webhookSecret) {
  const express = require('express');
  const router = express.Router();

  router.use(require('./auth'));
  router.use(require('./tasks'));
  router.use(require('./ingest'));
  router.use(require('./research'));
  router.use(require('./video'));
  router.use(require('./payment')(stripe, priceId));
  if (webhookSecret) {
    router.use(require('./stripeWebhook')(stripe, webhookSecret));
  }
  router.use(require('./history'));
  router.use(require('./contact'));
  router.use(require('./publicContact'));
  router.use(require('./publicChat'));
  router.use(require('./dataRequest'));
  router.use(require('./cookiePreferences'));
  router.use(require('./clientInfo'));

  router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
};
