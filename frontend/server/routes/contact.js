const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { ContactMessage, User } = require('../models');
const { sanitizeString } = require('../utils/sanitize');
const { sendMail } = require('../utils/email');
const { SUPPORT_EMAIL } = require('../utils/constants');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /contact
// Allows authenticated users to send feedback or support requests. The message
// is stored in MongoDB and optionally forwarded via email to a configured
// support address.
// ---------------------------------------------------------------------------
router.post('/contact', requireAuth, async (req, res) => {
  try {
    // 1️⃣ Read and sanitize the submitted message text.
    const { message: rawMessage } = req.body || {};
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }
    const sanitized = sanitizeString(message, /[\s\S]*/);

    // 2️⃣ Look up the user to associate with the contact message.
    const user = await User.findById(req.session.userId);

    // 3️⃣ Persist the message in the ContactMessage collection.
    const contact = await ContactMessage.create({
      user: user._id,
      message: sanitized,
    });

    // 4️⃣ If configured, also send the message via email to support staff.
    if (SUPPORT_EMAIL) {
      await sendMail({
        to: SUPPORT_EMAIL,
        from: SUPPORT_EMAIL,
        subject: 'New Support Message',
        text: `User ${user.username} (${user.email}) wrote:\n\n${sanitized}`,
      });
    }

    // 5️⃣ Respond to the client with the created document id.
    res.json({ success: true, id: contact._id });
  } catch (err) {
    console.error('contact error', err);
    res.status(500).json({ error: 'failed to send message' });
  }
});

module.exports = router;
