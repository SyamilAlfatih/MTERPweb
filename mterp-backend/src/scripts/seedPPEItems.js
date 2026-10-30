const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { PPEItem, Project, User, Warehouse } = require('../models');
const { PPE_REGULATION_REPOSITORY } = require('../data/ppeRegulationRepository');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mterp';

async function seedPPEItems() {
  console.log('====================================================');
  console.log('🛡️  MTERP ERP - SEED DYNAMIC PPE MASTER CATALOG & INVENTORY');
  console.log('====================================================');

  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to MongoDB: ${MONGODB_URI}`);

  const hseManager = await User.findOne({
    $or: [{ fullName: /Aam Ramli/i }, { role: 'owner' }, { role: 'director' }],
  });

  const damProject = await Project.findOne({
    $or: [{ nama: /dam/i }, { lokasi: /cipanunjang/i }],
  });

  const warehouseProject = await Project.findOne({
    $or: [{ nama: /warehouse/i }, { nama: /mm2100/i }],
  });

  // Ensure real registered warehouses in MongoDB
  let headOfficeWh = await Warehouse.findOne({ code: 'WH-HQ' });
  if (!headOfficeWh) {
    headOfficeWh = await Warehouse.findOne({ isDefault: true });
  }

  let damWh = await Warehouse.findOne({ code: 'WH-DAM-01' });
  if (!damWh && damProject) {
    damWh = new Warehouse({
      name: 'Gudang Lapangan Proyek Dam Cipanunjang',
      code: 'WH-DAM-01',
      type: 'project_site',
      address: 'Site Proyek Dam Cipanunjang, Jawa Barat',
      projectId: damProject._id,
      zones: [
        {
          name: 'Zona K3 & APD Lapangan',
          code: 'Z-K3',
          racks: [
            {
              name: 'Lemari APD Lapangan',
              bins: [{ label: 'APD-01 (Helm & Harness)', capacity: 40 }],
            },
          ],
        },
      ],
      isActive: true,
      isDefault: false,
    });
    await damWh.save();
    console.log('✅ Registered Project Site Warehouse: WH-DAM-01');
  }

  let mm2100Wh = await Warehouse.findOne({ code: 'WH-MM2100' });
  if (!mm2100Wh && warehouseProject) {
    mm2100Wh = new Warehouse({
      name: 'Gudang Logistik Site MM2100',
      code: 'WH-MM2100',
      type: 'project_site',
      address: 'Kawasan Industri MM2100 Blok C-4, Cikarang Barat, Bekasi',
      projectId: warehouseProject._id,
      zones: [
        {
          name: 'Zona APD & Tool Crib',
          code: 'Z-APD',
          racks: [
            {
              name: 'Rak APD Utama',
              bins: [{ label: 'APD-MM-01', capacity: 50 }],
            },
          ],
        },
      ],
      isActive: true,
      isDefault: false,
    });
    await mm2100Wh.save();
    console.log('✅ Registered Project Site Warehouse: WH-MM2100');
  }

  const samplePhoto = 'uploads/photos/photo-1790347743595-203170381.jpg';

  const ppeCatalogItems = [
    {
      code: 'APD-HLM-001',
      name: 'Safety Helmet Delta Plus Quartz IV (Rotor Ratchet)',
      templateId: 'safety_helmet',
      brand: 'Delta Plus',
      modelNumber: 'Quartz IV Polypropylene UV',
      totalQty: 50,
      availableQty: 42,
      inUseQty: 8,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Gudang Utama MM2100 - Rak APD-A1',
      projectId: warehouseProject ? warehouseProject._id : null,
      photo: samplePhoto,
      notes: 'Helm bersertifikasi SNI dan ANSI Type 1 Class E untuk area struktur dan listrik.',
    },
    {
      code: 'APD-HLM-002',
      name: 'MSA V-Gard Slotted Full Brim Helmet',
      templateId: 'safety_helmet',
      brand: 'MSA Safety',
      modelNumber: 'V-Gard 500 Fast-Trac III',
      totalQty: 30,
      availableQty: 25,
      inUseQty: 5,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Site Office Cipanunjang - Lemari K3',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Helm pelindung kepala standar manajer dan tim inspeksi K3.',
    },
    {
      code: 'APD-BOT-001',
      name: 'Cheetah 7001H Revolution Safety Boots Heavy Duty',
      templateId: 'safety_boots',
      brand: 'Cheetah Safety Wear',
      modelNumber: '7001H Mid-Cut Steel Toe 200J',
      totalQty: 60,
      availableQty: 48,
      inUseQty: 12,
      damagedQty: 0,
      unit: 'Pasang',
      condition: 'Baik',
      location: 'Gudang Utama MM2100 - Rak APD-B1',
      projectId: warehouseProject ? warehouseProject._id : null,
      photo: samplePhoto,
      notes: 'Dilengkapi pelat sol baja anti-paku dan alur sol tahan tumpahan oli.',
    },
    {
      code: 'APD-BOT-002',
      name: "King's by Honeywell KWD205X Steel Toe & Midsole",
      templateId: 'safety_boots',
      brand: "King's Honeywell",
      modelNumber: 'KWD205X High Cut Pull-up',
      totalQty: 40,
      availableQty: 35,
      inUseQty: 5,
      damagedQty: 0,
      unit: 'Pasang',
      condition: 'Baik',
      location: 'Site Proyek Dam Cipanunjang - Pos APD',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Sepatu boot tinggi anti-lumpur dan anti-slip untuk pekerjaan bendungan.',
    },
    {
      code: 'APD-HAR-001',
      name: 'Petzl Newton Fast Full Body Harness (Dorsal & Sternal D-Ring)',
      templateId: 'full_body_harness',
      brand: 'Petzl International',
      modelNumber: 'Newton Fast C073EA01',
      totalQty: 25,
      availableQty: 18,
      inUseQty: 7,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Gudang APD Ketinggian - Rak Safety Har-01',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Harness K3 ketinggian berstandar ANSI Z359.11 dan EN 361 dengan quick-connect buckle.',
    },
    {
      code: 'APD-HAR-002',
      name: 'Karam PN-56 Fall Arrest Safety Harness',
      templateId: 'full_body_harness',
      brand: 'Karam Safety',
      modelNumber: 'PN-56 Dual Lanyard Ready',
      totalQty: 20,
      availableQty: 16,
      inUseQty: 4,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Gudang Utama MM2100 - Rak APD-HAR',
      projectId: warehouseProject ? warehouseProject._id : null,
      photo: samplePhoto,
      notes: 'Harness penahan jatuh bersertifikasi SNI 0428 untuk scaffolding.',
    },
    {
      code: 'APD-FAL-001',
      name: '3M DBI-SALA Nano-Lok Self-Retracting Lifeline 6m Cable',
      templateId: 'fall_arrester',
      brand: '3M Fall Protection',
      modelNumber: 'DBI-SALA Nano-Lok 3101277',
      totalQty: 15,
      availableQty: 11,
      inUseQty: 4,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Workshop K3 Site Cipanunjang - Bin FAL-01',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Penahan jatuh otomatis kawat sling galvanis rem sentrifugal instan.',
    },
    {
      code: 'APD-WEB-001',
      name: 'Safety Webs / Netting Polypropylene High Tenacity 100mm Mesh',
      templateId: 'safety_web',
      brand: 'TenCate Geosynthetics',
      modelNumber: 'SafeNet Pro 10x5m System S',
      totalQty: 12,
      availableQty: 9,
      inUseQty: 3,
      damagedQty: 0,
      unit: 'Set',
      condition: 'Baik',
      location: 'Gudang Terbuka MM2100 - Palet APD-NET',
      projectId: warehouseProject ? warehouseProject._id : null,
      photo: samplePhoto,
      notes: 'Jaring pengaman tangkap jatuh orang dan puing sesuai OSHA 1926.105 dan EN 1263-1.',
    },
    {
      code: 'APD-KDK-001',
      name: 'Miller Digital Elite Auto-Darkening Welding Helmet',
      templateId: 'welding_helmet',
      brand: 'Miller Electric',
      modelNumber: 'Digital Elite Series Shade 9-13',
      totalQty: 14,
      availableQty: 10,
      inUseQty: 4,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Workshop Fabrikasi Baja Bendung - Rak Las',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Kedok las auto-darkening sensor optik 4 titik untuk pengelasan pipa dan pintu air.',
    },
    {
      code: 'APD-GLV-001',
      name: 'Heavy Duty Split Cowhide Leather Welder Gloves 14-inch',
      templateId: 'leather_gloves',
      brand: 'Ironclad Performance',
      modelNumber: 'Welder Pro Split Leather 14"',
      totalQty: 80,
      availableQty: 65,
      inUseQty: 15,
      damagedQty: 0,
      unit: 'Pasang',
      condition: 'Baik',
      location: 'Gudang Utama MM2100 - Rak GLV-01',
      projectId: warehouseProject ? warehouseProject._id : null,
      photo: samplePhoto,
      notes: 'Sarung tangan kulit tahan percikan terak dan abrasi kawat rebar besi.',
    },
    {
      code: 'APD-GLS-001',
      name: '3M SecureFit 400 Clear Anti-Fog Impact Safety Glasses',
      templateId: 'safety_glasses',
      brand: '3M Safety',
      modelNumber: 'SF401AF-AS Clear Polycarbonate',
      totalQty: 100,
      availableQty: 85,
      inUseQty: 15,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Pos Satpam & Portal K3 Site Gate',
      projectId: null,
      photo: samplePhoto,
      notes: 'Kacamata pengaman ANSI Z87+ tahan serpihan gerinda dan debu semen.',
    },
    {
      code: 'APD-MSK-001',
      name: '3M 6200 Half Facepiece Dual Cartridge N95 Respirator',
      templateId: 'respiratory_protection',
      brand: '3M Safety',
      modelNumber: '6200 Medium + 6001 Organic Vapor',
      totalQty: 30,
      availableQty: 24,
      inUseQty: 6,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Gudang Kimia & Batching Plant K3',
      projectId: null,
      photo: samplePhoto,
      notes: 'Respirator silikon filtrasi debu silika dan uap tiner cat semprot.',
    },
    {
      code: 'APD-EAR-001',
      name: '3M Peltor Optime 105 Over-the-Head Hearing Earmuffs (NRR 30dB)',
      templateId: 'hearing_protection',
      brand: '3M Peltor',
      modelNumber: 'H10A Optime 105 Twin-Cup',
      totalQty: 35,
      availableQty: 30,
      inUseQty: 5,
      damagedQty: 0,
      unit: 'Unit',
      condition: 'Baik',
      location: 'Zona Genset & Pemancangan Pile Hammer',
      projectId: damProject ? damProject._id : null,
      photo: samplePhoto,
      notes: 'Peredam bising frekuensi tinggi NRR 30 dB sesuai Permenaker No. 5/2018.',
    },
  ];

  // Upsert items into database
  let inserted = 0;
  let updated = 0;

  for (const itemData of ppeCatalogItems) {
    // Find regulation template from repo
    const tpl = PPE_REGULATION_REPOSITORY.find((r) => r.templateId === itemData.templateId);
    if (!tpl) continue;

    const targetWh = (itemData.projectId && damProject && String(itemData.projectId) === String(damProject._id))
      ? damWh
      : (itemData.projectId && warehouseProject && String(itemData.projectId) === String(warehouseProject._id))
      ? mm2100Wh
      : headOfficeWh;

    const fullDoc = {
      ...itemData,
      warehouseId: targetWh ? targetWh._id : headOfficeWh?._id || null,
      location: targetWh ? targetWh.name : (headOfficeWh ? headOfficeWh.name : 'Head Office PT Mega Tama Enerco'),
      binRef: targetWh?.code === 'WH-DAM-01'
        ? 'Lemari APD Lapangan > APD-01'
        : targetWh?.code === 'WH-MM2100'
        ? 'Rak APD Utama > APD-MM-01'
        : 'Zona C - Safety & Consumables > Rak Safety > C-01 (Helm & Harness)',
      category: tpl.category,
      categoryLabel: tpl.categoryLabel,
      standardRegulation: tpl.standardRegulation,
      guide: tpl.guide,
      status: 'active',
      createdBy: hseManager ? hseManager._id : null,
    };

    const res = await PPEItem.findOneAndUpdate(
      { code: itemData.code },
      { $set: fullDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (res.isNew) inserted++;
    else updated++;
  }

  const totalCount = await PPEItem.countDocuments();
  console.log(`\n✅ Dynamic PPE Master Catalog initialized successfully!`);
  console.log(`   - Total Items in Master: ${totalCount}`);
  console.log(`   - New Items Inserted:   ${inserted}`);
  console.log(`   - Existing Updated:     ${updated}`);
  console.log('====================================================');

  await mongoose.disconnect();
  console.log('🏁 PPE Item seed completed.');
}

seedPPEItems().catch((err) => {
  console.error('❌ Error seeding PPE Items:', err);
  process.exit(1);
});

