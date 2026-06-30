/**
 * Admin device management CLI — lockout fallback.
 *
 * Run on the server (from the backend folder) if you ever can't get into the
 * admin panel to approve a device:
 *
 *   node manage-admin-devices.js list
 *   node manage-admin-devices.js approve <device_id|id>
 *   node manage-admin-devices.js revoke  <device_id|id>
 *
 * `device_id` is the long value shown on the admin login page / Devices list;
 * `id` is the row UUID. Either works.
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, AdminDevice } = require('./models');

async function main() {
  const [, , cmd, arg] = process.argv;
  await sequelize.authenticate();

  if (cmd === 'list') {
    const devices = await AdminDevice.findAll({ order: [['created_at', 'DESC']] });
    if (!devices.length) {
      console.log('No admin devices recorded yet.');
    } else {
      console.log(`\n${devices.length} device(s):\n`);
      devices.forEach((d) => {
        console.log(`[${d.status.toUpperCase().padEnd(8)}] ${d.label || 'Unknown'}`);
        console.log(`   device_id: ${d.device_id}`);
        console.log(`   row id   : ${d.id}   ip: ${d.ip_address || '—'}\n`);
      });
    }
  } else if (cmd === 'approve' || cmd === 'revoke') {
    if (!arg) {
      console.log(`Usage: node manage-admin-devices.js ${cmd} <device_id|id>`);
      process.exit(1);
    }
    const device = await AdminDevice.findOne({ where: { [Op.or]: [{ id: arg }, { device_id: arg }] } });
    if (!device) {
      console.log('Device not found:', arg);
      process.exit(1);
    }
    await device.update(
      cmd === 'approve'
        ? { status: 'approved', approved_at: new Date() }
        : { status: 'revoked' }
    );
    console.log(`✅ Device ${cmd}d: ${device.label || device.device_id}`);
  } else {
    console.log('Usage:\n  node manage-admin-devices.js list\n  node manage-admin-devices.js approve <device_id|id>\n  node manage-admin-devices.js revoke <device_id|id>');
  }

  await sequelize.close();
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
