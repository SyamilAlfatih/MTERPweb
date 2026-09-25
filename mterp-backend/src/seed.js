const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { User, Project, ProjectTask } = require('./models');
const { recalculateProjectSchedule } = require('./utils/scheduling');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('✅ Connected to MongoDB at', MONGODB_URI);

  // 1. Seed / Upsert Users
  console.log('\n--- Seeding Users ---');
  const userDefs = [
    {
      username: 'owner',
      email: 'poemalfatih115@gmail.com',
      password: 'password123',
      fullName: 'Bapak Ir. H. Syamil Alfatih (Owner)',
      role: 'owner',
      position: 'Project Owner & Investor',
      isVerified: true,
      phone: '081234567890',
      bpjsTk: '00018273645',
      bpjsKesehatan: '00091827364',
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
      position: 'Civil & Structure Supervisor',
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
      fullName: 'Ahmad Subarjo (Mandor Struktur)',
      role: 'foreman',
      position: 'Mandor Utama Struktur',
      isVerified: true,
      phone: '081789012345',
      bpjsTk: '00051607984',
      bpjsKesehatan: '00055627381',
    },
  ];

  const seededUsers = [];
  for (const u of userDefs) {
    let existing = await User.findOne({ email: u.email });
    if (!existing) {
      existing = await User.create(u);
      console.log(`Created user: ${existing.fullName} (${existing.role})`);
    } else {
      if (!existing.bpjsTk && u.bpjsTk) existing.bpjsTk = u.bpjsTk;
      if (!existing.bpjsKesehatan && u.bpjsKesehatan) existing.bpjsKesehatan = u.bpjsKesehatan;
      await existing.save();
      console.log(`User exists: ${existing.fullName} (${existing.role})`);
    }
    seededUsers.push(existing);
  }

  const owner = seededUsers.find(u => u.role === 'owner') || seededUsers[0];
  const siteManager = seededUsers.find(u => u.role === 'site_manager') || seededUsers[0];
  const supervisor = seededUsers.find(u => u.role === 'supervisor') || seededUsers[0];
  const adminProject = seededUsers.find(u => u.role === 'admin_project') || seededUsers[0];

  // 2. Seed Project
  console.log('\n--- Seeding Project ---');
  const projectName = 'Pembangunan Warehouse & Logistic Hub MM2100';

  let project = await Project.findOne({ nama: projectName });
  if (project) {
    console.log(`Existing project found: "${project.nama}" (ID: ${project._id}). Cleaning up old plan tasks...`);
    await ProjectTask.deleteMany({ projectId: project._id });
  } else {
    project = new Project({
      nama: projectName,
      lokasi: 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat, Bekasi',
      description: 'Proyek konstruksi gudang logistik modern 2 lantai dilengkapi area loading dock 8 bays, kantor operasional 400 m2, sistem fire hydrant/sprinkler standar NFPA, dan perkerasan rigid pavement heavy-duty.',
      totalBudget: 12500000000, // Rp 12.5 Milyar
      status: 'In Progress',
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      endDate: new Date('2026-12-19T00:00:00.000Z'),
      progress: 38,
      assignedTo: seededUsers.map(u => u._id),
      workItems: [
        {
          name: 'Pekerjaan Persiapan & Pengukuran Bouwplank',
          qty: 1,
          volume: 'LS',
          unit: 'LS',
          cost: 350000000,
          actualCost: 345000000,
          physicalWeight: 2.8,
          progress: 100,
          startDate: new Date('2026-08-03T00:00:00.000Z'),
          endDate: new Date('2026-08-15T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Tanah & Galian Pondasi Pile Cap',
          qty: 4800,
          volume: 'M3',
          unit: 'M3',
          cost: 720000000,
          actualCost: 710000000,
          physicalWeight: 5.76,
          progress: 100,
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-25T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Tiang Pancang Spun Pile Dia 50cm',
          qty: 180,
          volume: 'Titik',
          unit: 'Titik',
          cost: 2600000000,
          actualCost: 2550000000,
          physicalWeight: 20.8,
          progress: 100,
          startDate: new Date('2026-08-26T00:00:00.000Z'),
          endDate: new Date('2026-09-15T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Struktur Baja WF & Kolom Portal',
          qty: 145,
          volume: 'Ton',
          unit: 'Ton',
          cost: 4100000000,
          actualCost: 2800000000,
          physicalWeight: 32.8,
          progress: 55,
          startDate: new Date('2026-09-16T00:00:00.000Z'),
          endDate: new Date('2026-10-24T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Lantai Beton Rigid Pavement & Hardener',
          qty: 6200,
          volume: 'M2',
          unit: 'M2',
          cost: 2200000000,
          actualCost: 650000000,
          physicalWeight: 17.6,
          progress: 25,
          startDate: new Date('2026-10-12T00:00:00.000Z'),
          endDate: new Date('2026-11-14T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Penutup Atap Zincalume & Insulasi',
          qty: 6500,
          volume: 'M2',
          unit: 'M2',
          cost: 1350000000,
          actualCost: 0,
          physicalWeight: 10.8,
          progress: 0,
          startDate: new Date('2026-10-26T00:00:00.000Z'),
          endDate: new Date('2026-11-21T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan MEP & Fire Hydrant Sprinkler System',
          qty: 1,
          volume: 'LS',
          unit: 'LS',
          cost: 850000000,
          actualCost: 0,
          physicalWeight: 6.8,
          progress: 0,
          startDate: new Date('2026-11-02T00:00:00.000Z'),
          endDate: new Date('2026-12-05T00:00:00.000Z'),
        },
        {
          name: 'Pekerjaan Finishing, Testing & Handover',
          qty: 1,
          volume: 'LS',
          unit: 'LS',
          cost: 330000000,
          actualCost: 0,
          physicalWeight: 2.64,
          progress: 0,
          startDate: new Date('2026-12-07T00:00:00.000Z'),
          endDate: new Date('2026-12-19T00:00:00.000Z'),
        },
      ],
    });
    await project.save();
    console.log(`Created Project: "${project.nama}" (ID: ${project._id})`);
  }

  // 3. Seed MS Project ProjectTasks
  console.log('\n--- Seeding MS Project WBS Schedule ---');
  const projectId = project._id;

  // Create task definitions with outlineLevel & temporary ref IDs
  const rawTasks = [
    // 1. Persiapan
    { refId: 't1', name: 'Pekerjaan Persiapan & Lahan', outlineLevel: 1, isSummary: true },
    { refId: 't1_1', name: 'Pembersihan Lahan & Pagar Seng Proyek', outlineLevel: 2, duration: 4, startDate: new Date('2026-08-03T00:00:00.000Z'), percentComplete: 100, plannedCost: 120000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't1_2', name: 'Pengukuran & Pasang Bouwplank Presisi', outlineLevel: 2, duration: 4, predecessors: [{ refId: 't1_1', type: 'FS' }], percentComplete: 100, plannedCost: 95000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't1_3', name: 'Galian Tanah Pile Cap & Urugan Pasir', outlineLevel: 2, duration: 7, predecessors: [{ refId: 't1_2', type: 'FS' }], percentComplete: 100, plannedCost: 480000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't1_m', name: 'Milestone: Kesiapan Area Substructure', outlineLevel: 2, duration: 0, isMilestone: true, predecessors: [{ refId: 't1_3', type: 'FS' }], percentComplete: 100 },

    // 2. Struktur Bawah
    { refId: 't2', name: 'Pekerjaan Struktur Bawah (Substructure)', outlineLevel: 1, isSummary: true },
    { refId: 't2_1', name: 'Mobilisasi Drop Hammer & Spun Pile Dia 50', outlineLevel: 2, duration: 3, predecessors: [{ refId: 't1_m', type: 'FS' }], percentComplete: 100, plannedCost: 350000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't2_2', name: 'Pemancangan Spun Pile 180 Titik Kedalaman 18m', outlineLevel: 2, duration: 15, predecessors: [{ refId: 't2_1', type: 'FS' }], percentComplete: 100, plannedCost: 2250000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't2_3', name: 'Pembobokan Kepala Tiang & Fabrikasi Besi Pile Cap', outlineLevel: 2, duration: 9, predecessors: [{ refId: 't2_2', type: 'FS' }], percentComplete: 100, plannedCost: 620000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't2_4', name: 'Pengecoran Beton Ready Mix Pile Cap & Tie Beam', outlineLevel: 2, duration: 8, predecessors: [{ refId: 't2_3', type: 'FS' }], percentComplete: 100, plannedCost: 780000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't2_m', name: 'Milestone: Substructure Selesai 100%', outlineLevel: 2, duration: 0, isMilestone: true, predecessors: [{ refId: 't2_4', type: 'FS' }], percentComplete: 100 },

    // 3. Struktur Atas
    { refId: 't3', name: 'Pekerjaan Struktur Rangka Baja (Superstructure)', outlineLevel: 1, isSummary: true },
    { refId: 't3_1', name: 'Pemasangan Anchor Bolt & Erection Kolom WF 400', outlineLevel: 2, duration: 12, predecessors: [{ refId: 't2_m', type: 'FS' }], percentComplete: 80, plannedCost: 1850000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't3_2', name: 'Perakitan & Erection Rafter Kuda-Kuda Baja Span 36m', outlineLevel: 2, duration: 11, predecessors: [{ refId: 't3_1', type: 'SS', lagDays: 4 }], percentComplete: 40, plannedCost: 1650000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't3_3', name: 'Pemasangan Gording CNP, Sagrod & Ikatan Angin', outlineLevel: 2, duration: 8, predecessors: [{ refId: 't3_2', type: 'FS' }], percentComplete: 0, plannedCost: 600000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },

    // 4. Lantai & Arsitektur
    { refId: 't4', name: 'Pekerjaan Lantai & Enclosure Gudang', outlineLevel: 1, isSummary: true },
    { refId: 't4_1', name: 'Pemadatan Subgrade & Lapisan Base Course Lantai', outlineLevel: 2, duration: 6, predecessors: [{ refId: 't2_m', type: 'FS' }], percentComplete: 60, plannedCost: 420000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't4_2', name: 'Pengecoran Lantai Wiremesh Rigid Pavement & Hardener', outlineLevel: 2, duration: 12, predecessors: [{ refId: 't4_1', type: 'FS' }], percentComplete: 10, plannedCost: 1780000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't4_3', name: 'Pemasangan Penutup Atap Zincalume 0.45mm & Talang', outlineLevel: 2, duration: 9, predecessors: [{ refId: 't3_3', type: 'FS' }], percentComplete: 0, plannedCost: 950000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },
    { refId: 't4_4', name: 'Pemasangan Wall Cladding Spandek & Pintu Loading Dock', outlineLevel: 2, duration: 10, predecessors: [{ refId: 't4_3', type: 'SS', lagDays: 3 }], percentComplete: 0, plannedCost: 720000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },

    // 5. MEP
    { refId: 't5', name: 'Pekerjaan MEP & Fire Protection', outlineLevel: 1, isSummary: true },
    { refId: 't5_1', name: 'Instalasi Pipa Fire Hydrant, Sprinkler & Pompa', outlineLevel: 2, duration: 14, predecessors: [{ refId: 't3_3', type: 'FS' }], percentComplete: 0, plannedCost: 520000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't5_2', name: 'Instalasi Panel Listrik Utama & Highbay LED Lighting', outlineLevel: 2, duration: 10, predecessors: [{ refId: 't4_2', type: 'FS' }], percentComplete: 0, plannedCost: 330000000, assignedResources: [{ userId: supervisor._id, units: 100, costRate: 500000 }] },

    // 6. Finishing & PHO
    { refId: 't6', name: 'Testing, Commissioning & Serah Terima', outlineLevel: 1, isSummary: true },
    { refId: 't6_1', name: 'Pressure Testing Fire Hydrant & Uji Beban Crane', outlineLevel: 2, duration: 4, predecessors: [{ refId: 't5_1', type: 'FS' }, { refId: 't5_2', type: 'FS' }], percentComplete: 0, plannedCost: 150000000, assignedResources: [{ userId: siteManager._id, units: 100, costRate: 750000 }] },
    { refId: 't6_2', name: 'Pembersihan Akhir & As-Built Drawing Documentation', outlineLevel: 2, duration: 4, predecessors: [{ refId: 't6_1', type: 'FS' }, { refId: 't4_4', type: 'FS' }], percentComplete: 0, plannedCost: 180000000, assignedResources: [{ userId: adminProject._id, units: 100, costRate: 400000 }] },
    { refId: 't6_m', name: 'Milestone: Serah Terima Pertama (PHO Handover)', outlineLevel: 2, duration: 0, isMilestone: true, predecessors: [{ refId: 't6_2', type: 'FS' }], percentComplete: 0 },
  ];

  // 1st pass: create documents in MongoDB to get real ObjectIds
  const refIdToObjectId = new Map();
  const createdDocs = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const raw = rawTasks[i];
    const doc = new ProjectTask({
      projectId,
      name: raw.name,
      duration: raw.duration !== undefined ? raw.duration : 1,
      outlineLevel: raw.outlineLevel,
      sortOrder: i,
      isSummary: Boolean(raw.isSummary),
      isMilestone: Boolean(raw.isMilestone),
      percentComplete: raw.percentComplete || 0,
      plannedCost: raw.plannedCost || 0,
      actualCost: (raw.plannedCost || 0) * ((raw.percentComplete || 0) / 100),
      assignedResources: raw.assignedResources || [],
      createdBy: owner._id,
    });
    if (raw.startDate) doc.startDate = raw.startDate;

    await doc.save();
    refIdToObjectId.set(raw.refId, doc._id);
    createdDocs.push({ doc, raw });
  }

  // 2nd pass: resolve predecessor ObjectIds
  for (const { doc, raw } of createdDocs) {
    if (raw.predecessors && raw.predecessors.length > 0) {
      doc.predecessors = raw.predecessors.map(p => ({
        taskId: refIdToObjectId.get(p.refId),
        type: p.type || 'FS',
        lagDays: p.lagDays || 0,
      }));
      await doc.save();
    }
  }

  // 3rd pass: Run CPM scheduling engine to calculate exact dates, WBS codes, rollups, and critical path!
  const allTasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
  const plainTasks = allTasks.map(t => t.toObject());

  recalculateProjectSchedule(plainTasks, project.startDate);

  // Set initial baseline snapshot matching early plan
  for (const t of plainTasks) {
    t.baselineStart = t.startDate;
    t.baselineFinish = t.finishDate;
    t.baselineDuration = t.duration;
    t.baselineCost = t.plannedCost;
  }

  // Bulk update back to DB
  for (const t of plainTasks) {
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
      percentComplete: t.percentComplete,
      baselineStart: t.baselineStart,
      baselineFinish: t.baselineFinish,
      baselineDuration: t.baselineDuration,
      baselineCost: t.baselineCost,
      plannedCost: t.plannedCost,
      actualCost: t.actualCost,
    });
  }

  console.log(`\n✅ Successfully seeded ${plainTasks.length} tasks for Project: "${project.nama}"!`);
  console.log(`\nProject Detail URL: http://localhost:5173/project/${project._id}`);
  console.log(`MS Project Plan URL: http://localhost:5173/project-plan/${project._id}`);

  process.exit(0);
}).catch(e => {
  console.error('❌ Error during seeding:', e);
  process.exit(1);
});
