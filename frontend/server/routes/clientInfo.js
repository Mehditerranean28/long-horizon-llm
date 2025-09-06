const express = require('express');
const { ClientInfo } = require('../models');

const router = express.Router();

router.post('/client-info', async (req, res) => {
  try {
    const data = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const doc = {
      user: req.session && req.session.userId ? req.session.userId : undefined,
      ip: typeof data.ip === 'string' ? data.ip : undefined,
      country: typeof data.country === 'string' ? data.country : undefined,
      city: typeof data.city === 'string' ? data.city : undefined,
      region: typeof data.region === 'string' ? data.region : undefined,
      timezone: typeof data.timezone === 'string' ? data.timezone : undefined,
      language: typeof data.language === 'string' ? data.language : undefined,
      userAgent: typeof data.userAgent === 'string' ? data.userAgent : undefined,
      browserLanguage: typeof data.browserLanguage === 'string' ? data.browserLanguage : undefined,
      screenResolution: typeof data.screenResolution === 'string' ? data.screenResolution : undefined,
    };
    await ClientInfo.create(doc);
    res.json({ success: true });
  } catch (err) {
    console.error('client-info error', err);
    res.status(500).json({ error: 'failed to save' });
  }
});

module.exports = router;
