const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, enum: ['Bronze', 'Silver', 'Gold'], required: true },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  status: { type: String, enum: ['created', 'successful', 'failed'], default: 'created' },
  amountPaid: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
