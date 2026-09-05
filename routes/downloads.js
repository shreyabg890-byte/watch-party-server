const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Download = require('../models/Download');

const PLAN_LIMITS = {
  Free: 1,
  Bronze: 5,
  Silver: 20,
  Gold: Infinity
};

// Check if user can download and record it
router.post('/record', async (req, res) => {
  try {
    const { userId, videoId, videoTitle, thumbnail } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Reset downloads if it's a new day
    user.checkDownloadReset();

    const limit = PLAN_LIMITS[user.plan] || 0;

    if (user.downloadsToday >= limit) {
      return res.status(403).json({ 
        message: 'Daily download limit reached.', 
        limitReached: true,
        currentPlan: user.plan
      });
    }

    // Record the download
    const download = new Download({
      userId: user._id,
      videoId,
      videoTitle,
      thumbnail,
      planAtTimeOfDownload: user.plan
    });
    await download.save();

    // Increment count
    user.downloadsToday += 1;
    await user.save();

    res.json({ 
      message: 'Download authorized', 
      remainingDownloads: limit - user.downloadsToday,
      downloadId: download._id
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user download history
router.get('/history/:userId', async (req, res) => {
  try {
    const downloads = await Download.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(downloads);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
