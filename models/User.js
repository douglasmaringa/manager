// Import necessary modules
const mongoose = require('mongoose');

// Define user schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  timezone: {
    type: String,
    required: true,
  },
  marketingEmailsOptIn: {
    type: Boolean,
    default: false,
  },
});

// Create and export the user model
module.exports = mongoose.model('User', userSchema);
