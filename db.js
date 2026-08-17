import mongoose from 'mongoose';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const mongoURI = 'mongodb://jimitkaklotar786_db_user:eub6CNbUu1EbPLw0@ac-oa0t0mr-shard-00-00.viv29ae.mongodb.net:27017,ac-oa0t0mr-shard-00-01.viv29ae.mongodb.net:27017,ac-oa0t0mr-shard-00-02.viv29ae.mongodb.net:27017/mogalkrupa_crm?ssl=true&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(mongoURI)
  .then(() => console.log('Successfully connected to MongoDB Atlas.'))
  .catch((err) => console.error('MongoDB Atlas connection error:', err));

// 1. Firm Schema
const firmSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Cascade deletes hook: when a Firm is deleted, remove all associated Payments and Notifications
firmSchema.pre('findOneAndDelete', async function(next) {
  try {
    const firmId = this.getQuery()._id;
    if (firmId) {
      const payments = await Payment.find({ firm_id: firmId });
      const paymentIds = payments.map(p => p._id);
      
      // Delete all notifications linked to those payments
      await Notification.deleteMany({ payment_id: { $in: paymentIds } });
      // Delete all payments
      await Payment.deleteMany({ firm_id: firmId });
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Custom JSON serialization to keep id matching SQLite key name for frontend compatibility
firmSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) { ret.id = ret._id.toString(); delete ret._id; }
});

export const Firm = mongoose.model('Firm', firmSchema);

// 2. Payment Schema
const paymentSchema = new mongoose.Schema({
  firm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'pending'], default: 'pending', required: true },
  payment_method: { type: String, default: 'Cash' },
  due_date: { type: String, required: true }, // Format: YYYY-MM-DD
  payment_date: { type: String, default: '' }, // Format: YYYY-MM-DD
  description: { type: String, default: '' },
  notified: { type: Boolean, default: false }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Cascade deletes hook: when a Payment is deleted, remove all associated Notifications
paymentSchema.pre('findOneAndDelete', async function(next) {
  try {
    const paymentId = this.getQuery()._id;
    if (paymentId) {
      await Notification.deleteMany({ payment_id: paymentId });
    }
    next();
  } catch (err) {
    next(err);
  }
});

paymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) { ret.id = ret._id.toString(); delete ret._id; }
});

export const Payment = mongoose.model('Payment', paymentSchema);

// 3. Notification Schema
const notificationSchema = new mongoose.Schema({
  payment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['due_soon', 'overdue'], required: true },
  is_read: { type: Boolean, default: false }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

notificationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) { ret.id = ret._id.toString(); delete ret._id; }
});

export const Notification = mongoose.model('Notification', notificationSchema);
