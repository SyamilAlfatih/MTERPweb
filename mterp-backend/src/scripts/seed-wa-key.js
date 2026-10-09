const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load Scraps env
const envPath = path.resolve(__dirname, '../../../../Scraps/.env');
let mongoUri = 'mongodb://127.0.0.1:27017/wa_gateway';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('MONGO_URI=')) {
      mongoUri = trimmed.slice('MONGO_URI='.length).replace(/^['"](.*)['"]$/, '$1');
    }
  }
}

const rawKey = 'sk_mterp_' + crypto.randomBytes(24).toString('hex');
const prefix = rawKey.slice(0, 10);
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

// Use mongoose
const mongoose = require('mongoose');

async function seedKey() {
  console.log('Connecting to MongoDB at:', mongoUri);
  await mongoose.connect(mongoUri);
  const ApiKey = mongoose.connection.collection('apikeys');
  
  await ApiKey.updateOne(
    { name: 'MTERP Web System' },
    {
      $set: {
        name: 'MTERP Web System',
        keyHash: keyHash,
        prefix: prefix,
        isActive: true,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  console.log('\n======================================================');
  console.log('✅ MTERP API Key seeded successfully in wa_gateway!');
  console.log('------------------------------------------------------');
  console.log('MTERP_RAW_KEY=' + rawKey);
  console.log('PREFIX=' + prefix);
  console.log('KEY_HASH=' + keyHash);
  console.log('======================================================\n');

  await mongoose.connection.close();
  process.exit(0);
}

seedKey().catch((err) => {
  console.error('❌ Failed to seed key:', err.message);
  process.exit(1);
});
