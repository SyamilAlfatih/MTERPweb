const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const {
  User,
  Project,
  ProjectTask,
  ProjectCalendar,
  ProjectResource,
  Supply,
  RABItem,
  LocalPurchase,
  DailyReport,
} = require('./models');
const { recalculateProjectSchedule } = require('./utils/scheduling');
const { syncProjectTasksToProjectEntities } = require('./utils/projectSync');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

/**
 * Standard RAB unit of measure mapper
 */
function toRABUnit(unit) {
  const u = (unit || '').toUpperCase().trim();
  if (['M3', 'CUM', 'KUBIK'].includes(u)) return 'CUM';
  if (['M2', 'SQM', 'PERSEGI'].includes(u)) return 'SQM';
  if (['M', 'MTR', 'METER'].includes(u)) return 'MTR';
  if (['TON', 'MT'].includes(u)) return 'MT';
  if (['KG', 'KILOGRAM'].includes(u)) return 'KG';
  if (['SAK', 'ZAK', 'SEMEN'].includes(u)) return 'ZAK';
  if (['HOK', 'HARI', 'MAN-DAY'].includes(u)) return 'HOK';
  if (['JAM', 'HOUR'].includes(u)) return 'JAM';
  if (['LS', 'LUMP', 'LUMPSUM'].includes(u)) return 'LS';
  if (['BTG', 'BATANG', 'TITIK', 'BH', 'BUAH', 'LBR', 'LEMBAR', 'NOS', 'PCS', 'ROLL', 'SET', 'UNIT'].includes(u)) return 'PCS';
  return 'PCS';
}

/**
 * Standard RAB category mapper
 */
function toRABCategory(category, itemType) {
  if (itemType === 'supply') return 'Material';
  const c = (category || '').toLowerCase();
  if (c.includes('labor') || c.includes('upah')) return 'Upah';
  if (c.includes('subcon') || c.includes('subkon')) return 'Subkon';
  if (c.includes('equip') || c.includes('alat')) return 'Alat';
  if (c.includes('material')) return 'Material';
  return 'Lainnya';
}

async function runSeed() {
  console.log('====================================================');
  console.log('🚀 MTERP Construction ERP - Database Seed & Alignment');
  console.log('====================================================');

  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to MongoDB at: ${MONGODB_URI}`);

  // =========================================================================
  // 1. SEED / UPSERT USERS
  // =========================================================================
  console.log('\n--- 1. Seeding Users & Project Stakeholders ---');
  const userDefs = [
    {
      username: 'owner',
      email: 'poemalfatih115@gmail.com',
      password: 'password123',
      fullName: 'Ir. H. Syamil Alfatih',
      role: 'owner',
      position: 'Project Owner & Main Investor',
      isVerified: true,
      phone: '081234567890',
      bpjsTk: '00018273645',
      bpjsKesehatan: '00091827364',
    },
    {
      username: 'director',
      email: 'director@mterp.com',
      password: 'password123',
      fullName: 'Ir. Bambang Wicaksono, MM',
      role: 'director',
      position: 'Operational & Engineering Director',
      isVerified: true,
      phone: '081211223344',
      bpjsTk: '00019283746',
      bpjsKesehatan: '00092837465',
    },
    {
      username: 'sitemanager',
      email: 'manager@mterp.com',
      password: 'password123',
      fullName: 'Ir. Budi Santoso, ST, MT',
      role: 'site_manager',
      position: 'Chief Site Manager',
      isVerified: true,
      phone: '081298765432',
      bpjsTk: '00028374651',
      bpjsKesehatan: '00082736451',
    },
    {
      username: 'supervisor',
      email: 'supervisor@mterp.com',
      password: 'password123',
      fullName: 'Hendro Prasetyo, ST',
      role: 'supervisor',
      position: 'Civil & Structure Site Supervisor',
      isVerified: true,
      phone: '081345678901',
      bpjsTk: '00039485762',
      bpjsKesehatan: '00073645182',
    },
    {
      username: 'adminproject',
      email: 'admin@mterp.com',
      password: 'password123',
      fullName: 'Siti Rahmawati, SE',
      role: 'admin_project',
      position: 'Project Administration & Cost Control',
      isVerified: true,
      phone: '081567890123',
      bpjsTk: '00040596873',
      bpjsKesehatan: '00064518293',
    },
    {
      username: 'tukang1',
      email: 'tukang1@mterp.com',
      password: 'password123',
      fullName: 'Ahmad Subarjo',
      role: 'foreman',
      position: 'Mandor Utama Struktur & Lapangan',
      isVerified: true,
      phone: '081789012345',
      bpjsTk: '00051607984',
      bpjsKesehatan: '00055627381',
    },
    {
      username: 'worker1',
      email: 'worker1@mterp.com',
      password: 'password123',
      fullName: 'Dedi Kurniawan',
      role: 'worker',
      position: 'Logistics & Field Warehouse Helper',
      isVerified: true,
      phone: '081890123456',
      bpjsTk: '00062718095',
      bpjsKesehatan: '00044738290',
    },
  ];

  const seededUsers = [];
  for (const u of userDefs) {
    let existing = await User.findOne({ email: u.email });
    if (!existing) {
      existing = await User.create(u);
      console.log(`  ✓ Created user: ${existing.fullName} [${existing.role}] (${existing.email})`);
    } else {
      if (!existing.bpjsTk && u.bpjsTk) existing.bpjsTk = u.bpjsTk;
      if (!existing.bpjsKesehatan && u.bpjsKesehatan) existing.bpjsKesehatan = u.bpjsKesehatan;
      if (u.role && existing.role !== u.role) existing.role = u.role;
      if (u.position && existing.position !== u.position) existing.position = u.position;
      await existing.save();
      console.log(`  ✓ Verified user: ${existing.fullName} [${existing.role}] (${existing.email})`);
    }
    seededUsers.push(existing);
  }

  const owner = seededUsers.find(u => u.role === 'owner') || seededUsers[0];
  const director = seededUsers.find(u => u.role === 'director') || seededUsers[0];
  const siteManager = seededUsers.find(u => u.role === 'site_manager') || seededUsers[0];
  const supervisor = seededUsers.find(u => u.role === 'supervisor') || seededUsers[0];
  const adminProject = seededUsers.find(u => u.role === 'admin_project') || seededUsers[0];
  const foreman = seededUsers.find(u => u.role === 'foreman') || seededUsers[0];
  const worker = seededUsers.find(u => u.role === 'worker') || seededUsers[0];

  // =========================================================================
  // 2. SEED PROJECT 1 (FLAGSHIP ACTIVE: WAREHOUSE & LOGISTICS HUB MM2100)
  // =========================================================================
  console.log('\n--- 2. Seeding Flagship Project: Warehouse MM2100 ---');
  const project1Name = 'Pembangunan Warehouse & Logistic Hub MM2100';

  // Idempotent cleanups for project 1
  let project1 = await Project.findOne({ nama: project1Name });
  if (project1) {
    console.log(`  Found existing project: "${project1.nama}" (ID: ${project1._id}). Resetting related entities...`);
    await ProjectTask.deleteMany({ projectId: project1._id });
    await Supply.deleteMany({ projectId: project1._id });
    await RABItem.deleteMany({ projectId: project1._id });
    await LocalPurchase.deleteMany({ projectId: project1._id });
    await DailyReport.deleteMany({ projectId: project1._id });
    await ProjectCalendar.deleteMany({ projectId: project1._id });
    await ProjectResource.deleteMany({ projectId: project1._id });
  } else {
    project1 = new Project({
      nama: project1Name,
      createdBy: owner._id,
    });
  }

  project1.lokasi = 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat, Bekasi';
  project1.description = 'Proyek konstruksi gudang logistik modern 2 lantai dilengkapi area loading dock 8 bays, kantor operasional 400 m2, sistem fire hydrant/sprinkler standar NFPA, dan perkerasan rigid pavement heavy-duty.';
  project1.totalBudget = 14350150000; // Exact rollup sum of WBS tree
  project1.status = 'In Progress';
  project1.startDate = new Date('2026-08-03T00:00:00.000Z');
  project1.endDate = new Date('2026-12-19T00:00:00.000Z');
  project1.progress = 58;
  project1.assignedTo = seededUsers.map(u => u._id);
  project1.documentFiles = [
    {
      name: 'ShopDrawing-Warehouse-MM2100-Struktur-Rev3.pdf',
      category: 'shopDrawing',
      filePath: 'uploads/documents/ShopDrawing-Warehouse-MM2100-Struktur-Rev3.pdf',
      fileSize: 14502000,
      mimeType: 'application/pdf',
      uploadedBy: supervisor._id,
      uploadedAt: new Date('2026-08-01T08:00:00.000Z'),
    },
    {
      name: 'Rencana-Keselamatan-K3L-Konstruksi-Gudang.pdf',
      category: 'hse',
      filePath: 'uploads/documents/Rencana-Keselamatan-K3L-Konstruksi-Gudang.pdf',
      fileSize: 4200150,
      mimeType: 'application/pdf',
      uploadedBy: siteManager._id,
      uploadedAt: new Date('2026-08-02T10:00:00.000Z'),
    },
    {
      name: 'Daftar-Tenaga-Kerja-Subkon-Struktur-Baja.pdf',
      category: 'manPowerList',
      filePath: 'uploads/documents/Daftar-Tenaga-Kerja-Subkon-Struktur-Baja.pdf',
      fileSize: 1250000,
      mimeType: 'application/pdf',
      uploadedBy: adminProject._id,
      uploadedAt: new Date('2026-08-03T11:00:00.000Z'),
    },
    {
      name: 'Spesifikasi-Teknis-Material-Baja-WF-Dan-Beton.pdf',
      category: 'materialList',
      filePath: 'uploads/documents/Spesifikasi-Teknis-Material-Baja-WF-Dan-Beton.pdf',
      fileSize: 5800000,
      mimeType: 'application/pdf',
      uploadedBy: director._id,
      uploadedAt: new Date('2026-08-03T14:00:00.000Z'),
    },
  ];
  await project1.save();
  console.log(`  ✓ Project saved: "${project1.nama}" (ID: ${project1._id})`);

  // 2.1 Calendar
  const calendar1 = await ProjectCalendar.create({
    projectId: project1._id,
    name: 'Standard Construction Indonesia (Mon-Sat)',
    isDefault: true,
    workingDays: [1, 2, 3, 4, 5, 6],
    hoursPerDay: 8,
    workingHours: [{ start: '08:00', end: '17:00' }],
    exceptions: [
      {
        name: 'HUT Kemerdekaan RI ke-81',
        startDate: new Date('2026-08-17T00:00:00.000Z'),
        finishDate: new Date('2026-08-17T23:59:59.000Z'),
        isWorkingDay: false,
      },
      {
        name: 'Maulid Nabi Muhammad SAW',
        startDate: new Date('2026-09-04T00:00:00.000Z'),
        finishDate: new Date('2026-09-04T23:59:59.000Z'),
        isWorkingDay: false,
      },
    ],
  });
  console.log(`  ✓ Created ProjectCalendar: "${calendar1.name}"`);

  // 2.2 Project Resources
  const resources1 = [
    { name: siteManager.fullName, userId: siteManager._id, type: 'Work', maxUnits: 100, standardRate: 750000, group: 'Management' },
    { name: supervisor.fullName, userId: supervisor._id, type: 'Work', maxUnits: 100, standardRate: 500000, group: 'Field Staff' },
    { name: adminProject.fullName, userId: adminProject._id, type: 'Work', maxUnits: 100, standardRate: 400000, group: 'Administration' },
    { name: foreman.fullName, userId: foreman._id, type: 'Work', maxUnits: 100, standardRate: 350000, group: 'Field Staff' },
    { name: worker.fullName, userId: worker._id, type: 'Work', maxUnits: 100, standardRate: 200000, group: 'Field Staff' },
    { name: 'Mobile Crane 25 Ton Kato', type: 'Material', maxUnits: 100, standardRate: 3500000, group: 'Heavy Equipment' },
    { name: 'Concrete Pump Truck Long Boom', type: 'Material', maxUnits: 100, standardRate: 2800000, group: 'Heavy Equipment' },
  ];
  for (const r of resources1) {
    await ProjectResource.create({ projectId: project1._id, ...r });
  }
  console.log(`  ✓ Created ${resources1.length} ProjectResources`);

  // 2.3 Comprehensive WBS Task Tree
  const rawTasks1 = [
    // -----------------------------------------------------------------------
    // PACKAGE 1: WORK ITEMS (PEKERJAAN KONSTRUKSI LAPANGAN)
    // -----------------------------------------------------------------------
    {
      refId: 'pkg_work',
      name: '1. Pekerjaan Konstruksi / Lapangan',
      outlineLevel: 1,
      isSummary: true,
      itemType: 'summary',
      category: 'labor',
    },
    {
      refId: 'w1_1',
      name: 'Pembersihan Lahan, Cut & Fill Tanah Gudang',
      outlineLevel: 2,
      duration: 7,
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      percentComplete: 100,
      itemType: 'work',
      category: 'labor',
      quantity: 4800,
      unit: 'M3',
      unitRate: 75000,
      plannedCost: 360000000,
      actualCost: 355000000,
      physicalWeight: 3.5,
      assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }],
    },
    {
      refId: 'w1_2',
      name: 'Pengukuran Site & Pasang Bouwplank Presisi',
      outlineLevel: 2,
      duration: 4,
      predecessors: [{ refId: 'w1_1', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'work',
      category: 'labor',
      quantity: 1200,
      unit: 'MTR',
      unitRate: 70000,
      plannedCost: 84000000,
      actualCost: 82000000,
      physicalWeight: 1.0,
      assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }],
    },
    {
      refId: 'w1_3',
      name: 'Galian Tanah Pile Cap & Tie Beam',
      outlineLevel: 2,
      duration: 6,
      predecessors: [{ refId: 'w1_2', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'work',
      category: 'labor',
      quantity: 1850,
      unit: 'M3',
      unitRate: 120000,
      plannedCost: 222000000,
      actualCost: 220000000,
      physicalWeight: 2.5,
      assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }],
    },
    {
      refId: 'w1_4',
      name: 'Pemancangan Spun Pile Dia 50cm (180 Titik L=18m)',
      outlineLevel: 2,
      duration: 14,
      predecessors: [{ refId: 'w1_3', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'work',
      category: 'subcontractor',
      quantity: 180,
      unit: 'Titik',
      unitRate: 7500000,
      plannedCost: 1350000000,
      actualCost: 1340000000,
      physicalWeight: 15.0,
      assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }],
    },
    {
      refId: 'w1_5',
      name: 'Pembobokan Kepala Tiang & Stek Rebar Pile Cap',
      outlineLevel: 2,
      duration: 6,
      predecessors: [{ refId: 'w1_4', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'work',
      category: 'labor',
      quantity: 180,
      unit: 'Titik',
      unitRate: 1500000,
      plannedCost: 270000000,
      actualCost: 265000000,
      physicalWeight: 3.0,
      assignedResources: [{ userId: foreman._id, units: 100, costRate: 350000 }],
    },
    {
      refId: 'w1_6',
      name: 'Pengecoran Beton Ready Mix Pile Cap & Tie Beam',
      outlineLevel: 2,
      duration: 8,
      predecessors: [{ refId: 'w1_5', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'work',
      category: 'labor',
      quantity: 920,
      unit: 'M3',
      unitRate: 850000,
      plannedCost: 782000000,
      actualCost: 775000000,
      physicalWeight: 9.0,
      assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }],
    },
    {
      refId: 'm1_sub',
      name: 'Milestone: Substructure & Pondasi Selesai 100%',
      outlineLevel: 2,
      duration: 0,
      isMilestone: true,
      predecessors: [{ refId: 'w1_6', type: 'FS', lagDays: 0 }],
      percentComplete: 100,
      itemType: 'milestone',
      category: 'general',
      plannedCost: 0,
      actualCost: 0,
    },
    {
      refId: 'w1_8',
      name: 'Fabrikasi & Erection Rangka Baja Kolom WF 400',
      outlineLevel: 2,
      duration: 15,
      predecessors: [{ refId: 'm1_sub', type: 'FS', lagDays: 0 }],
      percentComplete: 85,
      itemType: 'work',
      category: 'subcontractor',
      quantity: 85,
      unit: 'Ton',
      unitRate: 18000000,
      plannedCost: 1530000000,
      actualCost: 1300000000,
      physicalWeight: 17.0,
      assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }],
    },
    {
      refId: 'w1_9',
      name: 'Erection Rafter Kuda-Kuda Baja Span 36m',
      outlineLevel: 2,
      duration: 12,
      predecessors: [{ refId: 'w1_8', type: 'SS', lagDays: 4 }],
      percentComplete: 45,
      itemType: 'work',
      category: 'subcontractor',
      quantity: 60,
      unit: 'Ton',
      unitRate: 19500000,
      plannedCost: 1170000000,
      actualCost: 520000000,
      physicalWeight: 13.0,
      assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }],
    },
    {
      refId: 'w1_10',
      name: 'Pemasangan Gording CNP & Bracing Ikatan Angin',
      outlineLevel: 2,
      duration: 8,
      predecessors: [{ refId: 'w1_9', type: 'FS', lagDays: 0 }],
      percentComplete: 10,
      itemType: 'work',
      category: 'labor',
      quantity: 35,
      unit: 'Ton',
      unitRate: 12000000,
      plannedCost: 420000000,
      actualCost: 45000000,
      physicalWeight: 5.0,
      assignedResources: [{ userId: foreman._id, units: 100, costRate: 350000 }],
    },
    {
      refId: 'w1_11',
      name: 'Perkerasan Rigid Pavement Lantai Heavy Duty Gudang',
      outlineLevel: 2,
      duration: 14,
      predecessors: [{ refId: 'm1_sub', type: 'FS', lagDays: 8 }],
      percentComplete: 20,
      itemType: 'work',
      category: 'labor',
      quantity: 6200,
      unit: 'M2',
      unitRate: 280000,
      plannedCost: 1736000000,
      actualCost: 350000000,
      physicalWeight: 18.0,
      assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }],
    },
    {
      refId: 'w1_12',
      name: 'Pemasangan Penutup Atap Zincalume 0.45mm & Insulasi',
      outlineLevel: 2,
      duration: 10,
      predecessors: [{ refId: 'w1_10', type: 'FS', lagDays: 0 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'labor',
      quantity: 6500,
      unit: 'M2',
      unitRate: 165000,
      plannedCost: 1072500000,
      actualCost: 0,
      physicalWeight: 7.0,
      assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }],
    },
    {
      refId: 'w1_13',
      name: 'Instalasi Sistem MEP & Fire Hydrant Sprinkler',
      outlineLevel: 2,
      duration: 16,
      predecessors: [{ refId: 'w1_10', type: 'FS', lagDays: 2 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'subcontractor',
      quantity: 1,
      unit: 'LS',
      unitRate: 850000000,
      plannedCost: 850000000,
      actualCost: 0,
      physicalWeight: 4.5,
      assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }],
    },
    {
      refId: 'w1_14',
      name: 'Finishing, Testing Commissioning & Handover',
      outlineLevel: 2,
      duration: 5,
      predecessors: [{ refId: 'w1_12', type: 'FS', lagDays: 0 }, { refId: 'w1_13', type: 'FS', lagDays: 0 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'general',
      quantity: 1,
      unit: 'LS',
      unitRate: 180000000,
      plannedCost: 180000000,
      actualCost: 0,
      physicalWeight: 1.5,
      assignedResources: [{ userId: adminProject._id, units: 100, costRate: 400000 }],
    },
    {
      refId: 'm1_pho',
      name: 'Milestone: Serah Terima Pertama (PHO Handover)',
      outlineLevel: 2,
      duration: 0,
      isMilestone: true,
      predecessors: [{ refId: 'w1_14', type: 'FS', lagDays: 0 }],
      percentComplete: 0,
      itemType: 'milestone',
      category: 'general',
      plannedCost: 0,
      actualCost: 0,
    },

    // -----------------------------------------------------------------------
    // PACKAGE 2: SUPPLY ITEMS (PENGADAAN MATERIAL & LOGISTIK PROYEK)
    // -----------------------------------------------------------------------
    {
      refId: 'pkg_supply',
      name: '2. Pengadaan Material & Logistik Proyek',
      outlineLevel: 1,
      isSummary: true,
      itemType: 'summary',
      category: 'material',
    },
    {
      refId: 's2_1',
      name: 'Spun Pile Beton Dia 50cm Kelas A L=18m',
      outlineLevel: 2,
      duration: 10,
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      percentComplete: 100,
      itemType: 'supply',
      category: 'material',
      quantity: 180,
      unit: 'btg',
      unitRate: 5500000,
      plannedCost: 990000000,
      actualCost: 980000000,
      realizedQuantity: 180,
      supplyStatus: 'Delivered',
      deliveryDate: new Date('2026-08-22T00:00:00.000Z'),
    },
    {
      refId: 's2_2',
      name: 'Baja Profil WF 400x200x8x13 BJ-37 KS',
      outlineLevel: 2,
      duration: 12,
      startDate: new Date('2026-09-08T00:00:00.000Z'),
      percentComplete: 100,
      itemType: 'supply',
      category: 'material',
      quantity: 85,
      unit: 'ton',
      unitRate: 15500000,
      plannedCost: 1317500000,
      actualCost: 1310000000,
      realizedQuantity: 85,
      supplyStatus: 'Delivered',
      deliveryDate: new Date('2026-09-24T00:00:00.000Z'),
    },
    {
      refId: 's2_3',
      name: 'Baja Profil WF 250x125 Rafter Span 36m',
      outlineLevel: 2,
      duration: 10,
      startDate: new Date('2026-09-18T00:00:00.000Z'),
      percentComplete: 50,
      itemType: 'supply',
      category: 'material',
      quantity: 60,
      unit: 'ton',
      unitRate: 16000000,
      plannedCost: 960000000,
      actualCost: 480000000,
      realizedQuantity: 30,
      supplyStatus: 'Ordered',
      deliveryDate: new Date('2026-10-06T00:00:00.000Z'),
    },
    {
      refId: 's2_4',
      name: 'Beton Ready Mix K-350 NFA Cor Pile Cap',
      outlineLevel: 2,
      duration: 8,
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      percentComplete: 100,
      itemType: 'supply',
      category: 'material',
      quantity: 950,
      unit: 'm3',
      unitRate: 920000,
      plannedCost: 874000000,
      actualCost: 865000000,
      realizedQuantity: 950,
      supplyStatus: 'Delivered',
      deliveryDate: new Date('2026-09-20T00:00:00.000Z'),
    },
    {
      refId: 's2_5',
      name: 'Besi Beton Ulir D16 & D19 SNI Krakatau Steel',
      outlineLevel: 2,
      duration: 6,
      startDate: new Date('2026-08-25T00:00:00.000Z'),
      percentComplete: 100,
      itemType: 'supply',
      category: 'material',
      quantity: 45,
      unit: 'ton',
      unitRate: 14200000,
      plannedCost: 639000000,
      actualCost: 635000000,
      realizedQuantity: 45,
      supplyStatus: 'Delivered',
      deliveryDate: new Date('2026-09-02T00:00:00.000Z'),
    },
    {
      refId: 's2_6',
      name: 'Wiremesh M8 Ulir Lembaran Spasiasi 15x15',
      outlineLevel: 2,
      duration: 8,
      startDate: new Date('2026-09-22T00:00:00.000Z'),
      percentComplete: 50,
      itemType: 'supply',
      category: 'material',
      quantity: 1250,
      unit: 'lbr',
      unitRate: 385000,
      plannedCost: 481250000,
      actualCost: 240000000,
      realizedQuantity: 500,
      supplyStatus: 'Ordered',
      deliveryDate: new Date('2026-10-15T00:00:00.000Z'),
    },
    {
      refId: 's2_7',
      name: 'Atap Zincalume Trimdek Tebal 0.45mm Bluescope',
      outlineLevel: 2,
      duration: 10,
      startDate: new Date('2026-10-05T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'supply',
      category: 'material',
      quantity: 6800,
      unit: 'm2',
      unitRate: 88000,
      plannedCost: 598400000,
      actualCost: 0,
      realizedQuantity: 0,
      supplyStatus: 'Pending',
      deliveryDate: new Date('2026-10-25T00:00:00.000Z'),
    },
    {
      refId: 's2_8',
      name: 'Pipa Black Steel Medium Sch 40 Dia 4" Hydrant',
      outlineLevel: 2,
      duration: 12,
      startDate: new Date('2026-10-12T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'supply',
      category: 'material',
      quantity: 420,
      unit: 'btg',
      unitRate: 650000,
      plannedCost: 273000000,
      actualCost: 0,
      realizedQuantity: 0,
      supplyStatus: 'Pending',
      deliveryDate: new Date('2026-11-05T00:00:00.000Z'),
    },
    {
      refId: 's2_9',
      name: 'Floor Hardener Sika Chapdur Metallic Grey',
      outlineLevel: 2,
      duration: 6,
      startDate: new Date('2026-09-28T00:00:00.000Z'),
      percentComplete: 50,
      itemType: 'supply',
      category: 'material',
      quantity: 600,
      unit: 'sak',
      unitRate: 185000,
      plannedCost: 111000000,
      actualCost: 55000000,
      realizedQuantity: 200,
      supplyStatus: 'Ordered',
      deliveryDate: new Date('2026-10-14T00:00:00.000Z'),
    },
  ];

  // Pass 1: Insert ProjectTask documents
  const refToTask1 = new Map();
  const taskDocs1 = [];

  for (let i = 0; i < rawTasks1.length; i++) {
    const raw = rawTasks1[i];
    const taskDoc = new ProjectTask({
      projectId: project1._id,
      name: raw.name,
      duration: raw.duration !== undefined ? raw.duration : 1,
      outlineLevel: raw.outlineLevel,
      sortOrder: i,
      isSummary: Boolean(raw.isSummary),
      isMilestone: Boolean(raw.isMilestone),
      percentComplete: raw.percentComplete || 0,
      plannedCost: raw.plannedCost || 0,
      actualCost: raw.actualCost || 0,
      assignedResources: raw.assignedResources || [],
      itemType: raw.itemType || 'work',
      category: raw.category || 'general',
      quantity: raw.quantity || 1,
      unit: raw.unit || 'ls',
      unitRate: raw.unitRate || 0,
      totalBudget: raw.plannedCost || ((raw.quantity || 1) * (raw.unitRate || 0)),
      realizedQuantity: raw.realizedQuantity || 0,
      realizedAmount: raw.actualCost || 0,
      physicalWeight: raw.physicalWeight || 0,
      supplyStatus: raw.supplyStatus || 'Pending',
      deliveryDate: raw.deliveryDate || null,
      createdBy: owner._id,
    });
    if (raw.startDate) taskDoc.startDate = raw.startDate;

    await taskDoc.save();
    refToTask1.set(raw.refId, taskDoc);
    taskDocs1.push({ doc: taskDoc, raw });
  }

  // Pass 2: Connect parentTaskId and predecessors
  let currentParentId = null;
  for (const { doc, raw } of taskDocs1) {
    if (raw.isSummary) {
      currentParentId = doc._id;
    } else if (raw.outlineLevel > 1) {
      doc.parentTaskId = currentParentId;
    }

    if (raw.predecessors && raw.predecessors.length > 0) {
      doc.predecessors = raw.predecessors
        .map(p => {
          const targetTask = refToTask1.get(p.refId);
          return targetTask
            ? { taskId: targetTask._id, type: p.type || 'FS', lagDays: p.lagDays || 0 }
            : null;
        })
        .filter(Boolean);
    }
    await doc.save();
  }

  // Pass 3: Run CPM Scheduling Engine
  const allTasks1 = await ProjectTask.find({ projectId: project1._id }).sort({ sortOrder: 1 });
  const plainTasks1 = allTasks1.map(t => t.toObject());
  recalculateProjectSchedule(plainTasks1, project1.startDate, calendar1.toObject());

  // Set baseline 0 and persist updated scheduling
  for (const t of plainTasks1) {
    await ProjectTask.findByIdAndUpdate(t._id, {
      wbsCode: t.wbsCode,
      outlineLevel: t.outlineLevel,
      parentTaskId: t.parentTaskId,
      sortOrder: t.sortOrder,
      isSummary: t.isSummary,
      isMilestone: t.isMilestone,
      startDate: t.startDate,
      finishDate: t.finishDate,
      duration: t.duration,
      earlyStart: t.earlyStart,
      earlyFinish: t.earlyFinish,
      lateStart: t.lateStart,
      lateFinish: t.lateFinish,
      totalFloat: t.totalFloat,
      freeFloat: t.freeFloat,
      isCritical: t.isCritical,
      percentComplete: t.percentComplete,
      plannedCost: t.plannedCost,
      actualCost: t.actualCost,
      baselineStart: t.startDate,
      baselineFinish: t.finishDate,
      baselineDuration: t.duration,
      baselineCost: t.plannedCost,
    });
  }
  console.log(`  ✓ CPM Engine scheduled ${plainTasks1.length} unified tasks`);

  // 2.4 Synchronize Project.workItems and Supply collection
  await syncProjectTasksToProjectEntities(project1._id);

  // 2.5 Populate RABItem collection with exact matching IDs for unified Swakelola SCM
  const updatedTasks1 = await ProjectTask.find({ projectId: project1._id }).sort({ sortOrder: 1 });
  const rabDocs1 = updatedTasks1.map(t => ({
    _id: t._id, // Identical ID guarantees dual lookup works flawlessly
    projectId: project1._id,
    wbsCode: t.wbsCode,
    description: t.name,
    category: toRABCategory(t.category, t.itemType),
    unitOfMeasure: toRABUnit(t.unit),
    budgetedQuantity: t.quantity || 1,
    unitRate: t.unitRate || 0,
    totalBudget: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
    committedQuantity: t.realizedQuantity || 0,
    realizedQuantity: t.realizedQuantity || 0,
    realizedAmount: t.actualCost || 0,
  }));
  await RABItem.insertMany(rabDocs1);
  console.log(`  ✓ Created ${rabDocs1.length} aligned RABItems`);

  // 2.6 Seed Swakelola LocalPurchase Vouchers
  const readyMixTask = refToTask1.get('s2_4');
  const wfBajaTask = refToTask1.get('s2_2');
  const wiremeshTask = refToTask1.get('s2_6');
  const corPileCapTask = refToTask1.get('w1_6');
  const hardenerTask = refToTask1.get('s2_9');

  const localPurchases1 = [
    {
      projectId: project1._id,
      rabItemId: readyMixTask._id,
      voucherNumber: 'KW-001/MM2100/SWK/2026',
      purchaserName: foreman.fullName,
      supplierName: 'PT. Adhimix RMC Plant Cikarang',
      itemDescription: 'Pengadaan Tambahan Beton Ready Mix K-350 NFA Cor Sambungan Pile Cap P-12',
      quantity: 12,
      unitOfMeasure: 'CUM',
      unitPrice: 920000,
      totalPrice: 11040000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790408687135-818151673.jpg',
      geotagLocation: {
        lat: -6.295241,
        lng: 107.098823,
        addressText: 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat, Bekasi',
      },
      status: 'VERIFIED',
      verifiedBy: siteManager._id,
      verifiedAt: new Date('2026-09-20T14:30:00.000Z'),
      createdBy: supervisor._id,
      createdAt: new Date('2026-09-20T11:00:00.000Z'),
    },
    {
      projectId: project1._id,
      rabItemId: wfBajaTask._id,
      voucherNumber: 'KW-002/MM2100/SWK/2026',
      purchaserName: foreman.fullName,
      supplierName: 'CV. Baut Sentosa Teknik Bekasi',
      itemDescription: 'Pengadaan Baut HTB Grade 8.8 A325 M20x70 Sambungan Kolom Baja WF 400',
      quantity: 500,
      unitOfMeasure: 'PCS',
      unitPrice: 37000,
      totalPrice: 18500000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790408706582-696526725.jpg',
      geotagLocation: {
        lat: -6.296102,
        lng: 107.097541,
        addressText: 'Workshop Fabrikasi Baja MM2100 Blok C, Cikarang Barat',
      },
      status: 'VERIFIED',
      verifiedBy: siteManager._id,
      verifiedAt: new Date('2026-09-24T16:00:00.000Z'),
      createdBy: supervisor._id,
      createdAt: new Date('2026-09-24T13:15:00.000Z'),
    },
    {
      projectId: project1._id,
      rabItemId: corPileCapTask._id,
      voucherNumber: 'KW-003/MM2100/SWK/2026',
      purchaserName: worker.fullName,
      supplierName: 'TB. Sumber Logam Abadi Cikarang',
      itemDescription: 'Kawat Bendrat Hitam 25 Roll & Paku Triplek Usuk Bekisting Pile Cap',
      quantity: 25,
      unitOfMeasure: 'PCS',
      unitPrice: 350000,
      totalPrice: 8750000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790408774292-480890881.jpg',
      geotagLocation: {
        lat: -6.294819,
        lng: 107.099112,
        addressText: 'Pintu Gerbang Utama Proyek MM2100 Blok C-4',
      },
      status: 'VERIFIED',
      verifiedBy: siteManager._id,
      verifiedAt: new Date('2026-09-15T15:20:00.000Z'),
      createdBy: foreman._id,
      createdAt: new Date('2026-09-15T09:40:00.000Z'),
    },
    {
      projectId: project1._id,
      rabItemId: wiremeshTask._id,
      voucherNumber: 'KW-004/MM2100/SWK/2026',
      purchaserName: worker.fullName,
      supplierName: 'PT. Energi Petro Cikarang',
      itemDescription: 'Solar Industri Non-Subsidi HSD B30 untuk Genset Lapangan & Mobile Crane 25 Ton (800 Liter)',
      quantity: 800,
      unitOfMeasure: 'PCS',
      unitPrice: 16000,
      totalPrice: 12800000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790408886083-426873990.jpg',
      geotagLocation: {
        lat: -6.295241,
        lng: 107.098823,
        addressText: 'Tangki BBM Proyek MM2100 Cikarang Barat',
      },
      status: 'SUBMITTED',
      createdBy: foreman._id,
      createdAt: new Date('2026-09-25T14:10:00.000Z'),
    },
    {
      projectId: project1._id,
      rabItemId: hardenerTask._id,
      voucherNumber: 'KW-005/MM2100/SWK/2026',
      purchaserName: worker.fullName,
      supplierName: 'Rental Alat Teknik Perkasa Mandiri',
      itemDescription: 'Sewa Jack Hammer Listrik 3 Unit x 7 Hari untuk Perapian Sudut Pile Cap',
      quantity: 21,
      unitOfMeasure: 'JAM',
      unitPrice: 250000,
      totalPrice: 5250000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790408898503-768144530.jpg',
      geotagLocation: {
        lat: -6.295241,
        lng: 107.098823,
        addressText: 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat',
      },
      status: 'SUBMITTED',
      createdBy: supervisor._id,
      createdAt: new Date('2026-09-25T16:30:00.000Z'),
    },
    {
      projectId: project1._id,
      rabItemId: corPileCapTask._id,
      voucherNumber: 'KW-006/MM2100/SWK/2026',
      purchaserName: foreman.fullName,
      supplierName: 'Warung Barokah Sedap Cikarang',
      itemDescription: 'Konsumsi Lembur Malam Operator Pengecoran Lembar Kerja Mandor Lapangan',
      quantity: 50,
      unitOfMeasure: 'PCS',
      unitPrice: 30000,
      totalPrice: 1500000,
      receiptPhotoUrl: 'uploads/misc/receiptPhoto-1790409031691-370990434.png',
      geotagLocation: {
        lat: -6.295241,
        lng: 107.098823,
        addressText: 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat',
      },
      status: 'REJECTED',
      rejectionReason: 'Kuitansi konsumsi lembur harus diajukan melalui form Reimbursement Kasbon Operasional, bukan Pos Pengadaan Swakelola Konstruksi.',
      verifiedBy: siteManager._id,
      verifiedAt: new Date('2026-09-26T09:00:00.000Z'),
      createdBy: foreman._id,
      createdAt: new Date('2026-09-25T21:00:00.000Z'),
    },
  ];

  for (const lp of localPurchases1) {
    await LocalPurchase.create(lp);
  }
  console.log(`  ✓ Created ${localPurchases1.length} Swakelola LocalPurchase vouchers`);

  // 2.7 Seed Daily Progress Reports
  const dailyReports1 = [
    {
      projectId: project1._id,
      date: new Date('2026-08-10T00:00:00.000Z'),
      progressPercent: 3.5,
      weather: 'Cerah',
      workforce: '1 Mandor, 2 Surveyor, 12 Helper Lapangan, 2 Operator Excavator',
      materials: 'Papan Bouwplank Kayu Meranti 3/20 150 btg, Patok Kayu 5/7 300 btg',
      notes: 'Pembersihan semak dan cut-fill lahan selesai 100%. Tim surveyor memulai penentuan titik as kolom A1 s/d H8 menggunakan Total Station akurasi tinggi.',
      photos: [
        { path: 'uploads/photos/photo-1790347743595-203170381.jpg', altText: 'Pengukuran Bouwplank & Elevasi Lantai Gudang' },
      ],
      createdBy: supervisor._id,
      createdAt: new Date('2026-08-10T17:00:00.000Z'),
    },
    {
      projectId: project1._id,
      date: new Date('2026-08-28T00:00:00.000Z'),
      progressPercent: 18.0,
      weather: 'Cerah',
      workforce: '1 Mandor Struktur, 4 Operator Drop Hammer, 15 Helper, 1 HSE Officer',
      materials: 'Spun Pile Beton Dia 50cm Kelas A L=18m terpancang 18 titik hari ini',
      notes: 'Pemancangan zona substructure utara selesai hingga titik P-85. Kalendering pukulan akhir diuji di bawah pengawasan Site Manager dan konsultan MK.',
      photos: [
        { path: 'uploads/photos/photo-1790347757601-309065520.jpg', altText: 'Pemancangan Drop Hammer Spun Pile Dia 50' },
        { path: 'uploads/photos/photo-1790347873270-159255782.jpg', altText: 'Inspeksi Daya Dukung Tanah & Kalendering Tiang' },
      ],
      createdBy: supervisor._id,
      createdAt: new Date('2026-08-28T17:30:00.000Z'),
    },
    {
      projectId: project1._id,
      date: new Date('2026-09-18T00:00:00.000Z'),
      progressPercent: 34.0,
      weather: 'Berawan',
      workforce: '1 Site Manager, 2 Mandor, 8 Tukang Besi, 16 Helper, 4 Operator Truck Mixer',
      materials: 'Beton Ready Mix K-350 NFA volume 120 M3 tercurah, Besi Ulir D19',
      notes: 'Pengecoran tie beam dan pile cap grid 1-4 berjalan lancar. Slump test 12±2 cm dan pengambilan sampel kubus beton 15x15x15 cm 6 spesimen.',
      photos: [
        { path: 'uploads/photos/photo-1790350044682-833815860.jpg', altText: 'Pengecoran Beton Ready Mix Pile Cap dengan Concrete Pump' },
      ],
      createdBy: supervisor._id,
      createdAt: new Date('2026-09-18T18:00:00.000Z'),
    },
    {
      projectId: project1._id,
      date: new Date('2026-09-25T00:00:00.000Z'),
      progressPercent: 58.0,
      weather: 'Cerah',
      workforce: '1 Site Manager, 1 Supervisor, 2 Rigger, 1 Operator Crane 25T, 14 Welder & Fitter',
      materials: 'Kolom Baja WF 400x200x8x13 12 unit berdiri, Baut HTB A325 M20',
      notes: 'Erection kolom baja WF 400 grid C1-C6 selesai sempurna. Pengecekan ketegakan dengan waterpass & theodolite menunjukkan deviasi < 3mm.',
      photos: [
        { path: 'uploads/photos/photo-1790347743595-203170381.jpg', altText: 'Erection Rangka Baja Kolom WF 400 Menggunakan Mobile Crane' },
        { path: 'uploads/photos/photo-1790347757601-309065520.jpg', altText: 'Pengencangan Baut HTB A325 dengan Torque Wrench' },
      ],
      createdBy: supervisor._id,
      createdAt: new Date('2026-09-25T17:15:00.000Z'),
    },
  ];

  for (const dr of dailyReports1) {
    await DailyReport.create(dr);
  }
  console.log(`  ✓ Created ${dailyReports1.length} Project DailyReports`);

  // =========================================================================
  // 3. SEED PROJECT 2 (PLANNING STAGE: MENARA SUDIRMAN INTERIOR FIT-OUT)
  // =========================================================================
  console.log('\n--- 3. Seeding Project 2: Menara Sudirman Interior Fit-Out ---');
  const project2Name = 'Renovasi & Fit-Out Interior Menara Sudirman Lantai 18';

  let project2 = await Project.findOne({ nama: project2Name });
  if (project2) {
    await ProjectTask.deleteMany({ projectId: project2._id });
    await Supply.deleteMany({ projectId: project2._id });
    await RABItem.deleteMany({ projectId: project2._id });
    await LocalPurchase.deleteMany({ projectId: project2._id });
    await DailyReport.deleteMany({ projectId: project2._id });
    await ProjectCalendar.deleteMany({ projectId: project2._id });
    await ProjectResource.deleteMany({ projectId: project2._id });
  } else {
    project2 = new Project({
      nama: project2Name,
      createdBy: director._id,
    });
  }

  project2.lokasi = 'Jl. Jend. Sudirman Kav. 60, Jakarta Selatan';
  project2.description = 'Pekerjaan fit-out arsitektur interior open-space modern, sistem HVAC VRV Daikin, partisi kaca frameless, dan smart office lighting untuk kantor seluas 850 m2.';
  project2.totalBudget = 2850000000;
  project2.status = 'Planning';
  project2.startDate = new Date('2026-10-05T00:00:00.000Z');
  project2.endDate = new Date('2026-12-30T00:00:00.000Z');
  project2.progress = 0;
  project2.assignedTo = [director._id, siteManager._id, supervisor._id, adminProject._id];
  await project2.save();

  // 3.1 Tasks for Project 2
  const rawTasks2 = [
    { refId: 'p2_pkg1', name: '1. Pekerjaan Sipil & Interior', outlineLevel: 1, isSummary: true, itemType: 'summary', category: 'labor' },
    {
      refId: 'p2_w1',
      name: 'Pembongkaran Partisi Eksisting & Pembersihan Area',
      outlineLevel: 2,
      duration: 5,
      startDate: new Date('2026-10-05T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'work',
      category: 'labor',
      quantity: 850,
      unit: 'M2',
      unitRate: 85000,
      plannedCost: 72250000,
      actualCost: 0,
    },
    {
      refId: 'p2_w2',
      name: 'Pemasangan Partisi Gypsum Board 12mm Akustik & Kaca Frameless',
      outlineLevel: 2,
      duration: 12,
      predecessors: [{ refId: 'p2_w1', type: 'FS', lagDays: 0 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'labor',
      quantity: 480,
      unit: 'M2',
      unitRate: 450000,
      plannedCost: 216000000,
      actualCost: 0,
    },
    {
      refId: 'p2_w3',
      name: 'Pekerjaan Plafon Gypsum Drop Ceiling & Linear Wood Panel',
      outlineLevel: 2,
      duration: 10,
      predecessors: [{ refId: 'p2_w2', type: 'SS', lagDays: 3 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'labor',
      quantity: 750,
      unit: 'M2',
      unitRate: 320000,
      plannedCost: 240000000,
      actualCost: 0,
    },
    {
      refId: 'p2_w4',
      name: 'Pekerjaan Raised Floor & Carpet Tile Interface',
      outlineLevel: 2,
      duration: 14,
      predecessors: [{ refId: 'p2_w3', type: 'FS', lagDays: 0 }],
      percentComplete: 0,
      itemType: 'work',
      category: 'labor',
      quantity: 650,
      unit: 'M2',
      unitRate: 480000,
      plannedCost: 312000000,
      actualCost: 0,
    },
    {
      refId: 'p2_pkg2',
      name: '2. Pengadaan Material & Furniture Interior',
      outlineLevel: 1,
      isSummary: true,
      itemType: 'summary',
      category: 'material',
    },
    {
      refId: 'p2_s1',
      name: 'Carpet Tile Modular 50x50cm Interface Nylon Anti-Static',
      outlineLevel: 2,
      duration: 8,
      startDate: new Date('2026-10-15T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'supply',
      category: 'material',
      quantity: 750,
      unit: 'm2',
      unitRate: 550000,
      plannedCost: 412500000,
      actualCost: 0,
      supplyStatus: 'Pending',
    },
    {
      refId: 'p2_s2',
      name: 'Sistem Pendingin AC VRV Daikin 4PK Round Flow Cassette',
      outlineLevel: 2,
      duration: 12,
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'supply',
      category: 'material',
      quantity: 14,
      unit: 'unit',
      unitRate: 38000000,
      plannedCost: 532000000,
      actualCost: 0,
      supplyStatus: 'Pending',
    },
    {
      refId: 'p2_s3',
      name: 'Workstation Meja Kerja Ergonomis 4-Cluster (Include Screen & Tray)',
      outlineLevel: 2,
      duration: 10,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      percentComplete: 0,
      itemType: 'supply',
      category: 'material',
      quantity: 12,
      unit: 'set',
      unitRate: 24500000,
      plannedCost: 294000000,
      actualCost: 0,
      supplyStatus: 'Pending',
    },
  ];

  const refToTask2 = new Map();
  const taskDocs2 = [];

  for (let i = 0; i < rawTasks2.length; i++) {
    const raw = rawTasks2[i];
    const taskDoc = new ProjectTask({
      projectId: project2._id,
      name: raw.name,
      duration: raw.duration || 1,
      outlineLevel: raw.outlineLevel,
      sortOrder: i,
      isSummary: Boolean(raw.isSummary),
      isMilestone: Boolean(raw.isMilestone),
      percentComplete: raw.percentComplete || 0,
      plannedCost: raw.plannedCost || 0,
      actualCost: raw.actualCost || 0,
      itemType: raw.itemType || 'work',
      category: raw.category || 'general',
      quantity: raw.quantity || 1,
      unit: raw.unit || 'ls',
      unitRate: raw.unitRate || 0,
      totalBudget: raw.plannedCost || ((raw.quantity || 1) * (raw.unitRate || 0)),
      supplyStatus: raw.supplyStatus || 'Pending',
      createdBy: director._id,
    });
    if (raw.startDate) taskDoc.startDate = raw.startDate;
    await taskDoc.save();
    refToTask2.set(raw.refId, taskDoc);
    taskDocs2.push({ doc: taskDoc, raw });
  }

  let curParent2 = null;
  for (const { doc, raw } of taskDocs2) {
    if (raw.isSummary) {
      curParent2 = doc._id;
    } else if (raw.outlineLevel > 1) {
      doc.parentTaskId = curParent2;
    }
    if (raw.predecessors && raw.predecessors.length > 0) {
      doc.predecessors = raw.predecessors
        .map(p => {
          const target = refToTask2.get(p.refId);
          return target ? { taskId: target._id, type: p.type || 'FS', lagDays: p.lagDays || 0 } : null;
        })
        .filter(Boolean);
    }
    await doc.save();
  }

  const allTasks2 = await ProjectTask.find({ projectId: project2._id }).sort({ sortOrder: 1 });
  const plainTasks2 = allTasks2.map(t => t.toObject());
  recalculateProjectSchedule(plainTasks2, project2.startDate);
  for (const t of plainTasks2) {
    await ProjectTask.findByIdAndUpdate(t._id, {
      wbsCode: t.wbsCode,
      outlineLevel: t.outlineLevel,
      parentTaskId: t.parentTaskId,
      sortOrder: t.sortOrder,
      isSummary: t.isSummary,
      startDate: t.startDate,
      finishDate: t.finishDate,
      duration: t.duration,
      percentComplete: t.percentComplete,
      plannedCost: t.plannedCost,
      actualCost: t.actualCost,
      baselineStart: t.startDate,
      baselineFinish: t.finishDate,
      baselineDuration: t.duration,
      baselineCost: t.plannedCost,
    });
  }

  await syncProjectTasksToProjectEntities(project2._id);

  const updatedTasks2 = await ProjectTask.find({ projectId: project2._id }).sort({ sortOrder: 1 });
  const rabDocs2 = updatedTasks2.map(t => ({
    _id: t._id,
    projectId: project2._id,
    wbsCode: t.wbsCode,
    description: t.name,
    category: toRABCategory(t.category, t.itemType),
    unitOfMeasure: toRABUnit(t.unit),
    budgetedQuantity: t.quantity || 1,
    unitRate: t.unitRate || 0,
    totalBudget: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
  }));
  await RABItem.insertMany(rabDocs2);
  console.log(`  ✓ Project 2 saved with ${plainTasks2.length} unified tasks and ${rabDocs2.length} RABItems`);

  // =========================================================================
  // 4. SUMMARY & NAVIGATION LINKS
  // =========================================================================
  console.log('\n====================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
  console.log(`\n📌 Flagship Project: "${project1.nama}" (ID: ${project1._id})`);
  console.log(`   - Status: ${project1.status} | Overall Progress: ${project1.progress}%`);
  console.log(`   - Total Budget: Rp ${project1.totalBudget.toLocaleString('id-ID')}`);
  console.log(`   - WBS Tasks Seeded: ${plainTasks1.length} (with Work & Supply hierarchy)`);
  console.log(`   - Swakelola Vouchers: ${localPurchases1.length} (VERIFIED, SUBMITTED, REJECTED)`);
  console.log(`   - Daily Reports: ${dailyReports1.length} (with photos & workforce log)`);
  console.log('\nDirect URLs for Inspection:');
  console.log(`   • Project Detail & S-Curve:  http://localhost:5173/project/${project1._id}`);
  console.log(`   • MS Project Plan (Gantt):   http://localhost:5173/project-plan/${project1._id}`);
  console.log(`   • Swakelola SCM Dashboard:   http://localhost:5173/project-swakelola/${project1._id}`);
  console.log(`\n📌 Planning Project: "${project2.nama}" (ID: ${project2._id})`);
  console.log(`   • Project Detail:            http://localhost:5173/project/${project2._id}`);
  console.log(`   • MS Project Plan:           http://localhost:5173/project-plan/${project2._id}`);
  console.log(`   • Swakelola SCM:             http://localhost:5173/project-swakelola/${project2._id}`);
  console.log('\nDefault Logins (Password for all: "password123"):');
  console.log('   • Owner:         poemalfatih115@gmail.com');
  console.log('   • Director:      director@mterp.com');
  console.log('   • Site Manager:  manager@mterp.com');
  console.log('   • Supervisor:    supervisor@mterp.com');
  console.log('   • Admin Project: admin@mterp.com');
  console.log('   • Foreman:       tukang1@mterp.com');
  console.log('====================================================\n');

  process.exit(0);
}

runSeed().catch(err => {
  console.error('\n❌ Error during seeding:', err);
  process.exit(1);
});
