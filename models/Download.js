const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  videoId: { type: String, required: true },
  videoTitle: { type: String, required: true },
  thumbnail: { type: String },
  planAtTimeOfDownload: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Download', downloadSchema);
