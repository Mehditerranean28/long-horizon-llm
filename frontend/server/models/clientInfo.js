const mongoose = require('mongoose');

const ClientInfoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ip: String,
  country: String,
  city: String,
  region: String,
  timezone: String,
  language: String,
  userAgent: String,
  browserLanguage: String,
  screenResolution: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ClientInfo', ClientInfoSchema);
