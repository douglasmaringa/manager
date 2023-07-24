// Import necessary modules
const mongoose = require('mongoose');

// Define monitoring agent schema
const monitoringAgentSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
  },
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region',
    required: true,
  },
});

// Create and export the monitoring agent model
module.exports = mongoose.model('MonitoringAgent', monitoringAgentSchema);
