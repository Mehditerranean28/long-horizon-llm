const mongoose = require('mongoose');

const CookiePreferenceSchema = new mongoose.Schema({
  functional: { type: Boolean, default: true },
  performance: { type: Boolean, default: true },
  targeting: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CookiePreference', CookiePreferenceSchema);
