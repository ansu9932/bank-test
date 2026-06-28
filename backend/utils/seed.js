require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { User, Account, AdminUser, Transaction, Beneficiary, Notification } = require('../models');
const { generateCustomerID, generateAccountNumber, generateIFSC, generateReferenceNumber, generateReferralCode } = require('./helpers');

const seed = async () => {
  try {
    await sequelize.sync({ force: true });
    console.log('✅ Database synced');

    const passwordHash = await bcrypt.hash('Demo@1234', 12);
    const pinHash = await bcrypt.hash('1234', 12);

    // ── Super Admin ──────────────────────────────────────────────────────────
    await AdminUser.create({
      username: 'superadmin',
      email: 'admin@alisterbank.com',
      password_hash: await bcrypt.hash('Admin@1234', 12),
      full_name: 'Super Administrator',
      role: 'super_admin',
      is_active: true,
    });
    console.log('✅ Super Admin created — admin@alisterbank.com / Admin@1234');

    // ── Demo User 1 ──────────────────────────────────────────────────────────
    const user1 = await User.create({
      customer_id: 'ALB240001',
      first_name: 'Arjun',
      last_name: 'Sharma',
      email: 'arjun@demo.com',
      phone: '9876543210',
      date_of_birth: '1992-05-15',
      gender: 'male',
      father_name: 'Rajesh Sharma',
      nationality: 'Indian',
      occupation: 'Software Engineer',
      annual_income: 1500000,
      address_line1: '42 Tech Park, Whitefield',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560066',
      country: 'India',
      pan_number: 'ABCPS1234D',
      aadhaar_number: '123456789012',
      username: 'arjun_sharma',
      password_hash: passwordHash,
      security_pin: pinHash,
      account_type: 'savings',
      kyc_status: 'approved',
      account_status: 'active',
      email_verified: true,
      setup_completed: true,
      video_kyc_completed: true,
      dark_mode: true,
      referral_code: generateReferralCode('Arjun'),
    });

    const acct1 = await Account.create({
      user_id: user1.id,
      account_number: '4141100000001',
      ifsc_code: 'ALST0000001',
      swift_code: 'ALSTINBB',
      account_type: 'savings',
      balance: 254750.00,
      available_balance: 254750.00,
      currency: 'USD',
      status: 'active',
      interest_rate: 4.00,
      minimum_balance: 5298.00,
      // Demo showcase account: all rails enabled + a workable daily ceiling so
      // the seeded experience can transfer immediately. New real accounts are
      // locked down (externals off, internal on, default limit 100).
      daily_transfer_limit: 100000.00,
      transfer_methods: { imps: true, neft: true, upi: true, internal: true, add_money: true },
    });

    // ── Demo User 2 ──────────────────────────────────────────────────────────
    const user2 = await User.create({
      customer_id: 'ALB240002',
      first_name: 'Priya',
      last_name: 'Nair',
      email: 'priya@demo.com',
      phone: '9876543211',
      date_of_birth: '1995-09-22',
      gender: 'female',
      nationality: 'Indian',
      occupation: 'Business Analyst',
      annual_income: 1200000,
      address_line1: '15 Marine Drive, Colaba',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India',
      pan_number: 'DEFPN5678E',
      username: 'priya_nair',
      password_hash: passwordHash,
      security_pin: pinHash,
      account_type: 'current',
      kyc_status: 'approved',
      account_status: 'active',
      email_verified: true,
      setup_completed: true,
      video_kyc_completed: true,
      dark_mode: true,
      referral_code: generateReferralCode('Priya'),
    });

    const acct2 = await Account.create({
      user_id: user2.id,
      account_number: '4141100000002',
      ifsc_code: 'ALST0000001',
      swift_code: 'ALSTINBB',
      account_type: 'current',
      balance: 182500.00,
      available_balance: 182500.00,
      currency: 'USD',
      status: 'active',
      minimum_balance: 10598.00,
      // Demo showcase account — all rails enabled + workable daily ceiling.
      daily_transfer_limit: 100000.00,
      transfer_methods: { imps: true, neft: true, upi: true, internal: true, add_money: true },
    });

    // ── Seed Transactions for user1 ──────────────────────────────────────────
    const txData = [
      { type: 'credit', mode: 'SALARY', amount: 120000, desc: 'Salary Credit - November 2024', before: 134750, after: 254750, to: null, toName: 'Payroll Services Ltd' },
      { type: 'debit', mode: 'IMPS', amount: 25000, desc: 'Transfer to Priya Nair', before: 254750, after: 229750, to: '4141100000002', toName: 'Priya Nair' },
      { type: 'debit', mode: 'NEFT', amount: 5000, desc: 'Amazon Pay', before: 229750, after: 224750, to: null, toName: 'Amazon Payments' },
      { type: 'credit', mode: 'IMPS', amount: 10000, desc: 'Transfer from Rohan Kumar', before: 214750, after: 224750, to: null, toName: 'Rohan Kumar' },
      { type: 'debit', mode: 'IMPS', amount: 3500, desc: 'Netflix Subscription', before: 224750, after: 221250, to: null, toName: 'Netflix' },
      { type: 'credit', mode: 'INTEREST', amount: 1250, desc: 'Savings Account Interest', before: 220000, after: 221250, to: null, toName: 'Alister Bank' },
      { type: 'debit', mode: 'NEFT', amount: 12000, desc: 'House Rent', before: 232750, after: 220750, to: null, toName: 'Landlord Services' },
      { type: 'debit', mode: 'IMPS', amount: 8000, desc: 'Groceries - BigBasket', before: 242750, after: 234750, to: null, toName: 'BigBasket' },
      { type: 'credit', mode: 'SALARY', amount: 120000, desc: 'Salary Credit - October 2024', before: 14750, after: 134750, to: null, toName: 'Payroll Services Ltd' },
      { type: 'debit', mode: 'IMPS', amount: 15000, desc: 'Credit Card Payment', before: 149750, after: 134750, to: null, toName: 'HDFC Credit Card' },
    ];

    for (let i = 0; i < txData.length; i++) {
      const d = txData[i];
      const daysAgo = i * 3;
      const txDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      await Transaction.create({
        account_id: acct1.id,
        reference_number: generateReferenceNumber(d.mode),
        transaction_type: d.type,
        transfer_mode: d.mode,
        amount: d.amount,
        balance_before: d.before,
        balance_after: d.after,
        description: d.desc,
        narration: d.desc,
        status: 'success',
        to_account_number: d.to,
        to_account_name: d.toName,
        from_account_name: d.type === 'credit' ? d.toName : null,
        processed_at: txDate,
        created_at: txDate,
        updated_at: txDate,
      });
    }

    // ── Beneficiaries ────────────────────────────────────────────────────────
    await Beneficiary.create({
      user_id: user1.id,
      nickname: 'Priya (Friend)',
      account_number: '4141100000002',
      account_name: 'Priya Nair',
      bank_name: 'Alister Bank',
      ifsc_code: 'ALST0000001',
      account_type: 'current',
      is_verified: true,
    });

    await Beneficiary.create({
      user_id: user1.id,
      nickname: 'HDFC Savings',
      account_number: '50100123456789',
      account_name: 'Rohan Kumar',
      bank_name: 'HDFC Bank',
      ifsc_code: 'HDFC0001234',
      account_type: 'savings',
      is_verified: false,
    });

    // ── Notifications ────────────────────────────────────────────────────────
    await Notification.bulkCreate([
      { user_id: user1.id, title: 'Salary Credited ✅', message: '$1,20,000 credited to your account. Enjoy your month!', type: 'transaction', priority: 'high', is_read: false },
      { user_id: user1.id, title: 'Transfer Successful', message: '$25,000 transferred to Priya Nair via IMPS.', type: 'transaction', priority: 'medium', is_read: true },
      { user_id: user1.id, title: 'Welcome to Alister Bank! 🎉', message: 'Your account is active. Explore all banking features.', type: 'kyc', priority: 'medium', is_read: true },
      { user_id: user1.id, title: 'New Login Detected', message: 'Login from Chrome, Windows, Bangalore.', type: 'security', priority: 'medium', is_read: false },
    ]);

    console.log('\n🏦 ════════════════════════════════════════════════════');
    console.log('   ALISTER BANK — DATABASE SEEDED SUCCESSFULLY');
    console.log('════════════════════════════════════════════════════');
    console.log('\n📋 Demo Credentials:');
    console.log('   User 1:  arjun_sharma / Demo@1234  (PIN: 1234)');
    console.log('   User 2:  priya_nair   / Demo@1234  (PIN: 1234)');
    console.log('   Admin:   admin@alisterbank.com / Admin@1234\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
