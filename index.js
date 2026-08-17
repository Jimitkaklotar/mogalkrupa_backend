import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dns from 'dns';
import mongoose from 'mongoose';
import { Firm, Payment, Notification } from './db.js';

// Resolve DNS lookup errors for MongoDB Atlas on Windows environments (BSNL/Indian ISPs)
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- FIRMS ENDPOINTS ---

// Get all firms with aggregated totals
app.get('/api/firms', async (req, res) => {
  try {
    const firms = await Firm.find().sort({ name: 1 });
    
    // Calculate aggregates for each firm dynamically
    const firmsWithTotals = await Promise.all(firms.map(async (firm) => {
      const payments = await Payment.find({ firm_id: firm._id });
      const total_pending = payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0);
      const total_paid = payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);
        
      return {
        ...firm.toJSON(),
        total_pending,
        total_paid
      };
    }));
    
    res.json(firmsWithTotals);
  } catch (error) {
    console.error('Error fetching firms:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add a new firm
app.post('/api/firms', async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Firm name is required.' });
  }

  try {
    const existing = await Firm.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ error: 'A firm with this name already exists.' });
    }

    const newFirm = await Firm.create({
      name: name.trim(),
      email: email ? email.trim() : '',
      phone: phone ? phone.trim() : ''
    });

    res.status(201).json({
      ...newFirm.toJSON(),
      total_pending: 0,
      total_paid: 0
    });
  } catch (error) {
    console.error('Error creating firm:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a firm
app.delete('/api/firms/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: 'Firm not found.' });
  }
  try {
    const firm = await Firm.findById(id);
    if (!firm) {
      return res.status(404).json({ error: 'Firm not found.' });
    }

    await Firm.findByIdAndDelete(id); // Triggers findOneAndDelete cascade hook in db.js
    res.json({ message: 'Firm deleted successfully.' });
  } catch (error) {
    console.error('Error deleting firm:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- PAYMENTS ENDPOINTS ---

// Get payments for a specific firm
app.get('/api/firms/:firmId/payments', async (req, res) => {
  const { firmId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    return res.json([]);
  }
  try {
    const payments = await Payment.find({ firm_id: firmId }).sort({ due_date: -1, created_at: -1 });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add a new payment for a firm
app.post('/api/firms/:firmId/payments', async (req, res) => {
  const { firmId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    return res.status(404).json({ error: 'Firm not found.' });
  }
  const { amount, status, payment_method, due_date, payment_date, description } = req.body;

  if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required.' });
  }
  if (!due_date) {
    return res.status(400).json({ error: 'Due date is required.' });
  }
  if (!status || !['paid', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either paid or pending.' });
  }

  try {
    const firm = await Firm.findById(firmId);
    if (!firm) {
      return res.status(404).json({ error: 'Firm not found.' });
    }

    const finalPaymentMethod = status === 'paid' ? (payment_method || 'Cash') : '';
    const finalPaymentDate = status === 'paid' ? (payment_date || new Date().toISOString().split('T')[0]) : '';

    const newPayment = await Payment.create({
      firm_id: firmId,
      amount: parseFloat(amount),
      status,
      payment_method: finalPaymentMethod,
      due_date,
      payment_date: finalPaymentDate,
      description: description ? description.trim() : ''
    });

    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update a payment
app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }
  const { amount, status, payment_method, due_date, payment_date, description } = req.body;

  if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required.' });
  }
  if (!due_date) {
    return res.status(400).json({ error: 'Due date is required.' });
  }
  if (!status || !['paid', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either paid or pending.' });
  }

  try {
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    const finalPaymentMethod = status === 'paid' ? (payment_method || 'Cash') : '';
    const finalPaymentDate = status === 'paid' ? (payment_date || new Date().toISOString().split('T')[0]) : '';

    payment.amount = parseFloat(amount);
    payment.status = status;
    payment.payment_method = finalPaymentMethod;
    payment.due_date = due_date;
    payment.payment_date = finalPaymentDate;
    payment.description = description ? description.trim() : '';

    await payment.save();
    res.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a payment
app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }
  try {
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    await Payment.findByIdAndDelete(id); // Triggers findOneAndDelete cascade hook in db.js
    res.json({ message: 'Payment record deleted successfully.' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Quick route to mark a pending payment as paid
app.post('/api/payments/:id/pay', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }
  const { payment_method, payment_date } = req.body;

  try {
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    payment.status = 'paid';
    payment.payment_method = payment_method || 'Cash';
    payment.payment_date = payment_date || new Date().toISOString().split('T')[0];

    await payment.save();
    res.json(payment);
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- NOTIFICATIONS & REMINDERS ENDPOINTS ---

// Fetch all notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate({
        path: 'payment_id',
        populate: { path: 'firm_id' }
      })
      .sort({ created_at: -1 });

    const formatted = notifications.map(n => {
      const json = n.toJSON();
      return {
        id: json.id,
        message: json.message,
        type: json.type,
        is_read: json.is_read ? 1 : 0,
        created_at: json.created_at,
        amount: n.payment_id ? n.payment_id.amount : 0,
        firm_name: (n.payment_id && n.payment_id.firm_id) ? n.payment_id.firm_id.name : 'Unknown Firm'
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Mark notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  try {
    const n = await Notification.findByIdAndUpdate(id, { is_read: true }, { new: true });
    res.json(n);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Fetch active reminders (due in <= 2 days or overdue)
app.get('/api/reminders', async (req, res) => {
  try {
    const limitDate = new Date(Date.now() + 2 * 86400000);
    const limitDateStr = limitDate.toISOString().split('T')[0];

    const payments = await Payment.find({
      status: 'pending',
      due_date: { $lte: limitDateStr }
    }).populate('firm_id').sort({ due_date: 1 });

    const formatted = payments.map(p => {
      const json = p.toJSON();
      return {
        ...json,
        firm_name: p.firm_id ? p.firm_id.name : 'Unknown Firm'
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- BACKGROUND EMAIL SENDER & SCHEDULER ---

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'infotchwebbytouch@gmail.com',
    pass: 'odgfrigwiwngtvts'
  }
});

async function checkPaymentReminders() {
  console.log('Running background check for payment reminders...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limitDate = new Date(Date.now() + 2 * 86400000);
    const limitDateStr = limitDate.toISOString().split('T')[0];

    const pendingPayments = await Payment.find({
      status: 'pending',
      notified: false,
      due_date: { $lte: limitDateStr }
    }).populate('firm_id');
    
    for (const payment of pendingPayments) {
      const firmName = payment.firm_id ? payment.firm_id.name : 'Unknown Firm';
      const dueDate = new Date(payment.due_date);
      const isOverdue = today > dueDate;
      
      const timeLabel = isOverdue ? 'OVERDUE' : 'DUE SOON';
      const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      
      let message = '';
      if (isOverdue) {
        message = `Payment of ₹${payment.amount.toLocaleString('en-IN')} for "${firmName}" is OVERDUE (Due on ${payment.due_date}).`;
      } else {
        message = `Payment of ₹${payment.amount.toLocaleString('en-IN')} for "${firmName}" is due in ${daysLeft} days (Due on ${payment.due_date}).`;
      }

      console.log(`Sending reminder email to ghaskatasanjay20@gmail.com for payment ID ${payment._id}...`);

      const mailOptions = {
        from: '"MogalKrupa CRM" <infotchwebbytouch@gmail.com>',
        to: 'ghaskatasanjay20@gmail.com',
        subject: `⚠️ Payment Reminder (${timeLabel}): ${firmName}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 0;">MogalKrupa CRM Ledger</h2>
            <p>Hello,</p>
            <p>This is an automated alert reminding you of the following transaction:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; text-align: left;">
              <tr style="background-color: #f9fafb;">
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; width: 120px;">Client Firm</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${firmName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Amount</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #4f46e5; font-size: 16px;">₹${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style="background-color: #f9fafb;">
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Due Date</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${payment.due_date}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Description</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb; font-style: italic;">${payment.description || 'No description provided.'}</td>
              </tr>
            </table>
            <p>Please log in to your MogalKrupa CRM panel to complete or update this transaction.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #888; text-align: center;">MogalKrupa CRM &copy; ${new Date().getFullYear()}. Fast & secure payment ledger system.</p>
          </div>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent for payment ID ${payment._id}.`);
      } catch (err) {
        console.error(`Failed to send email for payment ID ${payment._id}:`, err);
      }

      // Add In-App Notification
      const type = isOverdue ? 'overdue' : 'due_soon';
      await Notification.create({
        payment_id: payment._id,
        message,
        type
      });

      // Mark as notified in database
      payment.notified = true;
      await payment.save();
    }
  } catch (error) {
    console.error('Error checking payment reminders:', error);
  }
}

// Run reminder checker on startup and every hour
setTimeout(() => {
  checkPaymentReminders();
}, 5000);
setInterval(checkPaymentReminders, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
