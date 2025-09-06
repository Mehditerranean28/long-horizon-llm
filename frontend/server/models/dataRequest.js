const mongoose = require('mongoose');

const DataRequestSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  requestType: {
    type: String,
    enum: ['access', 'deletion'],
    required: true,
  },
  message: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DataRequest', DataRequestSchema);
