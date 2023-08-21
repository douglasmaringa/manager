const mongoose = require('mongoose');

const monitorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ['web', 'ping', 'port'], // Specify the allowed values as an array
    required: true,
  },
  isPaused: {
    type: Boolean,
    default: false,
  },
  frequency: {
    type: Number,
    required: true,
  },
  alertFrequency: {
    type: Number,
    enum: [1, 5, 10, 20, 30, 60, 1440], // Minutes: 1 minute to 1 day
    default: 1,
  },
  lastAlertSentAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true }); // Add timestamps option to automatically create 'createdAt' and 'updatedAt' fields

module.exports = mongoose.model('Monitor', monitorSchema);
