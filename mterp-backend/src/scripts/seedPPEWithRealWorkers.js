const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { User, Project, PPEUsage } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

// Robust CSV parser handling multiline quotes and commas
function parseCSV(content) {
  const lines = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  const [headerRow, ...dataRows] = lines;
  const headers = headerRow.map((h) => h.replace(/^\uFEFF/, '').trim());

  return dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] !== undefined ? row[index] : '';
    });
    return obj;
  });
}

function sanitizeUsername(rawUsername, fullName) {
  if (rawUsername && rawUsername.trim()) {
    return rawUsername
      .trim()
      .toLowerCase()
      .replace(/[\s\(\)\[\]"'`]/g, '')
      .replace(/[^a-z0-9_-]/g, '');
  }
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 15);
}

function parseCompetencies(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const parts = rawText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.map((name, idx) => ({
    name,
    issuer: name.includes('Kemnaker')
      ? 'Kementerian Ketenagakerjaan RI'
      : name.includes('BNSP')
      ? 'BNSP'
      : 'Lembaga Sertifikasi Profesi',
    certificateNumber: `REG-K3-${202400 + idx}-${Math.floor(1000 + Math.random() * 9000)}`,
    issueDate: new Date(Date.now() - 180 * 24 * 3600 * 1000),
    expiryDate: new Date(Date.now() + 540 * 24 * 3600 * 1000),
  }));
}

async function runSeed() {
  console.log('====================================================');
  console.log('🛡️  MTERP ERP - PPE USAGE & REAL USERS PRODUCTION SEED');
  console.log('====================================================');

  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to MongoDB: ${MONGODB_URI}`);

  // 1. Locate CSV file
  let csvPath = path.join(__dirname, '../../data/pekerja-export.csv');
  if (!fs.existsSync(csvPath)) {
    csvPath = 'C:\\Users\\CorSec\\Downloads\\pekerja-export(1).csv';
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }
  console.log(`📄 Reading real worker data from: ${csvPath}`);

  const rawCSV = fs.readFileSync(csvPath, 'utf8');
  const records = parseCSV(rawCSV);
  console.log(`📊 Found ${records.length} records in CSV.`);

  // 2. Upsert real users into MongoDB
  const realUsersMap = new Map();
  let createdUsersCount = 0;
  let existingUsersCount = 0;

  for (const row of records) {
    const fullName = row['Full Name'] || row['fullName'] || '';
    if (!fullName) continue;

    const rawRole = (row['Role'] || row['role'] || 'worker').toLowerCase().trim();
    const position = row['Position'] || row['position'] || '';
    const employmentType = (row['Employment Type'] || row['employmentType'] || 'tetap').toLowerCase().trim();
    const certText = row['Sertifikasi / Kompetensi'] || row['competencies'] || '';
    const rawUsername = row['Username'] || row['username'] || '';
    const sanitizedUser = sanitizeUsername(rawUsername, fullName);

    let user = await User.findOne({
      $or: [
        { username: sanitizedUser },
        { fullName: fullName },
      ],
    });

    const competencies = parseCompetencies(certText);
    const validRoles = [
      'worker',
      'tukang',
      'helper',
      'supervisor',
      'site_manager',
      'foreman',
      'device_admin',
      'asset_admin',
      'admin_project',
      'director',
      'president_director',
      'operational_director',
      'owner',
    ];
    const role = validRoles.includes(rawRole) ? rawRole : 'worker';

    if (!user) {
      const email = `${sanitizedUser}@mterp.com`;
      user = new User({
        username: sanitizedUser,
        email,
        password: 'password123',
        fullName,
        role,
        position,
        employmentType: ['tetap', 'kontrak', 'harian_lepas', 'magang'].includes(employmentType)
          ? employmentType
          : 'harian_lepas',
        department: position.toLowerCase().includes('k3') || position.toLowerCase().includes('hse')
          ? 'HSE & K3 Konstruksi'
          : 'Operasional Lapangan',
        isVerified: true,
        competencies,
      });
      await user.save();
      createdUsersCount++;
    } else {
      user.position = position || user.position;
      if (competencies.length > 0 && (!user.competencies || user.competencies.length === 0)) {
        user.competencies = competencies;
      }
      user.isVerified = true;
      await user.save();
      existingUsersCount++;
    }

    realUsersMap.set(fullName, user);
    realUsersMap.set(sanitizedUser, user);
  }

  console.log(`👤 Users processed: ${createdUsersCount} created, ${existingUsersCount} verified/updated.`);

  // 3. Find HSE Inspectors & Supervisors from real users
  const allUsers = await User.find({}).lean();
  const hseManager =
    allUsers.find((u) => u.fullName.includes('Aam Ramli') || u.username === 'aam') ||
    allUsers.find((u) => u.role === 'supervisor') ||
    allUsers[0];

  const tkpkSupervisor =
    allUsers.find((u) => u.fullName.includes('Riana') || u.fullName.includes('Noor')) ||
    hseManager;

  // 4. Fetch Projects
  const projects = await Project.find({}).lean();
  const warehouseProject =
    projects.find((p) => (p.nama || '').toLowerCase().includes('warehouse')) || projects[0];
  const sudirmanProject =
    projects.find((p) => (p.nama || '').toLowerCase().includes('sudirman')) || warehouseProject;

  console.log(`🏗️ Using Project 1: ${warehouseProject?.nama || 'Proyek Lapangan MM2100'}`);
  if (sudirmanProject && sudirmanProject._id !== warehouseProject?._id) {
    console.log(`🏗️ Using Project 2: ${sudirmanProject.nama}`);
  }

  // 5. Clean up old PPE usage demo records if desired, or build rich production records
  console.log('\n--- 5. Generating Realistic PPE Usage Records for Real Workers ---');
  await PPEUsage.deleteMany({}); // Reset PPE usage logs for clean production baseline

  const ppeUsagesToInsert = [];
  const now = new Date();

  // Helper date offset
  const daysAgo = (days, hour = 8, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    // Ensure it is not in the future
    if (d.getTime() > now.getTime()) { d.setTime(now.getTime() - (3600000 * (1 + days))); }
    return d;
  };

  // Pre-categorize real users
  for (const user of allUsers) {
    const nameLower = (user.fullName || '').toLowerCase();
    const posLower = (user.position || '').toLowerCase();
    const roleLower = (user.role || '').toLowerCase();

    // Skip corporate board members unless they did site inspection walk
    const isExecutive = ['owner', 'director', 'president_director'].includes(roleLower) &&
      !posLower.includes('safety') && !posLower.includes('logistik');

    if (isExecutive) continue;

    // Check trade
    const isWelder = posLower.includes('weld') || nameLower.includes('agus taryana') || nameLower.includes('kuntring');
    const isHeightSpecialist =
      posLower.includes('tkbt') ||
      posLower.includes('tkpk') ||
      nameLower.includes('riana') ||
      nameLower.includes('pepi') ||
      nameLower.includes('achmad rahayu') ||
      nameLower.includes('heriyanto') ||
      (user.competencies && user.competencies.some((c) => c.name.toLowerCase().includes('ketinggian')));

    const isSupervisor = roleLower === 'supervisor' || roleLower === 'site_manager' || posLower.includes('mandor');

    // Generate 1 - 3 realistic usages per active worker
    if (isWelder) {
      // Current active welding shift
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: warehouseProject ? warehouseProject._id : null,
        projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
        location: 'Zona Fabrikasi Kolom WF-400 & Rafter Baja',
        ppeItems: ['welding_helmet', 'leather_gloves', 'safety_boots', 'safety_helmet'],
        activityType: 'Pengelasan Busur Listrik (SMAW) Rangka Kuda-Kuda Baja',
        borrowedAt: daysAgo(0, 7, 30),
        expectedReturnDate: daysAgo(0, 17, 0),
        returnedAt: null,
        status: 'in_use',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Belum Dikembalikan',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Pemeriksaan filter auto-darkening Shade 11 berfungsi normal. Sarung tangan kulit bebas minyak oli.',
      });

      // Past returned welding shift
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: warehouseProject ? warehouseProject._id : null,
        projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
        location: 'Bengkel Fabrikasi Baja',
        ppeItems: ['welding_helmet', 'leather_gloves', 'safety_boots'],
        activityType: 'Pemotongan Plat & Pengelasan Sambungan Base Plate',
        borrowedAt: daysAgo(3, 8, 0),
        expectedReturnDate: daysAgo(3, 17, 0),
        returnedAt: daysAgo(3, 17, 15),
        status: 'returned',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Baik & Bersih',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Pengelasan base plate kolom grid A-D selesai aman.',
        returnNotes: 'Kaca pelindung luar dibersihkan dari kerak spatter, alat disimpan di lemari K3.',
      });
    } else if (isHeightSpecialist) {
      // Active high elevation work
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: warehouseProject ? warehouseProject._id : null,
        projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
        location: 'Struktur Rafter Elevasi +14.50 Meter',
        ppeItems: ['full_body_harness', 'fall_arrester', 'safety_helmet', 'safety_boots', 'safety_web'],
        activityType: 'Erection Rafter Kuda-Kuda Baja Span 36m & Pemasangan Jaring Pengaman',
        borrowedAt: daysAgo(0, 7, 45),
        expectedReturnDate: daysAgo(0, 16, 30),
        returnedAt: null,
        status: 'in_use',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Belum Dikembalikan',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Uji sentak (jerk test) fall arrester responsif mengunci seketika. Webbing harness tidak ada sobek.',
      });

      // Past high elevation work
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: sudirmanProject ? sudirmanProject._id : (warehouseProject ? warehouseProject._id : null),
        projectName: sudirmanProject ? sudirmanProject.nama : 'Renovasi Menara Sudirman',
        location: 'Void Eksterior Lantai 18',
        ppeItems: ['full_body_harness', 'fall_arrester', 'safety_helmet', 'safety_boots'],
        activityType: 'Inspeksi & Pemasangan Bracket Kaca Facade Luar',
        borrowedAt: daysAgo(5, 8, 30),
        expectedReturnDate: daysAgo(5, 17, 0),
        returnedAt: daysAgo(5, 17, 20),
        status: 'returned',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Baik & Bersih',
        inspectedBy: tkpkSupervisor._id,
        inspectorName: `${tkpkSupervisor.fullName} (Supervisor K3 TKPK)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Pekerjaan facade luar dengan jalur lifeline ganda bersertifikasi.',
        returnNotes: 'Dorsal D-ring dan karabiner diperiksa ulang, kondisi prima.',
      });
    } else if (isSupervisor) {
      // Supervisor on inspection
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: warehouseProject ? warehouseProject._id : null,
        projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
        location: 'Seluruh Zona Proyek MM2100',
        ppeItems: ['safety_helmet', 'safety_boots', 'leather_gloves'],
        activityType: 'Pengawasan Lapangan & Daily Safety Patrol',
        borrowedAt: daysAgo(0, 8, 0),
        expectedReturnDate: daysAgo(0, 17, 0),
        returnedAt: null,
        status: 'in_use',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Belum Dikembalikan',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Patroli berkala kepatuhan pemakaian APD di area struktur dan pengecoran.',
      });
    } else {
      // General worker / tukang / helper
      const isTodayActive = Math.random() > 0.45; // ~55% currently working
      if (isTodayActive) {
        ppeUsagesToInsert.push({
          workerId: user._id,
          workerName: user.fullName,
          workerRole: user.role,
          projectId: warehouseProject ? warehouseProject._id : null,
          projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
          location: 'Area Rigid Pavement Lantai & Pengecoran',
          ppeItems: ['safety_helmet', 'safety_boots', 'leather_gloves'],
          activityType: 'Pemasangan Tulangan Besi Wiremesh & Pengecoran Beton',
          borrowedAt: daysAgo(0, 8, 15),
          expectedReturnDate: daysAgo(0, 17, 0),
          returnedAt: null,
          status: 'in_use',
          conditionBefore: 'Baik & Layak Pakai',
          conditionAfter: 'Belum Dikembalikan',
          inspectedBy: hseManager._id,
          inspectorName: `${hseManager.fullName} (HSE Manager)`,
          inspectionChecklist: {
            fitCheck: true,
            shellStrapsIntact: true,
            latchLockSecure: true,
            certifiedStandardChecked: true,
          },
          notes: 'Helm putih/kuning terikat rapi tali dagu. Sepatu boot steel toe cap terpasang rapat.',
        });
      }

      // Record past completed work
      ppeUsagesToInsert.push({
        workerId: user._id,
        workerName: user.fullName,
        workerRole: user.role,
        projectId: warehouseProject ? warehouseProject._id : null,
        projectName: warehouseProject ? warehouseProject.nama : 'Pembangunan Warehouse MM2100',
        location: 'Area Galian & Pembesian Pile Cap',
        ppeItems: ['safety_helmet', 'safety_boots'],
        activityType: 'Pekerjaan Pembobokan Tiang Pancang & Stek Rebar',
        borrowedAt: daysAgo(Math.floor(2 + Math.random() * 8), 8, 0),
        expectedReturnDate: daysAgo(2, 17, 0),
        returnedAt: daysAgo(2, 17, 10),
        status: 'returned',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: 'Baik & Bersih',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: 'Pekerjaan harian terlaksana dengan nihil insiden (Zero Accident).',
        returnNotes: 'Helm dan sepatu dibersihkan dari lumpur proyek.',
      });
    }
  }

  // Insert all records with enriched photo evidence & history
  const photoList = [
    'uploads/photos/photo-1790347743595-203170381.jpg',
    'uploads/photos/photo-1790350044682-833815860.jpg',
    'uploads/photos/photo-1790767102390-786523870.jpg',
    'uploads/photos/photo-1790826742321-856459444.jpg',
    'uploads/photos/photo-1790929543325-756012479.jpg',
  ];

  const enrichedMainUsages = ppeUsagesToInsert.map((item, idx) => {
    const borrowPhoto = photoList[idx % photoList.length];
    const returnPhoto = photoList[(idx + 2) % photoList.length];

    const lat = Number((-6.3125 + ((idx % 7) - 3) * 0.0008).toFixed(6));
    const lng = Number((107.1352 + ((idx % 5) - 2) * 0.0008).toFixed(6));
    const accuracy = 8 + (idx % 8);

    const evidence = {
      photo: borrowPhoto,
      lat,
      lng,
      accuracy,
      capturedAt: item.borrowedAt,
      serverTime: item.borrowedAt,
      isManualGpsOverride: false,
      notes: 'Foto watermark GPS terverifikasi via Watermark Camera K3.',
      photoPurged: false,
    };

    const returnEvidence = item.returnedAt
      ? {
          photo: returnPhoto,
          lat,
          lng,
          accuracy,
          capturedAt: item.returnedAt,
          serverTime: item.returnedAt,
          isManualGpsOverride: false,
          notes: item.returnNotes || 'Pengembalian APD diverifikasi oleh Tim K3.',
          photoPurged: false,
        }
      : undefined;

    const history = [
      {
        action: 'check_out',
        actionLabel: 'Peminjaman / Check-out APD',
        timestamp: item.borrowedAt,
        byUserId: hseManager._id,
        byUserName: `${hseManager.fullName} (HSE Manager)`,
        location: item.location,
        condition: item.conditionBefore || 'Baik & Layak Pakai',
        notes: item.notes || '',
        evidence: {
          photo: borrowPhoto,
          lat,
          lng,
          accuracy,
          capturedAt: item.borrowedAt,
          isManualGpsOverride: false,
          photoPurged: false,
        },
      },
    ];

    if (item.returnedAt) {
      history.push({
        action: 'return',
        actionLabel: 'Pengembalian / Return APD Terverifikasi',
        timestamp: item.returnedAt,
        byUserId: hseManager._id,
        byUserName: `${hseManager.fullName} (HSE Manager)`,
        location: item.location,
        condition: item.conditionAfter || 'Baik & Bersih',
        notes: item.returnNotes || '',
        evidence: {
          photo: returnPhoto,
          lat,
          lng,
          accuracy,
          capturedAt: item.returnedAt,
          isManualGpsOverride: false,
          photoPurged: false,
        },
      });
    }

    return {
      ...item,
      photo: borrowPhoto,
      evidence,
      returnEvidence,
      history,
    };
  });

  await PPEUsage.insertMany(enrichedMainUsages);
  console.log(`✅ Successfully inserted ${enrichedMainUsages.length} PPE usage records.`);

  // Print summary statistics
  const countInUse = await PPEUsage.countDocuments({ status: 'in_use' });
  const countReturned = await PPEUsage.countDocuments({ status: 'returned' });
  const countHighRisk = await PPEUsage.countDocuments({
    ppeItems: { $in: ['full_body_harness', 'fall_arrester', 'welding_helmet'] },
  });

  console.log('====================================================');
  console.log('📈 PRODUCTION SEED METRICS:');
  console.log(`   - Total PPE Usages Seeded: ${ppeUsagesToInsert.length}`);
  console.log(`   - Currently Active In-Use: ${countInUse}`);
  console.log(`   - Successfully Returned:   ${countReturned}`);
  console.log(`   - High Risk Work Covered:  ${countHighRisk}`);
  console.log('====================================================');

  await mongoose.disconnect();
  console.log('🏁 Seed completed and disconnected from MongoDB.');
}

runSeed().catch((err) => {
  console.error('❌ Error during PPE seed:', err);
  process.exit(1);
});
