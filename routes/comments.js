const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const User = require('../models/User');

// Simple Moderation Dictionary
const ABUSIVE_WORDS = ['spam', 'abuse', 'hate', 'badword1'];

const isClean = (text) => {
  const lower = text.toLowerCase();
  for (let word of ABUSIVE_WORDS) {
    if (lower.includes(word)) return false;
  }
  // Check repeated special chars
  if (/(.)\1{4,}/.test(text)) return false; // e.g. "!!!!!"
  return true;
};

// Fetch Comments for a Party
router.get('/:partyId', async (req, res) => {
  try {
    const comments = await Comment.find({ partyId: req.params.partyId, status: 'active' }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Post Comment
router.post('/', async (req, res) => {
  try {
    const { partyId, userId, text, showLocation } = req.body;

    if (!isClean(text)) {
      return res.status(400).json({ message: 'Comment blocked by moderation.' });
    }

    const user = await User.findById(userId);
    let location = 'Unknown';
    if (user && user.trustedDevices.length > 0) {
      location = user.trustedDevices[user.trustedDevices.length - 1].city;
    }

    const comment = new Comment({
      partyId,
      userId,
      username: user ? user.username : 'Anonymous',
      text,
      showLocation,
      location: showLocation ? location : null
    });

    await comment.save();
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Like / Dislike
router.post('/:commentId/react', async (req, res) => {
  try {
    const { action } = req.body; // 'like' or 'dislike'
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (action === 'like') comment.likes += 1;
    if (action === 'dislike') comment.dislikes += 1;
    
    await comment.save();
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Report Comment
router.post('/:commentId/report', async (req, res) => {
  try {
    const { reportedByUserId, reason } = req.body;
    
    const report = new Report({
      commentId: req.params.commentId,
      reportedByUserId,
      reason
    });
    
    await report.save();

    // Auto flag if >= 3 reports
    const reportCount = await Report.countDocuments({ commentId: req.params.commentId });
    if (reportCount >= 3) {
      await Comment.findByIdAndUpdate(req.params.commentId, { status: 'FLAGGED_FOR_REVIEW' });
    }

    res.json({ message: 'Report submitted for review.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin Route: Get all reported/flagged comments
router.get('/admin/flagged', async (req, res) => {
  try {
    const comments = await Comment.find({ status: 'FLAGGED_FOR_REVIEW' }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin Route: Update comment status (approve or block)
router.post('/admin/:commentId/status', async (req, res) => {
  try {
    const { status } = req.body; // 'active' or 'blocked'
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const comment = await Comment.findByIdAndUpdate(req.params.commentId, { status }, { new: true });
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
