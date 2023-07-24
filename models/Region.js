// Import necessary modules
const mongoose = require('mongoose');

// Define region schema
const regionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
});

// Create and export the region model
module.exports = mongoose.model('Region', regionSchema);
