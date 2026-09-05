const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  partyId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  replies: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['active', 'FLAGGED_FOR_REVIEW', 'blocked'], default: 'active' },
  showLocation: { type: Boolean, default: false },
  location: { type: String } // Stored but only shown if showLocation is true
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
