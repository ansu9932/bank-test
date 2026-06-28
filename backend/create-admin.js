const sequelize = require('./config/database');
const AdminUser = require('./models/AdminUser'); 
const bcrypt = require('bcryptjs'); // Change to 'bcrypt' if your app uses that instead

async function makeAdmin() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();

    // 1. Choose your credentials here:
    const adminEmail = 'admin@alisterbank.com';
    const adminUsername = 'admin_cyber';
    const adminPassword = 'SuperSecurePassword2026'; // Put your desired password here

    // 2. Hash the password so the login system accepts it
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // 3. Create the record
    // Note: If your model uses different column names (like 'admin_name'), match them here!
    await AdminUser.create({
      email: adminEmail,
      username: adminUsername,
      password: hashedPassword,
      is_active: true
    });

    console.log(`\n🎉 Admin account created successfully!`);
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔒 Password: ${adminPassword} (Saved securely as hashed string)`);

  } catch (error) {
    console.error('\n❌ Error creating admin:', error.message);
    console.log('💡 Tip: Check backend/models/AdminUser.js to ensure the column names match exactly.');
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

makeAdmin();
