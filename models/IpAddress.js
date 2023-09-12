// models/IpAddress.js
const mongoose = require('mongoose');

const ipAddressSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
  },
});

const IpAddress = mongoose.model('IpAddress', ipAddressSchema);

module.exports = IpAddress;
