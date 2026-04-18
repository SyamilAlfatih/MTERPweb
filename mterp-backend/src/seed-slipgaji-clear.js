/**
 * seed-slipgaji-clear.js
 * ─────────────────────
 * One-shot cleanup: deletes ALL documents from the slipgajis collection.
 * Run this on the server to clear stuck/orphaned slips that are causing
 * duplicate slipNumber (11000) errors.
 *
 * Usage (on server):
 *   node /home/adminmte/MTERPweb/mterp-backend/src/seed-slipgaji-clear.js
 */

require('dotenv').config({ path: '/home/adminmte/MTERPweb/mterp-backend/.env' });
const mongoose = require('mongoose');
const { SlipGaji } = require('/home/adminmte/MTERPweb/mterp-backend/src/models');

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI).then(async () => {
    console.log('✅ Connected to MongoDB...');

    const count = await SlipGaji.countDocuments({});
    console.log(`⚠️  Found ${count} slip gaji document(s) — deleting all...`);

    const result = await SlipGaji.deleteMany({});
    console.log(`🗑️  Deleted ${result.deletedCount} slip gaji document(s).`);

    console.log('✅ slipgajis collection is now empty. You can regenerate slips fresh.');
    process.exit(0);
}).catch(e => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
});
