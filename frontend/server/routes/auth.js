const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /register
// Handles user sign up. Validates the payload, checks for duplicates, hashes the
// password via mongoose middleware and stores the user in MongoDB.
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    // 1️⃣ Pull the raw fields from the request body and sanitize any strings.
    const { username: rawUsername, password, email: rawEmail } = req.body || {};
    const username = sanitizeString(rawUsername);
    const email = sanitizeString(rawEmail);

    // 2️⃣ Basic validation of the provided credentials.
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof email !== 'string' ||
      !username.trim() ||
      !email.trim() ||
      password.length < 6
    ) {
      return res
        .status(400)
        .json({ error: 'username, email and password are required' });
    }

    // 3️⃣ Ensure username or email do not already exist.
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).json({ error: 'user already exists' });
    }

    // 4️⃣ Create the user document. The password hashing occurs in the model
    // layer via mongoose middleware.
    const newUser = await User.create({ username, email, password });
    if (req.log) {
      req.log.info({ userId: newUser._id }, 'New user registered');
    }
    return res.json({
      success: true,
      userId: newUser._id.toString(),
      message: 'User registered successfully.',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Unable to register user' });
  }
});

// ---------------------------------------------------------------------------
// POST /login
// Authenticates a user. Verifies credentials and establishes a session cookie on
// success.
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    // 1️⃣ Extract and sanitize user input.
    const { username: rawUsername, password } = req.body || {};
    const username = sanitizeString(rawUsername);
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid login payload' });
    }

    // 2️⃣ Look up the user and compare hashed passwords.
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    // 3️⃣ Handle expired premium subscriptions gracefully.
    if (
      user.subscriptionStatus === 'premium' &&
      user.subscriptionValidUntil &&
      user.subscriptionValidUntil < Date.now()
    ) {
      user.subscriptionStatus = 'free';
      await user.save();
    }

    // 4️⃣ Persist the user id in the session so subsequent requests are auth'd.
    req.session.userId = user._id.toString();
    return res.json({ success: true, subscriptionStatus: user.subscriptionStatus });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Unable to login' });
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// Ends the user session and clears the session cookie.
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Unable to log out' });
    res.json({ success: true });
  });
});

module.exports = router;
