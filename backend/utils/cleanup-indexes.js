/**
 * cleanup-indexes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent maintenance script that removes the "ghost" duplicate indexes that
 * sequelize.sync({ alter: true }) accumulated on every boot (email_2, email_3,
 * customer_id_2, …) before the index fix landed. Those duplicates eventually
 * tripped MySQL's hard limit of 64 keys per table ("Too many keys specified").
 *
 * Strategy (safe + repeatable):
 *   • For each target table, read SHOW INDEX.
 *   • Identify every NON-PRIMARY index whose name ends in `_<number>` — that is
 *     precisely the pattern Sequelize uses for the duplicate copies.
 *   • DROP each one. The canonical indexes (email, customer_id, phone, username,
 *     account_number, reference_number) and PRIMARY keys are always preserved.
 *   • Re-runnable: once the ghosts are gone there is simply nothing to drop.
 *
 * Usage:  npm run cleanup-indexes      (from the backend/ directory)
 *         node utils/cleanup-indexes.js
 * Requires the live DB env vars (.env) to be present / reachable.
 */
require('dotenv').config();
const sequelize = require('../config/database');

// Tables that historically carried field-level `unique: true` columns.
const TARGET_TABLES = ['users', 'accounts', 'transactions', 'otps'];

// A ghost duplicate index name always ends with an underscore + digits.
const DUPLICATE_PATTERN = /_[0-9]+$/;

const log = (msg) => console.log(msg);


/**
 * Return true if the given table exists in the current database.
 */
async function tableExists(table) {
  const rows = await sequelize.query(
    'SHOW TABLES LIKE :table',
    { replacements: { table }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.length > 0;
}

/**
 * Clean one table: drop every non-PRIMARY index whose name matches the
 * duplicate pattern. Returns { total, dropped, kept }.
 */
async function cleanTable(table) {
  if (!(await tableExists(table))) {
    log(`\n⏭  ${table.padEnd(14)} — table not found, skipping.`);
    return { total: 0, dropped: 0, kept: 0 };
  }

  // SHOW INDEX returns one row per (index, column). Collapse to distinct names.
  const rows = await sequelize.query(`SHOW INDEX FROM \`${table}\``, {
    type: sequelize.QueryTypes.SELECT,
  });

  const indexNames = [...new Set(rows.map((r) => r.Key_name))];
  const duplicates = indexNames.filter(
    (name) => name !== 'PRIMARY' && DUPLICATE_PATTERN.test(name)
  );

  log(`\n🔎 ${table.padEnd(14)} — ${indexNames.length} indexes total ` +
      `(limit 64), ${duplicates.length} ghost duplicate(s) detected.`);

  let dropped = 0;
  for (const name of duplicates) {
    try {
      await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      dropped += 1;
      log(`   ✅ dropped  ${name}`);
    } catch (err) {
      log(`   ⚠️  could not drop ${name}: ${err.message}`);
    }
  }

  const kept = indexNames.length - dropped;
  return { total: indexNames.length, dropped, kept };
}


/**
 * Entry point: authenticate, sweep every target table, print a summary.
 */
async function run() {
  log('\n🧹 ════════════════════════════════════════════════════');
  log('   ALISTER BANK — DUPLICATE INDEX CLEANUP');
  log('════════════════════════════════════════════════════');

  try {
    await sequelize.authenticate();
    log('✅ Connected to database.');
  } catch (err) {
    console.error(`❌ Could not connect to the database: ${err.message}`);
    console.error('   Ensure DB_HOST/DB_USER/DB_PASS/DB_NAME are set and reachable.');
    process.exit(1);
  }

  let totalDropped = 0;
  for (const table of TARGET_TABLES) {
    try {
      const { dropped } = await cleanTable(table);
      totalDropped += dropped;
    } catch (err) {
      log(`   ⚠️  ${table}: ${err.message}`);
    }
  }

  log('\n════════════════════════════════════════════════════');
  if (totalDropped === 0) {
    log('✨ Database is already pristine — no ghost indexes found.');
  } else {
    log(`✨ Cleanup complete — dropped ${totalDropped} ghost index(es).`);
  }
  log('════════════════════════════════════════════════════\n');

  await sequelize.close();
  process.exit(0);
}

run();
