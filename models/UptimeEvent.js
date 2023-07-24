// Import necessary modules
const mongoose = require('mongoose');

// Define uptime event schema
const uptimeEventSchema = new mongoose.Schema({
  monitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
  },
  availability: {
    type: String,
    enum: ['Up', 'Down'],
    required: true,
  },
  ping: {
    type: String,
    enum: ['Reachable', 'Unreachable'],
    required: true,
  },
  port: {
    type: String,
    enum: ['Open', 'Closed'],
    required: true,
  },
  responseTime: {
    type: Number,
    required: true,
  },
  confirmedByAgent: {
    type: String,
  },
});

// Create and export the uptime event model
module.exports = mongoose.model('UptimeEvent', uptimeEventSchema);
