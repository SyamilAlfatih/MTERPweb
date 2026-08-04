const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { User } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB at', MONGODB_URI);

  // 1. Wipe existing users
  await User.deleteMany({});
  console.log('All existing users deleted.');

  // 2. Create the new owner user (User model pre('save') hook will auto-hash this password)
  const user = await User.create({
    username: 'owner',
    email: 'poemalfatih115@gmail.com',
    password: 'password123',
    fullName: 'Project Owner',
    role: 'owner',
    isVerified: true,
  });

  console.log('New owner created successfully:', user.email);
  process.exit(0);
}).catch(e => {
  console.error('Error during seeding:', e);
  process.exit(1);
});


