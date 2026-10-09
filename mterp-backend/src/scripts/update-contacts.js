const mongoose = require('../../../mterp-backend/node_modules/mongoose');

async function updateContacts() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa_gateway');
  const contacts = mongoose.connection.collection('contacts');

  // Update Syamil to include Procurement & Corporate
  await contacts.updateOne(
    { phone: '6285720390882' },
    {
      $set: {
        department: 'Procurement, Corporate',
        notes: 'Lead Administrator & Procurement Officer',
        updatedAt: new Date(),
      },
    }
  );

  // Update SCM Master Officer to include Finance
  await contacts.updateOne(
    { phone: '6282115350369' },
    {
      $set: {
        department: 'Finance, Corporate',
        notes: 'Finance & SCM Master Desk',
        updatedAt: new Date(),
      },
    }
  );

  const updated = await contacts.find({}).toArray();
  console.log('Updated contacts:', updated.map(c => `${c.name} [${c.department}] -> ${c.phone}`));

  await mongoose.connection.close();
}

updateContacts().catch(console.error);
