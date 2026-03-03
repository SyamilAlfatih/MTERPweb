require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Project, Tool, Request, Supply } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

const seedData = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Project.deleteMany({});
    await Tool.deleteMany({});
    await Request.deleteMany({});
    await Supply.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    const users = await User.create([
      {
        username: 'owner',
        email: 'owner@mterp.com',
        password: 'password123',
        fullName: 'Project Owner',
        role: 'owner',
        isVerified: true,
      },
      {
        username: 'director',
        email: 'director@mterp.com',
        password: 'password123',
        fullName: 'Site Director',
        role: 'director',
        isVerified: true,
      },
      {
        username: 'supervisor',
        email: 'supervisor@mterp.com',
        password: 'password123',
        fullName: 'Site Supervisor',
        role: 'supervisor',
        isVerified: true,
      },
      {
        username: 'admin',
        email: 'admin@mterp.com',
        password: 'password123',
        fullName: 'Asset Admin',
        role: 'asset_admin',
        isVerified: true,
      },
      {
        username: 'worker',
        email: 'worker@mterp.com',
        password: 'password123',
        fullName: 'Construction Worker',
        role: 'worker',
        isVerified: true,
      },
    ]);
    console.log(`Created ${users.length} users`);

    // Create projects (without embedded supplies — supplies are now in their own collection)
    const projects = await Project.create([
      {
        nama: 'Gedung Kantor Pusat',
        lokasi: 'Jakarta Selatan',
        description: 'Pembangunan gedung kantor pusat 10 lantai',
        totalBudget: 50000000000,
        progress: 45,
        status: 'In Progress',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2025-06-30'),
        createdBy: users[0]._id,
        assignedTo: [users[2]._id, users[4]._id],
        workItems: [
          {
            name: 'Pondasi',
            qty: 1, volume: 'LS', unit: 'LS',
            cost: 5000000000, progress: 100, actualCost: 4800000000,
            startDate: new Date('2024-01-15'), endDate: new Date('2024-04-30'),
          },
          {
            name: 'Struktur Kolom',
            qty: 120, volume: 'M3', unit: 'M3',
            cost: 15000000000, progress: 60, actualCost: 9500000000,
            startDate: new Date('2024-03-01'), endDate: new Date('2024-10-31'),
          },
          {
            name: 'Struktur Balok',
            qty: 80, volume: 'M3', unit: 'M3',
            cost: 12000000000, progress: 30, actualCost: 4000000000,
            startDate: new Date('2024-06-01'), endDate: new Date('2025-01-31'),
          },
          {
            name: 'Plat Lantai',
            qty: 2000, volume: 'M2', unit: 'M2',
            cost: 8000000000, progress: 20, actualCost: 1800000000,
            startDate: new Date('2024-08-01'), endDate: new Date('2025-03-31'),
          },
          {
            name: 'Dinding & Partisi',
            qty: 1500, volume: 'M2', unit: 'M2',
            cost: 4000000000, progress: 0, actualCost: 0,
            startDate: new Date('2025-01-01'), endDate: new Date('2025-04-30'),
          },
          {
            name: 'Finishing & MEP',
            qty: 1, volume: 'LS', unit: 'LS',
            cost: 6000000000, progress: 0, actualCost: 0,
            startDate: new Date('2025-03-01'), endDate: new Date('2025-06-30'),
          },
        ],
      },
      {
        nama: 'Jembatan Penyeberangan',
        lokasi: 'Bandung',
        description: 'Konstruksi jembatan penyeberangan orang sepanjang 50m',
        totalBudget: 8000000000,
        progress: 75,
        status: 'In Progress',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2025-02-28'),
        createdBy: users[0]._id,
        assignedTo: [users[2]._id],
        workItems: [
          {
            name: 'Fondasi Pier',
            qty: 4, volume: 'LS', unit: 'LS',
            cost: 2000000000, progress: 100, actualCost: 1900000000,
            startDate: new Date('2024-06-01'), endDate: new Date('2024-08-31'),
          },
          {
            name: 'Struktur Baja',
            qty: 1, volume: 'LS', unit: 'LS',
            cost: 4000000000, progress: 80, actualCost: 3200000000,
            startDate: new Date('2024-08-01'), endDate: new Date('2024-12-31'),
          },
          {
            name: 'Lantai Jembatan',
            qty: 200, volume: 'M2', unit: 'M2',
            cost: 1500000000, progress: 40, actualCost: 650000000,
            startDate: new Date('2024-11-01'), endDate: new Date('2025-02-28'),
          },
        ],
      },
      {
        nama: 'Renovasi Gudang Logistik',
        lokasi: 'Surabaya',
        description: 'Renovasi dan perluasan gudang logistik',
        totalBudget: 2500000000,
        progress: 100,
        status: 'Completed',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-09-30'),
        createdBy: users[1]._id,
        assignedTo: [users[4]._id],
      },
    ]);
    console.log(`Created ${projects.length} projects`);

    // Create supplies in separate collection
    const supplies = await Supply.create([
      {
        projectId: projects[0]._id,
        item: 'Besi 16mm', qty: 5000, unit: 'btg',
        cost: 500000000, actualCost: 480000000, status: 'Delivered',
        startDate: new Date('2024-01-15'), endDate: new Date('2024-03-15'),
      },
      {
        projectId: projects[0]._id,
        item: 'Semen 50kg', qty: 10000, unit: 'sak',
        cost: 200000000, actualCost: 150000000, status: 'Ordered',
        startDate: new Date('2024-03-01'), endDate: new Date('2024-08-31'),
      },
      {
        projectId: projects[0]._id,
        item: 'Keramik 60x60', qty: 2000, unit: 'M2',
        cost: 150000000, actualCost: 0, status: 'Pending',
        startDate: new Date('2025-02-01'), endDate: new Date('2025-05-31'),
      },
      {
        projectId: projects[0]._id,
        item: 'Besi 12mm', qty: 3000, unit: 'btg',
        cost: 300000000, actualCost: 290000000, status: 'Delivered',
        startDate: new Date('2024-02-01'), endDate: new Date('2024-05-31'),
      },
      {
        projectId: projects[0]._id,
        item: 'Cat Interior & Eksterior', qty: 500, unit: 'ltr',
        cost: 100000000, actualCost: 0, status: 'Pending',
        startDate: new Date('2025-04-01'), endDate: new Date('2025-06-30'),
      },
    ]);
    console.log(`Created ${supplies.length} supplies`);

    // Create tools
    const tools = await Tool.create([
      { nama: 'Excavator CAT 320', kategori: 'Heavy Equipment', stok: 2, satuan: 'unit', kondisi: 'Baik', lokasi: 'Gudang Pusat' },
      { nama: 'Concrete Mixer', kategori: 'Mixing', stok: 5, satuan: 'unit', kondisi: 'Baik', lokasi: 'Site Jakarta' },
      { nama: 'Vibrator Beton', kategori: 'Finishing', stok: 10, satuan: 'unit', kondisi: 'Baik', lokasi: 'Site Jakarta' },
      { nama: 'Scaffolding Set', kategori: 'Access', stok: 50, satuan: 'set', kondisi: 'Baik', lokasi: 'Gudang Pusat' },
      { nama: 'Theodolite', kategori: 'Survey', stok: 3, satuan: 'unit', kondisi: 'Baik', lokasi: 'Site Bandung' },
      { nama: 'Generator 50kVA', kategori: 'Power', stok: 4, satuan: 'unit', kondisi: 'Maintenance', lokasi: 'Service Center' },
      { nama: 'Compactor Plate', kategori: 'Compaction', stok: 6, satuan: 'unit', kondisi: 'Baik', lokasi: 'Site Jakarta' },
      { nama: 'Bar Cutter', kategori: 'Steel Work', stok: 4, satuan: 'unit', kondisi: 'Rusak', lokasi: 'Service Center' },
    ]);
    console.log(`Created ${tools.length} tools`);

    // Create material requests (qty is now Number)
    const requests = await Request.create([
      {
        item: 'Besi Beton D16',
        qty: 200,
        dateNeeded: '2025-02-15',
        purpose: 'Untuk kolom lantai 5-6',
        costEstimate: 50000000,
        status: 'Pending',
        urgency: 'High',
        requestedBy: users[2]._id,
        projectId: projects[0]._id,
      },
      {
        item: 'Semen Portland 50kg',
        qty: 500,
        dateNeeded: '2025-02-10',
        purpose: 'Pengecoran plat lantai 4',
        costEstimate: 75000000,
        status: 'Approved',
        urgency: 'Normal',
        requestedBy: users[2]._id,
        projectId: projects[0]._id,
        approvedBy: users[1]._id,
      },
      {
        item: 'Cat Dinding Interior',
        qty: 100,
        dateNeeded: '2025-03-01',
        purpose: 'Finishing lantai 1-3',
        costEstimate: 30000000,
        status: 'Pending',
        urgency: 'Low',
        requestedBy: users[4]._id,
        projectId: projects[0]._id,
      },
    ]);
    console.log(`Created ${requests.length} requests`);

    console.log('\n✅ Seed data created successfully!');
    console.log('\nTest Accounts:');
    console.log('  Owner:      owner / password123');
    console.log('  Director:   director / password123');
    console.log('  Supervisor: supervisor / password123');
    console.log('  Admin:      admin / password123');
    console.log('  Worker:     worker / password123');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();