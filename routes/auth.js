const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const geoip = require('geoip-lite');
// const nodemailer = require('nodemailer'); // We'll mock email sending for now to avoid crashes if no credentials

// Helper to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) return res.status(400).json({ message: 'User already exists' });

    user = new User({ username, email, password });
    await user.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login with Security Checks
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Device/Location tracking
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
    const geo = geoip.lookup(ip) || { city: 'Unknown', region: 'Unknown' };
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';

    // Simple check: is this a new IP/Browser?
    const isKnownDevice = user.trustedDevices.find(d => d.ip === ip && d.browser === userAgent);

    if (!isKnownDevice) {
      // It's a new device, require OTP
      const otp = generateOTP();
      user.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60000) }; // 10 mins
      await user.save();
      
      // In production, send via Nodemailer. For now, log it.
      console.log(`SECURITY ALERT: New device login for ${username}. OTP is ${otp}. Please verify.`);
      
      return res.status(202).json({ 
        message: 'New device detected. OTP sent to email.',
        requireOtp: true,
        email: user.email // just for frontend hints
      });
    }

    // Success
    const token = jwt.sign({ id: user._id, plan: user.plan }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan,
        theme: user.theme
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;
    const user = await User.findOne({ username });
    
    if (!user || !user.otp || user.otp.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Clear OTP and add to trusted
    user.otp = undefined;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
    const geo = geoip.lookup(ip) || { city: 'Unknown', region: 'Unknown' };
    
    user.trustedDevices.push({
      browser: req.headers['user-agent'] || 'Unknown Browser',
      ip,
      city: geo.city,
      state: geo.region,
      lastLogin: new Date()
    });
    
    await user.save();

    const token = jwt.sign({ id: user._id, plan: user.plan }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        plan: user.plan,
        theme: user.theme
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
