const mongoose = require('../../../mterp-backend/node_modules/mongoose');

async function ensureDepts() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa_gateway');
  const contacts = mongoose.connection.collection('contacts');

  // Let's see existing contacts
  const existing = await contacts.find({}).toArray();
  console.log('Existing contacts:', existing.map(c => `${c.name} (${c.department}) - ${c.phone}`));

  // Check if any procurement contact exists
  const hasProcurement = existing.some(c => c.department && c.department.toLowerCase() === 'procurement');
  if (!hasProcurement) {
    // Add Procurement contact using primary phone (or master phone)
    const masterPhone = existing.length > 0 ? existing[0].phone : '6285720390882';
    await contacts.insertOne({
      name: 'Procurement Desk',
      phone: masterPhone.endsWith('882') ? '6285720390882_proc' : '6285720390882',
      department: 'Procurement',
      isActive: true,
      notes: 'Procurement desk alerts for Material Requests',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).catch(async () => {
      // If phone is unique indexed, update department or add note
      await contacts.updateOne({ phone: masterPhone }, { $set: { notes: 'Corporate & Procurement' } });
    });
  }

  // Also ensure that if phone has unique constraint, contacts for Procurement can be queried by department regex
  // Let's check unique indexes on contacts:
  const indexes = await contacts.indexes();
  console.log('Indexes on contacts:', indexes.map(i => i.name));

  await mongoose.connection.close();
}

ensureDepts().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
