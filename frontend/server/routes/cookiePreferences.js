const express = require('express');
const { CookiePreference } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/cookie-preferences', async (req, res) => {
  const { functional = true, performance = true, targeting = true } = req.body || {};
  try {
    await CookiePreference.create({
      functional: !!functional,
      performance: !!performance,
      targeting: !!targeting,
    });
    if (req.log) req.log.debug('Cookie preferences saved');
    res.json({ success: true });
  } catch (err) {
    if (req.log) req.log.error({ err }, 'cookie preferences error');
    else logger.error({ err }, 'cookie preferences error');
    res.status(500).json({ error: 'failed to save preferences' });
  }
});

module.exports = router;
