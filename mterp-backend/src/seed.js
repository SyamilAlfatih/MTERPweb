require('dotenv').config({ path: '/home/adminmte/MTERPweb/mterp-backend/.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // Import bcrypt
const { User } = require('/home/adminmte/MTERPweb/mterp-backend/src/models');

const saltRounds = 10; // Standard security level

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB...');

  // 1. Wipe existing users
  await User.deleteMany({});
  console.log('All existing users deleted.');

  // 2. Hash the password manually for the seed script
  const plainPassword = '@kvsy@m1l115';
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

  // 3. Create the new owner user with the hashed password
  const user = await User.create({
    username: 'supusrsyam',
    email: 'poemalfatih115@gmail.com',
    password: hashedPassword, // Store the hash, not the plain text
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
