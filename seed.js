import mongoose from 'mongoose';
import dns from 'dns';
import { Firm, Payment, Notification } from './db.js';

dns.setDefaultResultOrder('ipv4first');

async function seed() {
  console.log('Seeding MongoDB database with default data...');

  try {
    // Wait for connection to open
    if (mongoose.connection.readyState === 0) {
      await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }

    // Clean existing data
    await Notification.deleteMany({});
    await Payment.deleteMany({});
    await Firm.deleteMany({});

    // 1. Add "i take good firm"
    const firm1 = await Firm.create({
      name: 'i take good firm',
      email: 'contact@takegood.com',
      phone: '+91 99887 76655'
    });

    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const futureStr = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const pastStr = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];

    // Pending payment 1 (Due tomorrow, which is due soon <= 2 days)
    await Payment.create({
      firm_id: firm1._id,
      amount: 50000,
      status: 'pending',
      due_date: tomorrowStr,
      description: 'Phase 1 - Website Development'
    });

    // Pending payment 2
    await Payment.create({
      firm_id: firm1._id,
      amount: 120000,
      status: 'pending',
      due_date: futureStr,
      description: 'Phase 2 - Backend Integration'
    });

    // Paid payment
    await Payment.create({
      firm_id: firm1._id,
      amount: 75000,
      status: 'paid',
      payment_method: 'Bank Transfer',
      due_date: pastStr,
      payment_date: pastStr,
      description: 'Initial Project Advance'
    });

    // 2. Add "Mogal Krupa Industries"
    const firm2 = await Firm.create({
      name: 'Mogal Krupa Industries',
      email: 'info@mogalkrupa.com',
      phone: '+91 98765 43210'
    });

    // Pending payment
    await Payment.create({
      firm_id: firm2._id,
      amount: 35000,
      status: 'pending',
      due_date: futureStr,
      description: 'Raw Material Invoice #402'
    });

    // Paid payment
    await Payment.create({
      firm_id: firm2._id,
      amount: 45000,
      status: 'paid',
      payment_method: 'UPI',
      due_date: pastStr,
      payment_date: pastStr,
      description: 'Machinery Repair Service'
    });

    console.log('Database seeded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
