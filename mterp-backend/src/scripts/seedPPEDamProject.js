const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { User, Project, PPEUsage } = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

// Helper to construct normalized WIB timestamps on specific days
function createWIBDate(year, month, day, hours, minutes) {
  // Asia/Jakarta is UTC+7
  const utcHours = hours - 7;
  return new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0, 0));
}

async function runSeedDam() {
  console.log('====================================================');
  console.log('🏗️  MTERP ERP - SEED PPE USAGES: PROYEK DAM (CIPANUNJANG)');
  console.log('    History: 3 Days Ago (2026-10-26) until Yesterday (2026-10-28)');
  console.log('    Working Times: 07:30 - 17:00 WIB (Standard & Overtime)');
  console.log('====================================================');

  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to MongoDB: ${MONGODB_URI}`);

  // 1. Locate Proyek Dam
  const damProject = await Project.findOne({
    $or: [
      { nama: /dam/i },
      { lokasi: /cipanunjang/i },
    ],
  });

  if (!damProject) {
    throw new Error('Proyek Dam tidak ditemukan di database.');
  }

  console.log(`📍 Found Project: "${damProject.nama}" located at "${damProject.lokasi}" (ID: ${damProject._id})`);

  // 2. Fetch real users
  const allUsers = await User.find({}).lean();
  console.log(`👥 Loaded ${allUsers.length} users from database.`);

  const hseManager =
    allUsers.find((u) => u.fullName.includes('Aam Ramli') || u.username === 'aam') ||
    allUsers[0];

  const mandorSupervisor =
    allUsers.find((u) => u.fullName.includes('Ujang') || u.username === 'ujangspv') ||
    allUsers.find((u) => u.role === 'supervisor') ||
    hseManager;

  // Real trades from the pekerja list
  const welders = allUsers.filter(
    (u) =>
      (u.position || '').toLowerCase().includes('weld') ||
      (u.fullName || '').toLowerCase().includes('agus taryana') ||
      (u.fullName || '').toLowerCase().includes('kuntring')
  );

  const heightSpecialists = allUsers.filter(
    (u) =>
      (u.position || '').toLowerCase().includes('tkbt') ||
      (u.position || '').toLowerCase().includes('tkpk') ||
      (u.fullName || '').toLowerCase().includes('riana') ||
      (u.fullName || '').toLowerCase().includes('pepi') ||
      (u.fullName || '').toLowerCase().includes('achmad rahayu')
  );

  const civilAndHelpers = allUsers.filter(
    (u) =>
      ['worker', 'tukang', 'helper'].includes(u.role) &&
      !welders.some((w) => w._id.equals(u._id)) &&
      !heightSpecialists.some((h) => h._id.equals(u._id))
  );

  console.log(`   - Welders available: ${welders.length}`);
  console.log(`   - Height specialists available: ${heightSpecialists.length}`);
  console.log(`   - Civil/Helpers available: ${civilAndHelpers.length}`);

  // Days: 3 days ago (26 Oct), 2 days ago (27 Oct), yesterday (28 Oct) in 2026
  const targetDays = [
    { day: 26, label: 'Senin, 26 Okt 2026 (3 Hari Lalu)' },
    { day: 27, label: 'Selasa, 27 Okt 2026 (2 Hari Lalu)' },
    { day: 28, label: 'Rabu, 28 Okt 2026 (Kemarin)' },
  ];

  // Specific Dam Work Items
  const damActivities = [
    {
      type: 'excavation',
      activity: 'Pek. Galian Tanah Pondasi Bendung & Saluran Pelimpah',
      location: 'Zona Intake & Pondasi Bendung Cipanunjang',
      ppe: ['safety_helmet', 'safety_boots', 'leather_gloves'],
      startHour: 7,
      startMin: 35,
      endHour: 17,
      endMin: 5,
      notes: 'Pekerjaan galian di lereng tepi sungai. Wajib helm & sepatu boot safety anti-slip.',
      returnNotes: 'Sepatu boot dan helm dibersihkan dari lumpur basah sungai.',
    },
    {
      type: 'masonry',
      activity: 'Upah Pekerja Batukali 1PC:5PS Dinding Sayap Bendung',
      location: 'Dinding Penahan Tanah Sayap Kanan Bendung',
      ppe: ['safety_helmet', 'safety_boots', 'leather_gloves'],
      startHour: 7,
      startMin: 45,
      endHour: 17,
      endMin: 10,
      notes: 'Pemasangan batu kali bronjong dan plesteran siar 1PC:5PS.',
      returnNotes: 'Sarung tangan kulit dicuci dan dijemur teduh, helm dibilas.',
    },
    {
      type: 'scaffolding_height',
      activity: 'Sewa Scaffolding & Pemasangan Bekisting Spillway Elevasi +8.5m',
      location: 'Dinding Spillway & Menara Pengatur Debit Air',
      ppe: ['full_body_harness', 'fall_arrester', 'safety_helmet', 'safety_boots', 'safety_web'],
      startHour: 7,
      startMin: 30,
      endHour: 17,
      endMin: 0,
      notes: 'Bekerja pada ketinggian di atas 6 meter. Jalur lifeline dan full body harness terpasang aman.',
      returnNotes: 'Dorsal D-ring harness dan karabiner fall arrester diperiksa tanpa cacat fisik.',
    },
    {
      type: 'gate_welding',
      activity: 'Fabrikasi & Pengelasan Rangka Baja Pintu Air (Sluice Gate)',
      location: 'Workshop Fabrikasi Baja Proyek Dam',
      ppe: ['welding_helmet', 'leather_gloves', 'safety_boots', 'safety_helmet'],
      startHour: 7,
      startMin: 40,
      endHour: 17,
      endMin: 15,
      notes: 'Pengelasan busur elektroda SMAW plat pintu air. Filter shade 11 teruji otomatis.',
      returnNotes: 'Kedok las dibersihkan dari terak spatter, sarung tangan kulit disimpan rapi.',
    },
    {
      type: 'survey_ts',
      activity: 'Survey TS & Pengukuran Elevasi Crest Bendungan',
      location: 'Puncak Mercu Bendung Cipanunjang',
      ppe: ['safety_helmet', 'safety_boots'],
      startHour: 7,
      startMin: 50,
      endHour: 16,
      endMin: 55,
      notes: 'Pengukuran kontur elevasi limpasan air dan cross-section sungai.',
      returnNotes: 'Peralatan disimpan di kantor site Proyek Dam.',
    },
  ];

  const newDamUsages = [];

  // Remove previous usages for Proyek Dam if already seeded to prevent duplication
  const existingDamUsages = await PPEUsage.deleteMany({ projectId: damProject._id });
  console.log(`🧹 Cleaned up ${existingDamUsages.deletedCount} existing PPE records for Proyek Dam.`);

  for (const { day, label } of targetDays) {
    console.log(`\n📅 Generating normalized working-time records for: ${label}`);

    // 1. Height specialists on the dam scaffolding
    for (let i = 0; i < Math.min(heightSpecialists.length, 3); i++) {
      const worker = heightSpecialists[i];
      const start = createWIBDate(2026, 10, day, 7, 30 + i * 5);
      const expectedEnd = createWIBDate(2026, 10, day, 17, 0);
      const actualEnd = createWIBDate(2026, 10, day, 17, 5 + i * 3);

      newDamUsages.push({
        workerId: worker._id,
        workerName: worker.fullName,
        workerRole: worker.role,
        projectId: damProject._id,
        projectName: damProject.nama,
        location: 'Dinding Spillway & Scaffolding Elevasi +8.5m',
        ppeItems: ['full_body_harness', 'fall_arrester', 'safety_helmet', 'safety_boots', 'safety_web'],
        activityType: 'Sewa Scaffolding & Pemasangan Bekisting Spillway Elevasi +8.5m',
        borrowedAt: start,
        expectedReturnDate: expectedEnd,
        returnedAt: actualEnd,
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
        notes: 'Pemeriksaan pra-kerja: kawat sling fall arrester bersih, harness pas badan.',
        returnNotes: 'Selesai shift normal, peralatan digantung di lemari K3 site Cipanunjang.',
        createdAt: start,
        updatedAt: actualEnd,
      });
    }

    // 2. Welders on sluice gate fabrication
    for (let i = 0; i < Math.min(welders.length, 2); i++) {
      const worker = welders[i];
      const start = createWIBDate(2026, 10, day, 7, 40 + i * 5);
      const expectedEnd = createWIBDate(2026, 10, day, 17, 0);
      const actualEnd = createWIBDate(2026, 10, day, 17, 12 + i * 4);

      newDamUsages.push({
        workerId: worker._id,
        workerName: worker.fullName,
        workerRole: worker.role,
        projectId: damProject._id,
        projectName: damProject.nama,
        location: 'Workshop Fabrikasi Baja Pintu Air Proyek Dam',
        ppeItems: ['welding_helmet', 'leather_gloves', 'safety_boots', 'safety_helmet'],
        activityType: 'Fabrikasi & Pengelasan Rangka Baja Pintu Air (Sluice Gate)',
        borrowedAt: start,
        expectedReturnDate: expectedEnd,
        returnedAt: actualEnd,
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
        notes: 'Pengelasan rangka profil WF pintu air intake. Lensa kedok auto-darkening berfungsi.',
        returnNotes: 'Kaca mika luar dibersihkan dari kerak las, sarung tangan kering.',
        createdAt: start,
        updatedAt: actualEnd,
      });
    }

    // 3. Supervisor inspection walk
    const supStart = createWIBDate(2026, 10, day, 7, 45);
    const supEnd = createWIBDate(2026, 10, day, 17, 0);
    newDamUsages.push({
      workerId: mandorSupervisor._id,
      workerName: mandorSupervisor.fullName,
      workerRole: mandorSupervisor.role,
      projectId: damProject._id,
      projectName: damProject.nama,
      location: 'Seluruh Area Proyek Dam Cipanunjang',
      ppeItems: ['safety_helmet', 'safety_boots', 'leather_gloves'],
      activityType: 'Pengawasan K3 Lapangan & Survey Elevasi Puncak Bendung',
      borrowedAt: supStart,
      expectedReturnDate: supEnd,
      returnedAt: supEnd,
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
      notes: 'Inspeksi berkala kelengkapan APD pekerja di area lereng dan galian.',
      returnNotes: 'Kondisi APD utuh, shift kerja selesai aman.',
      createdAt: supStart,
      updatedAt: supEnd,
    });

    // 4. Civil workers & helpers (Excavation, stone masonry, concrete)
    // Rotate 10-12 workers per day
    const dayWorkers = civilAndHelpers.slice((day % 3) * 10, (day % 3) * 10 + 11);

    dayWorkers.forEach((worker, idx) => {
      const isStoneMasonry = idx % 2 === 0;
      const act = isStoneMasonry ? damActivities[1] : damActivities[0];

      const start = createWIBDate(2026, 10, day, act.startHour, act.startMin + (idx % 6) * 2);
      const expectedEnd = createWIBDate(2026, 10, day, act.endHour, 0);
      const actualEnd = createWIBDate(2026, 10, day, act.endHour, act.endMin + (idx % 8) * 2);

      newDamUsages.push({
        workerId: worker._id,
        workerName: worker.fullName,
        workerRole: worker.role,
        projectId: damProject._id,
        projectName: damProject.nama,
        location: act.location,
        ppeItems: act.ppe,
        activityType: act.activity,
        borrowedAt: start,
        expectedReturnDate: expectedEnd,
        returnedAt: actualEnd,
        status: 'returned',
        conditionBefore: 'Baik & Layak Pakai',
        conditionAfter: idx % 4 === 0 ? 'Perlu Pembersihan' : 'Baik & Bersih',
        inspectedBy: hseManager._id,
        inspectorName: `${hseManager.fullName} (HSE Manager)`,
        inspectionChecklist: {
          fitCheck: true,
          shellStrapsIntact: true,
          latchLockSecure: true,
          certifiedStandardChecked: true,
        },
        notes: act.notes,
        returnNotes: act.returnNotes,
        createdAt: start,
        updatedAt: actualEnd,
      });
    });
  }

  // Populate photo evidence, GPS watermark data, and audit history events
  const photoList = [
    'uploads/photos/photo-1790347743595-203170381.jpg',
    'uploads/photos/photo-1790350044682-833815860.jpg',
    'uploads/photos/photo-1790767102390-786523870.jpg',
    'uploads/photos/photo-1790826742321-856459444.jpg',
    'uploads/photos/photo-1790929543325-756012479.jpg',
  ];

  const enrichedUsages = newDamUsages.map((item, idx) => {
    const borrowPhoto = photoList[idx % photoList.length];
    const returnPhoto = photoList[(idx + 2) % photoList.length];

    const lat = Number((-7.1245 + ((idx % 7) - 3) * 0.0008).toFixed(6));
    const lng = Number((107.5682 + ((idx % 5) - 2) * 0.0008).toFixed(6));
    const accuracy = 8 + (idx % 8);

    const evidence = {
      photo: borrowPhoto,
      lat,
      lng,
      accuracy,
      capturedAt: item.borrowedAt,
      serverTime: item.borrowedAt,
      isManualGpsOverride: false,
      notes: 'Foto watermark GPS terverifikasi di lokasi Bendung Cipanunjang via Watermark Camera K3.',
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

  // Insert all records
  await PPEUsage.insertMany(enrichedUsages);
  console.log(`\n✅ Successfully inserted ${enrichedUsages.length} PPE usage records with Photo Watermark & History for Proyek Dam!`);

  // Verify records in database
  const countDam = await PPEUsage.countDocuments({ projectId: damProject._id });
  const countReturned = await PPEUsage.countDocuments({ projectId: damProject._id, status: 'returned' });
  const sample = await PPEUsage.findOne({ projectId: damProject._id }).lean();

  console.log('====================================================');
  console.log('📊 PROYEK DAM SEED SUMMARY:');
  console.log(`   - Project Name: ${damProject.nama} (${damProject.lokasi})`);
  console.log(`   - Total PPE Usages Seeded: ${countDam}`);
  console.log(`   - Verified Returns: ${countReturned} (100% completed shifts)`);
  console.log(`   - Sample Borrowed: ${sample.borrowedAt.toISOString()} (${new Date(sample.borrowedAt).toLocaleTimeString('id-ID')} WIB)`);
  console.log(`   - Sample Returned: ${sample.returnedAt.toISOString()} (${new Date(sample.returnedAt).toLocaleTimeString('id-ID')} WIB)`);
  console.log('====================================================');

  await mongoose.disconnect();
  console.log('🏁 Proyek Dam seed completed.');
}

runSeedDam().catch((err) => {
  console.error('❌ Error during Proyek Dam PPE seed:', err);
  process.exit(1);
});

