const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      },
      url: {
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

module.exports = mongoose.model('Alert', alertSchema);
