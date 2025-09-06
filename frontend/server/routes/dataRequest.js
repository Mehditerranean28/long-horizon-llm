const express = require('express');
const { DataRequest } = require('../models');
const { sanitizeString, sanitizeTextContent, normalizeEmail } = require('../utils/sanitize');
const { sendMail } = require('../utils/email');
const { SUPPORT_EMAIL } = require('../utils/constants');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/data-request', async (req, res) => {
  const { email = '', requestType = '', message = '' } = req.body || {};
  const cleanEmail = normalizeEmail(email);
  const cleanType = sanitizeString(requestType).toLowerCase();
  const cleanMessage = sanitizeTextContent(message);

  if (req.log) req.log.info({ email: cleanEmail, requestType: cleanType }, 'Received GDPR data request');

  try {
    if (!cleanEmail || !['access', 'deletion'].includes(cleanType)) {
      return res.status(400).json({ error: 'invalid data' });
    }

    await DataRequest.create({ email: cleanEmail, requestType: cleanType, message: cleanMessage });

    if (req.log) req.log.debug('Data request persisted to database');

    if (SUPPORT_EMAIL) {
      sendMail({
        to: SUPPORT_EMAIL,
        from: SUPPORT_EMAIL,
        replyTo: cleanEmail,
        subject: `GDPR ${cleanType} request`,
        text: cleanMessage,
      })
        .then(() => req.log && req.log.info('GDPR request notification email sent'))
        .catch((err) => req.log ? req.log.error({ err }, 'Failed to send GDPR request email') : logger.error({ err }, 'Failed to send GDPR request email'));
    }

    res.json({ success: true });
  } catch (err) {
    if (req.log) req.log.error({ err }, 'data request error');
    else logger.error({ err }, 'data request error');
    res.status(500).json({ error: 'failed to submit request' });
  }
});

module.exports = router;
