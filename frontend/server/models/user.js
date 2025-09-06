const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    first: String,
    last: String,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  image: String,
  dateCreated: {
    type: Date,
    default: Date.now,
  },
  token: String,
  subscriptionStatus: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free',
  },
  subscriptionValidUntil: Date,
  subscriptionCanceledAt: Date,
  pendingCheckoutSessionId: String,
});

UserSchema.path('password').validate(function (password) {
  return password.length > 5;
}, 'password must be at least 6 characters');

UserSchema.pre('save', function (next) {
  if (!this.isModified('password')) return next();
  bcrypt.genSalt(10, (err, salt) => {
    if (err) return next(err);
    bcrypt.hash(this.password, salt, (err2, hash) => {
      if (err2) return next(err2);
      this.password = hash;
      next();
    });
  });
});

UserSchema.methods.comparePassword = function (inputPassword, callback) {
  bcrypt.compare(inputPassword, this.password, (err, isMatch) => {
    if (err) return callback(err);
    callback(null, isMatch);
  });
};

UserSchema.methods.isPremium = function () {
  if (this.subscriptionStatus !== 'premium') return false;
  if (this.subscriptionValidUntil && this.subscriptionValidUntil < Date.now()) {
    return false;
  }
  return true;
};

module.exports = mongoose.model('User', UserSchema);
