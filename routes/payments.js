const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');

const User = require('../models/User');
const Subscription = require('../models/Subscription');

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn('WARNING: Razorpay keys are missing from .env');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLAN_PRICES = {
  Bronze: 99 * 100,
  Silver: 299 * 100,
  Gold: 499 * 100
};

// Create Razorpay Order
router.post('/create-order', async (req, res) => {
  try {
    const { userId, plan } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: 'User ID is required'
      });
    }

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({
        message: 'Invalid plan selected'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    const options = {
      amount: PLAN_PRICES[plan],
      currency: 'INR',
      receipt: `receipt_${userId}_${Date.now()}`
    };

    // Create REAL Razorpay test order
    const order = await razorpay.orders.create(options);

    // Save subscription order in database
    const subscription = new Subscription({
      userId,
      plan,
      razorpayOrderId: order.id,
      amountPaid: options.amount / 100,
      status: 'created'
    });

    await subscription.save();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      user: {
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Razorpay order creation failed:', error);

    res.status(500).json({
      message: 'Unable to create Razorpay order. Check your Razorpay Test Mode keys.'
    });
  }
});


// Verify Razorpay Payment
router.post('/verify-payment', async (req, res) => {
  try {
    const {
      userId,
      orderId,
      paymentId,
      signature
    } = req.body;

    if (!userId || !orderId || !paymentId || !signature) {
      return res.status(400).json({
        message: 'Payment verification details are incomplete'
      });
    }

    const subscription = await Subscription.findOne({
      razorpayOrderId: orderId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        message: 'Subscription order not found'
      });
    }

    // Generate signature using Razorpay secret
    const generatedSignature = crypto
      .createHmac(
        'sha256',
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Verify signature
    if (generatedSignature !== signature) {
      return res.status(400).json({
        message: 'Invalid payment signature'
      });
    }

    // Payment is genuine
    subscription.razorpayPaymentId = paymentId;
    subscription.razorpaySignature = signature;
    subscription.status = 'successful';

    await subscription.save();

    // Update user's subscription plan
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    user.plan = subscription.plan;

    user.planExpiry = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );

    await user.save();

    res.json({
      message: 'Payment verified successfully',
      plan: user.plan
    });

  } catch (error) {
    console.error('Payment verification failed:', error);

    res.status(500).json({
      message: 'Payment verification failed'
    });
  }
});


module.exports = router;