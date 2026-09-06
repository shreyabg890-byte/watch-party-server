const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const geoip = require('geoip-lite');
const nodemailer = require('nodemailer');

// ===============================
// EMAIL CONFIGURATION
// ===============================

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

// ===============================
// OTP GENERATOR
// ===============================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ===============================
// SIGNUP
// ===============================

router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    let user = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (user) {
      return res.status(400).json({
        message: 'User already exists'
      });
    }

    // Create new user
    user = new User({
      username,
      email,
      password
    });

    await user.save();

    res.status(201).json({
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Signup error:', error);

    res.status(500).json({
      message: error.message
    });
  }
});

// ===============================
// LOGIN WITH SECURITY CHECKS
// ===============================

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    // ===============================
    // DEVICE / LOCATION TRACKING
    // ===============================

    const ip =
      req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      '127.0.0.1';

    const geo = geoip.lookup(ip) || {
      city: 'Unknown',
      region: 'Unknown'
    };

    const userAgent =
      req.headers['user-agent'] || 'Unknown Browser';

    // Check whether this device is already trusted
    const isKnownDevice = user.trustedDevices.find(
      d => d.ip === ip && d.browser === userAgent
    );

    // ===============================
    // NEW DEVICE → SEND OTP
    // ===============================

    if (!isKnownDevice) {

      const otp = generateOTP();

      // Save OTP for 10 minutes
      user.otp = {
        code: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      };

      await user.save();

      // ===============================
      // SEND OTP EMAIL
      // ===============================

      try {

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Watch Party - Login Verification OTP',

          text: `Hello ${username},

A new device login was detected for your Watch Party account.

Your OTP is: ${otp}

This OTP is valid for 10 minutes.

If you did not attempt to log in, please secure your account.

Regards,
Watch Party Team`
        });

        console.log(
          `OTP email sent successfully to ${user.email}`
        );

      } catch (emailError) {

        console.error(
          'Failed to send OTP email:',
          emailError
        );

        return res.status(500).json({
          message: 'Unable to send OTP email. Please try again later.'
        });
      }

      // Tell frontend that OTP is required
      return res.status(202).json({
        message: 'New device detected. OTP sent to your email.',
        requireOtp: true,
        email: user.email
      });
    }

    // ===============================
    // KNOWN DEVICE → LOGIN DIRECTLY
    // ===============================

    const token = jwt.sign(
      {
        id: user._id,
        plan: user.plan
      },
      process.env.JWT_SECRET || 'secret',
      {
        expiresIn: '7d'
      }
    );

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

    console.error('Login error:', error);

    res.status(500).json({
      message: error.message
    });
  }
});

// ===============================
// VERIFY OTP
// ===============================

router.post('/verify-otp', async (req, res) => {

  try {

    const { username, otp } = req.body;

    // Find user
    const user = await User.findOne({ username });

    if (
      !user ||
      !user.otp ||
      user.otp.code !== otp
    ) {

      return res.status(400).json({
        message: 'Invalid OTP'
      });
    }

    // Check OTP expiration
    if (new Date() > user.otp.expiresAt) {

      return res.status(400).json({
        message: 'OTP expired'
      });
    }

    // ===============================
    // CLEAR OTP
    // ===============================

    user.otp = undefined;

    // ===============================
    // ADD DEVICE TO TRUSTED DEVICES
    // ===============================

    const ip =
      req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      '127.0.0.1';

    const geo = geoip.lookup(ip) || {
      city: 'Unknown',
      region: 'Unknown'
    };

    user.trustedDevices.push({

      browser:
        req.headers['user-agent'] ||
        'Unknown Browser',

      ip,

      city: geo.city,

      state: geo.region,

      lastLogin: new Date()
    });

    await user.save();

    // ===============================
    // CREATE JWT TOKEN
    // ===============================

    const token = jwt.sign(
      {
        id: user._id,
        plan: user.plan
      },
      process.env.JWT_SECRET || 'secret',
      {
        expiresIn: '7d'
      }
    );

    // ===============================
    // SUCCESS RESPONSE
    // ===============================

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

    console.error(
      'OTP verification error:',
      error
    );

    res.status(500).json({
      message: error.message
    });
  }
});

// ===============================
// EXPORT ROUTER
// ===============================

module.exports = router;