const mongoose = require('mongoose');

const alertSchema2 = new mongoose.Schema({
      message: {
        type: String,
        required: true,
      }, 
      type: {
        type: String,
        enum: [
          'Up',
          'Down',
          'Registration',
          '2FA',
          'PasswordReset',
          'DeleteAccount',
        ],
      },
      email: {
        type: String,
        required: true,
      },
      tries: {
        type: Number,
        default: 0,
      },
      maxTries: {
        type: Number,
        default: 3,
      },
}, { timestamps: true }); // Add timestamps option to automatically create 'createdAt' and 'updatedAt' fields

module.exports = mongoose.model('Alert2', alertSchema2);
