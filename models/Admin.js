const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailCode:{
    type: Number,
    default: 0,
  },
  isTwoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lastFailedLoginAt: {
    type: Date,
  },
  resetCode: {
    type: Number,
  },
  deletionCode: {
    type: Number,
  },
  isAdmin: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model('Admin', adminSchema);
