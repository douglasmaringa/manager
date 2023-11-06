const mongoose = require('mongoose');

const messageTemplateSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'Up',
      'Down',
      'Registration',
      '2FA',
      'PasswordReset',
      'DeleteAccount',
      'UserDeletion',
    ],
    required: true,
    unique: true,
  },
  from: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model('MessageTemplate', messageTemplateSchema);
