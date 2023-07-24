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
}, { timestamps: true }); // Add timestamps option to automatically create 'createdAt' and 'updatedAt' fields

module.exports = mongoose.model('Monitor', monitorSchema);
