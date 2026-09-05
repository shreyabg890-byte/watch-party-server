const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  plan: { 
    type: String, 
    enum: ['Free', 'Bronze', 'Silver', 'Gold'], 
    default: 'Free' 
  },
  
  planExpiry: { type: Date },

  // Download limits tracking
  downloadsToday: { type: Number, default: 0 },
  lastDownloadReset: { type: Date, default: Date.now },

  // Personalization
  theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },

  // Security
  trustedDevices: [{
    deviceId: String,
    browser: String,
    os: String,
    ip: String,
    city: String,
    state: String,
    lastLogin: Date
  }],

  otp: {
    code: String,
    expiresAt: Date
  }
}, { timestamps: true });

// Password hashing
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Reset download count if it's a new day
userSchema.methods.checkDownloadReset = function() {
  const now = new Date();
  const lastReset = new Date(this.lastDownloadReset);
  
  // Check if it's a different day (simple calendar day check)
  if (now.getDate() !== lastReset.getDate() || 
      now.getMonth() !== lastReset.getMonth() || 
      now.getFullYear() !== lastReset.getFullYear()) {
    this.downloadsToday = 0;
    this.lastDownloadReset = now;
  }
};

module.exports = mongoose.model('User', userSchema);
