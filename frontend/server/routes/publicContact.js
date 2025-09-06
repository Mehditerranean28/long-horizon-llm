const express = require('express');
const { sanitizeString, sanitizeTextContent, normalizeEmail } = require('../utils/sanitize');
const { sendMail } = require('../utils/email');
const { SUPPORT_EMAIL } = require('../utils/constants');

const router = express.Router();

router.post('/public-contact', async (req, res) => {
  try {
    const { name = '', email = '', message = '' } = req.body || {};
    const cleanEmail = normalizeEmail(email);
    const cleanName = sanitizeString(name);
    const cleanMessage = sanitizeTextContent(message);

    if (!cleanEmail || !cleanMessage) {
      return res.status(400).json({ error: 'email and message required' });
    }

    await sendMail({
      to: SUPPORT_EMAIL,
      from: SUPPORT_EMAIL,
      replyTo: cleanEmail,
      subject: `Business Inquiry from ${cleanName || 'anonymous'}`,
      text: cleanMessage,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('public contact error', err);
    res.status(500).json({ error: 'failed to send message' });
  }
});

module.exports = router;
