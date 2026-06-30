/**
 * Create (or promote) a SUPER ADMIN.
 *
 * Usage (run from the backend folder on the server):
 *   node create-admin.js                                   # creates the default super admin
 *   node create-admin.js <email> <username> <password> "<Full Name>"
 *
 * Examples:
 *   node create-admin.js boss@alisterbank.com bossman 'StrongPass#2026' "Bank Boss"
 *
 * If an admin with that email OR username already exists, it is PROMOTED to
 * super_admin (and reactivated) without changing the password.
 */
const { Op } = require('sequelize');
const sequelize = require('./config/database');
const AdminUser = require('./models/AdminUser');
const bcrypt = require('bcryptjs');

async function makeAdmin() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();

    // Credentials from CLI args, with sensible defaults.
    const email = process.argv[2] || 'admin@alisterbank.com';
    const username = process.argv[3] || 'admin_cyber';
    const password = process.argv[4] || 'SuperSecurePassword2026';
    const fullName = process.argv[5] || 'Super Admin';

    const existing = await AdminUser.findOne({ where: { [Op.or]: [{ email }, { username }] } });

    if (existing) {
      await existing.update({ role: 'super_admin', is_active: true });
      console.log(`\n✅ Existing admin "${existing.username}" was promoted to super_admin (password unchanged).`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      await AdminUser.create({
        email,
        username,
        full_name: fullName,
        password_hash: hashedPassword,
        role: 'super_admin',
        is_active: true,
      });
      console.log('\n🎉 Super admin created successfully!');
      console.log(`👤 Username: ${username}`);
      console.log(`📧 Email:    ${email}`);
      console.log(`🔒 Password: ${password} (stored as a bcrypt hash)`);
    }
  } catch (error) {
    console.error('\n❌ Error creating super admin:', error.message);
    console.log('💡 Tip: check that backend/models/AdminUser.js column names match.');
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

makeAdmin();
