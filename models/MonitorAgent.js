const mongoose = require('mongoose');

const monitorAgentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
          'monitorAgents',
          'alertAgents',
        ]
      },
  region: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
});

const MonitorAgent = mongoose.model('MonitorAgent', monitorAgentSchema);

module.exports = MonitorAgent;
