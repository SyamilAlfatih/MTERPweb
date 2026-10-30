const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { PPEUsage, PPEItem, User, Project } = require('../models');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { PPE_REGULATION_REPOSITORY } = require('../data/ppeRegulationRepository');

// Helper to safely delete physical photo files from disk (Storage optimization rule)
function deletePhysicalFile(filePath) {
  if (!filePath) return;
  try {
    let resolvedPath = filePath;
    if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.join(__dirname, '../../', filePath);
    }
    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      console.log(`[Storage Cleanup] Purged physical photo: ${resolvedPath}`);
    }
  } catch (err) {
    console.warn(`[Storage Cleanup] Could not delete file ${filePath}:`, err.message);
  }
}

const router = express.Router();

// Static guide for the 7 standard PPE items in MTERP
const PPE_GUIDE = [
  {
    id: 'safety_helmet',
    name: 'Safety Helmets (Helm Keselamatan)',
    category: 'Pelindung Kepala (Head Protection)',
    standard: 'SNI ISO 3873 / ANSI Z89.1 Type 1 Class E & G',
    riskLevel: 'Kritis (Critical - Wajib di seluruh zona proyek)',
    colorCode: 'Putih (Manajer/Tamu/Inspektur), Kuning (Pekerja Sipil/Helper), Biru (Mekanikal/Elektrikal), Merah (HSE/Safety Officer)',
    description:
      'Melindungi tempurung kepala dari benturan material jatuh, benturan objek statis, dan percikan bahan kimia ringan atau bahaya listrik.',
    preUseInspection: [
      'Periksa cangkang helm (shell): pastikan tidak ada retak, lecet dalam, lekukan, atau perubahan warna akibat paparan UV berlebih.',
      'Periksa suspensi dalam (harness): pastikan pita webbing tidak sobek, tidak aus, dan terpasang kuat di 4 atau 6 titik kait helm.',
      'Cek tali dagu (chin strap): pastikan elastisitas terjaga dan buckle pengunci berfungsi klik dengan baik.',
      'Periksa tanggal kadaluarsa produksi (helm umumnya afkir maksimal 3–5 tahun sejak tanggal cetak pabrik).',
    ],
    wearingSteps: [
      'Sesuaikan putaran ratchet suspension di bagian belakang kepala agar pas dan tidak bergeser saat menunduk.',
      'Posisikan helm secara horizontal rata di kepala, tidak miring ke belakang atau terlalu condong ke depan.',
      'Kencangkan tali dagu (chin strap) hingga pas di bawah rahang bawah (maksimal celah 1–2 jari).',
      'Lakukan uji geleng kepala pelan: helm tidak boleh goyang atau terlepas tanpa tali dagu.',
    ],
    maintenance: [
      'Bersihkan helm menggunakan air sabun hangat dengan spons lembut. Dilarang menggunakan bensin atau pelarut keras.',
      'Simpan di tempat kering, teduh, dan terlindung dari terik sinar matahari langsung saat tidak digunakan.',
      'Dilarang mengecat cangkang helm atau menempelkan stiker berlebih yang dapat menutupi keretakan struktural.',
    ],
    dosAndDonts: {
      dos: [
        'Wajib dipakai sebelum memasuki portal gerbang proyek (site gate).',
        'Ganti helm segera jika pernah mengalami benturan keras meskipun tidak terlihat retak secara kasat mata.',
      ],
      donts: [
        'Dilarang menggunakan helm terbalik (kecuali jenis helm las khusus reversible yang diizinkan pabrik).',
        'Dilarang menaruh benda keras atau sarung tangan di antara suspensi dan kepala.',
      ],
    },
  },
  {
    id: 'safety_boots',
    name: 'Safety Boots (Sepatu Keselamatan)',
    category: 'Pelindung Kaki (Foot & Toe Protection)',
    standard: 'SNI 7079 / EN ISO 20345:2011 S1P / S3 (Steel Toe Cap 200J)',
    riskLevel: 'Kritis (Wajib di seluruh zona aktif)',
    colorCode: 'Hitam / Coklat Kulit (Standar Heavy Duty)',
    description:
      'Melindungi jari dan telapak kaki dari kejatuhan beban berat, tusukan paku/kawat beton, tumpahan oli/minyak licin, dan sengatan listrik statis.',
    preUseInspection: [
      'Periksa steel toe cap: pastikan tidak ada perubahan bentuk fisik atau kulit pelapis yang sobek hingga logam terbuka.',
      'Periksa tapak sol (outsole): pastikan alur anti-slip masih tebal dan tidak aus atau retak.',
      'Periksa sol tengah (midsole): pastikan pelat baja anti paku tidak tembus atau longgar.',
      'Pastikan tali sepatu atau ritsleting samping berfungsi kencang dan tidak rapuh.',
    ],
    wearingSteps: [
      'Gunakan kaus kaki berbahan katun tebal untuk menyerap keringat dan mencegah lecet pada tumit/jari.',
      'Masukkan kaki hingga tumit menempel rapat pada back-counter sepatu.',
      'Kencangkan tali sepatu secara simetris dari bawah ke atas agar pergelangan kaki terikat stabil.',
      'Pastikan celana panjang kerja menutupi bagian atas collar sepatu agar kerikil atau percikan las tidak masuk.',
    ],
    maintenance: [
      'Bersihkan sisa lumpur, semen, atau oli segera setelah shift selesai menggunakan sikat kaku basah.',
      'Oleskan semir atau wax pelindung kulit seminggu sekali untuk menjaga elastisitas kulit sepatu.',
      'Keringkan di ruangan berventilasi baik; hindari memanggang sepatu di atas api atau radiator pemanas.',
    ],
    dosAndDonts: {
      dos: [
        'Pilih ukuran sepatu yang pas (beri ruang toleransi sekitar 0.5 cm di ujung jari kaki).',
        'Ganti sol dalam (insole) jika sudah kempis atau hilang daya redamnya.',
      ],
      donts: [
        'Dilarang menginjak bagian tumit sepatu (mengenakan seperti sandal selop).',
        'Dilarang menggunakan sepatu dengan sol yang sudah halus di area basah atau licin.',
      ],
    },
  },
  {
    id: 'full_body_harness',
    name: 'Full Body Harness (Sabuk Pengaman Tubuh Penuh)',
    category: 'Perlindungan Bahaya Jatuh Ketinggian (Fall Protection)',
    standard: 'SNI 0428 / ANSI Z359.11 / EN 361 (Kekuatan Beban Min 15 kN)',
    riskLevel: 'Sangat Kritis (Wajib untuk elevasi kerja >= 1.8 meter)',
    colorCode: 'Hi-Vis Yellow / Orange / Black Straps',
    description:
      'Mendistribusikan gaya kejut penahanan jatuh ke paha, dada, dan panggul pekerja pada saat terjadi insiden jatuh dari ketinggian.',
    preUseInspection: [
      'Gantung harness pada D-ring belakang (dorsal D-ring) dan kibaskan perlahan agar anyaman webbing jatuh alami.',
      'Periksa seluruh serat webbing: cari benang putus, bekas terbakar percikan las, sayatan, atau paparan zat asam.',
      'Periksa komponen logam: D-ring, quick-connect buckles, dan grommet dari karat, deformasi, atau keretakan.',
      'Periksa label indikator jatuh (fall impact indicator): jika jahitan indikator sudah putus/terbuka, HARNESS AFKIR DAN TIDAK BOLEH DIPAKAI.',
    ],
    wearingSteps: [
      'Pegang harness pada cincin D-ring punggung lalu pasangkan tali pundak seperti mengenakan jaket/rompi.',
      'Tarik tali paha (leg straps) melalui selangkangan dan kunci buckle ke masing-masing sisi paha. Pastikan tidak melintir.',
      'Hubungkan tali dada (chest strap) dan posisikan di tengah tulang dada (sekitar 15 cm di bawah kerah baju).',
      'Sesuaikan kekencangan: telapak tangan datar harus bisa masuk di antara webbing dan paha, namun kepalan tangan tidak bisa lewat.',
      'Pastikan dorsal D-ring terletak tepat di antara kedua tulang belikat (shoulder blades).',
    ],
    maintenance: [
      'Cuci dengan air bersih dan sabun netral jika terkena keringat berlebih atau lumpur.',
      'Keringkan di tempat teduh dengan cara digantung pada D-ring dorsal.',
      'Simpan di lemari APD khusus K3 yang kering, berventilasi, dan terhindar dari paparan tikus atau sinar UV.',
    ],
    dosAndDonts: {
      dos: [
        'Wajib dipakai bersama shock-absorbing lanyard atau fall arrester otomatis.',
        'Wajib diperiksa oleh personel K3 berkompetensi (TKBT/TKPK) sebelum naik ke struktur.',
      ],
      donts: [
        'Dilarang menggunakan sabuk pinggang biasa (body belt) untuk penahan jatuh bebas (fall arrest).',
        'Dilarang memodifikasi, mengebor, atau memotong tali webbing harness dengan alasan apapun.',
      ],
    },
  },
  {
    id: 'safety_webs',
    name: 'Safety Webs (Jaring Pengaman / Safety Nets)',
    category: 'Sistem Penahan Jatuh Kolektif (Passive Fall Arrest)',
    standard: 'EN 1263-1 / OSHA 1926.105 (Kekuatan Mesh Tali Min 2.3 kN)',
    riskLevel: 'Sangat Kritis (Zona Struktur Baja & Void Ketinggian)',
    colorCode: 'Biru / Hijau Cerah / Putih Nilon',
    description:
      'Perlindungan kolektif untuk menangkap pekerja atau puing-puing material bangunan yang jatuh bebas dari tepi pelat lantai atau struktur rangka atap.',
    preUseInspection: [
      'Periksa mata jaring (mesh): pastikan tidak ada sambungan tali yang putus, terbakar las, atau renggang berlebihan.',
      'Periksa tali tepi keliling (border rope) dan simpul pengait ke struktur penopang.',
      'Pastikan jaring bersih dari tumpukan material bekas, puing bata, atau besi sisa proyek sebelumnya.',
      'Cek sertifikat uji beban statis & dinamis berkala (label kalibrasi).',
    ],
    wearingSteps: [
      'Bentangkan jaring di bawah area kerja ketinggian dengan jarak vertikal jatuh sedekat mungkin (maksimum 6 meter di bawah lantai kerja).',
      'Ikatkan tali batas tepi (border rope) ke angkur atau pipa scaffolding penopang berdiameter minimal 48mm dengan jarak ikatan tiap 2.5 meter.',
      'Pastikan terdapat ruang lendutan bebas (clearance) di bawah jaring agar korban jatuh tidak menghantam lantai dasar saat jaring meregang.',
      'Pasang debris netting (kasa penahan puing halus) jika ada pekerja aktif di lantai bawahnya.',
    ],
    maintenance: [
      'Bersihkan material sampah atau potongan kawat yang tersangkut setiap sore hari.',
      'Bongkar dan gulung rapi saat cuaca ekstrem (angin kencang) jika struktur belum terikat permanen.',
      'Simpan gulungan jaring di rak palet kayu yang kering dan terlindung dari sinar matahari langsung.',
    ],
    dosAndDonts: {
      dos: [
        'Lakukan uji drop-test (kantong pasir 100 kg) setelah instalasi pertama di struktur bentang lebar.',
        'Tumpang tindih (overlap) minimal 2 meter bila menyambung dua bentang jaring pengaman.',
      ],
      donts: [
        'Dilarang menggunakan jaring yang pernah menahan beban kejatuhan pekerja sebelum diuji dan disertifikasi ulang.',
        'Dilarang menumpuk sisa material baja atau peralatan kerja di atas permukaan jaring pengaman.',
      ],
    },
  },
  {
    id: 'fall_arrester',
    name: 'Fall Arrester (Alat Penahan Jatuh Otomatis / Retractable Lifeline)',
    category: 'Sistem Penahan Jatuh Dinamis (Self-Retracting Lifeline)',
    standard: 'ANSI Z359.14 Class A/B / EN 360 / SNI K3',
    riskLevel: 'Sangat Kritis (Pekerjaan Tangga Vertikal & Struktur Baja)',
    colorCode: 'Aluminium / Housing Komposit Kuning-Hitam',
    description:
      'Alat mekanis otomatis yang mengunci secara sentrifugal saat terjadi sentakan percepatan jatuh mendadak, menghentikan jatuh dalam hitungan sentimeter.',
    preUseInspection: [
      'Tarik kawat sling / webbing secara manual: kabel harus keluar dengan mulus dan tergulung kembali otomatis tanpa tersendat.',
      'Lakukan uji sentak cepat (jerk test): mekanisme rem sentrifugal harus mengunci seketika dengan suara "klik" tegas.',
      'Periksa kawat baja (wire rope) dari lilitan kusut (kinking), kawat putus (birdcaging), atau karat.',
      'Periksa snap hook / karabiner: pastikan double-locking gate menutup dan mengunci rapat otomatis.',
    ],
    wearingSteps: [
      'Gantung housing fall arrester pada titik angkur yang kokoh (kapasitas minimal 22 kN) tepat di atas kepala pekerja (overhead anchor).',
      'Tarik hook ke bawah perlahan dan sambungkan ke dorsal D-ring harness pekerja.',
      'Pastikan karabiner terkunci rapat dengan memutar sleeve atau memastikan pin terkunci penuh.',
      'Pekerja dapat bergerak naik/turun; kabel akan memanjang dan memendek secara otomatis mengikuti pergerakan.',
    ],
    maintenance: [
      'Gunakan tali pemandu (retrieval cord) saat membiarkan kabel tergulung masuk agar tidak membentur housing dengan kecepatan tinggi.',
      'Bersihkan kabel baja dari debu dan lumasi tipis dengan minyak pelindung anti-korosi bila beroperasi di area lembab.',
      'Kirim ke bengkel servis bersertifikasi resmi untuk re-sertifikasi tahunan sesuai instruksi manufaktur.',
    ],
    dosAndDonts: {
      dos: [
        'Pastikan sudut kerja tidak melebihi 15 derajat dari titik tegak lurus angkur untuk mencegah efek pendulum saat jatuh (swing hazard).',
        'Gunakan selalu titik angkur yang telah dihitung dan diverifikasi oleh Ahli K3 Konstruksi.',
      ],
      donts: [
        'Dilarang melepaskan kabel hingga tergulung bebas tanpa pengawasan (dapat merusak pegas internal).',
        'Dilarang menyambung tali lanyard tambahan antara fall arrester dan harness pekerja.',
      ],
    },
  },
  {
    id: 'welding_helmet',
    name: 'Welding Protection Helmet (Kedok / Helm Las K3)',
    category: 'Pelindung Mata & Wajah (Eye & Face Radiation Protection)',
    standard: 'EN 175 / ANSI Z87.1 / CSA Z94.3 (Shade 9–13 Auto-Darkening)',
    riskLevel: 'Tinggi (Pekerjaan Fabrikasi & Pengelasan Panas)',
    colorCode: 'Hitam Matte / Anti-Reflective Shield',
    description:
      'Melindungi kornea mata dari radiasi sinar ultraviolet (UV) dan inframerah (IR) busur api las, serta melindungi wajah dari percikan terak baja cair (spatter).',
    preUseInspection: [
      'Periksa lensa kaca pelindung depan (cover lens): ganti jika sudah banyak goresan atau terkena percikan kerak las.',
      'Cek filter Auto-Darkening (ADF): uji sensor cahaya dengan menyalakan korek api atau menekan tombol TEST pada unit digital.',
      'Periksa baterai internal dan panel solar: pastikan status baterai mencukupi untuk operasional satu shift penuh.',
      'Periksa ratchet ikat kepala (headgear): pastikan engsel penahan sudut naik/turun berfungsi kencang.',
    ],
    wearingSteps: [
      'Atur tingkat kegelapan lensa (shade control) sesuai jenis pengelasan: SMAW/MIG (Shade 10–12), TIG (Shade 11–13).',
      'Atur sensitivitas (sensitivity) dan waktu jeda kembali terang (delay time).',
      'Pasang helm di kepala, kencangkan knob putar belakang, dan setel jarak pandang lensa terhadap mata sekitar 2–3 cm.',
      'Turunkan kedok ke depan wajah sebelum menyalakan busur elektroda las pertama kali.',
    ],
    maintenance: [
      'Ganti lembar mika pelindung luar secara berkala agar pandangan juru las tetap jernih dan fokus.',
      'Bersihkan sensor ADF dan sel surya menggunakan kain pembersih kacamata kering tanpa bahan kimia keras.',
      'Simpan helm di dalam tas pelindung (fabric bag) atau kotak penyimpanan kering agar sensor tidak terkena benturan.',
    ],
    dosAndDonts: {
      dos: [
        'Tetap kenakan kacamata safety bening (safety glasses) di balik helm las saat membersihkan kerak terak menggunakan palu chipping.',
        'Segera istirahat jika mata terasa berpasir atau perih akibat kebocoran sinar las (arc eye).',
      ],
      donts: [
        'Dilarang melihat langsung ke busur las listrik tanpa filter kaca pelindung berstandar.',
        'Dilarang mencelupkan helm atau unit elektronik ADF ke dalam air.',
      ],
    },
  },
  {
    id: 'leather_gloves',
    name: 'Leather Gloves (Sarung Tangan Kulit Las & Konstruksi)',
    category: 'Pelindung Tangan & Lengan (Hand Thermal & Abrasion Protection)',
    standard: 'EN 388 (Mekanik 413X) & EN 407 (Panas & Api 413X4X)',
    riskLevel: 'Tinggi (Fabrikasi, Pemotongan Plat, & Penanganan Logam)',
    colorCode: 'Kuning Suede / Abu-abu Kulit Sapi / Kulit Split Tebal',
    description:
      'Melindungi telapak tangan dan pergelangan dari sengatan panas tinggi las, percikan api gerinda, sayatan tepi plat tajam, dan goresan kawat bronjong.',
    preUseInspection: [
      'Periksa jahitan benang kevlar: pastikan tidak ada benang yang terlepas atau robek di sela-sela jari.',
      'Periksa permukaan kulit: pastikan tidak ada lubang bekas terbakar, retakan mengeras, atau bagian kulit yang menipis.',
      'Pastikan bagian dalam sarung tangan kering dan bebas dari paku, serbuk besi, atau benda tajam.',
      'Cek panjang manset pelindung pergelangan tangan (gauntlet cuff minimal 10–15 cm).',
    ],
    wearingSteps: [
      'Pilih sarung tangan dengan ukuran pas agar tidak mengurangi kelenturan genggaman alat kerja.',
      'Masukkan tangan hingga seluruh ujung jari menyentuh dasar sarung tangan dengan mantap.',
      'Tarik manset panjang (cuff) menutupi lengan kemeja kerja panjang untuk mencegah percikan terak masuk ke dalam baju.',
      'Pastikan tangan kering sebelum mengenakan sarung tangan.',
    ],
    maintenance: [
      'Kibaskan sisa debu logam setelah selesai bekerja.',
      'Jemur sarung tangan di tempat teduh berangin bila basah terkena keringat; hindari menjemur di bawah terik matahari terik yang membuat kulit menjadi kaku dan getas.',
      'Segera buang dan ganti sarung tangan jika sudah timbul lubang tembus atau sobek pada area telapak.',
    ],
    dosAndDonts: {
      dos: [
        'Gunakan jenis sarung tangan kulit split tebal untuk las busur SMAW dan kulit kambing fleksibel (goat skin) untuk las TIG presisi.',
        'Ganti sarung tangan jika terkontaminasi minyak oli berlebih yang dapat memicu percikan api menyala.',
      ],
      donts: [
        'Dilarang mengenakan sarung tangan kulit longgar saat mengoperasikan mesin bor duduk atau mesin bubut berputar cepat (risiko terjepit/terlilit).',
        'Dilarang mencuci sarung tangan kulit menggunakan mesin cuci deterjen.',
      ],
    },
  },
];

// GET /api/ppe-usages/guide - Get PPE standards and how-to guides (Dynamic + Repository)
router.get('/guide', async (req, res) => {
  try {
    const customItems = await PPEItem.find({ status: 'active' })
      .select('code name category categoryLabel brand modelNumber standardRegulation guide photo templateId')
      .lean();

    res.json({
      success: true,
      data: PPE_GUIDE,
      repository: PPE_REGULATION_REPOSITORY,
      customGuides: customItems || [],
    });
  } catch (error) {
    res.json({
      success: true,
      data: PPE_GUIDE,
      repository: PPE_REGULATION_REPOSITORY,
      customGuides: [],
    });
  }
});

// GET /api/ppe-usages/stats - Overview metrics
router.get('/stats', auth, async (req, res) => {
  try {
    const totalRecords = await PPEUsage.countDocuments();
    const activeInUse = await PPEUsage.countDocuments({ status: 'in_use' });
    const returnedCount = await PPEUsage.countDocuments({ status: 'returned' });
    const highRiskCount = await PPEUsage.countDocuments({
      ppeItems: { $in: ['full_body_harness', 'fall_arrester', 'welding_helmet'] },
    });

    // Breakdown per PPE Item
    const ppeDistribution = {};
    const validItems = [
      'safety_helmet',
      'safety_boots',
      'full_body_harness',
      'safety_web',
      'fall_arrester',
      'welding_helmet',
      'leather_gloves',
    ];

    for (const item of validItems) {
      ppeDistribution[item] = await PPEUsage.countDocuments({ ppeItems: item, status: 'in_use' });
    }

    const recentInspections = await PPEUsage.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('workerId', 'fullName username role')
      .populate('projectId', 'nama lokasi')
      .lean();

    res.json({
      success: true,
      stats: {
        totalRecords,
        activeInUse,
        returnedCount,
        highRiskCount,
        ppeDistribution,
        recentInspections,
      },
    });
  } catch (error) {
    console.error('Error fetching PPE stats:', error);
    res.status(500).json({ msg: 'Gagal mengambil statistik APD', error: error.message });
  }
});

// Human-readable labels for the 7 PPE items
const PPE_ITEM_LABELS = {
  safety_helmet: 'Safety Helmets (Helm Proyek)',
  safety_boots: 'Safety Boots (Sepatu Safety)',
  full_body_harness: 'Full Body Harness (Sabuk Tubuh)',
  safety_web: 'Safety Webs (Jaring Pengaman)',
  fall_arrester: 'Fall Arrester (Penahan Jatuh)',
  welding_helmet: 'Welding Helmet (Kedok Las)',
  leather_gloves: 'Leather Gloves (Sarung Tangan Kulit)',
};

// GET /api/ppe-usages/export/excel - Export PPE usage records to Excel (.xlsx)
router.get('/export/excel', auth, async (req, res) => {
  try {
    const { status, ppeType, projectId, workerId, search, startDate, endDate } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (ppeType && ppeType !== 'all') {
      query.ppeItems = ppeType;
    }

    if (projectId && projectId !== 'all') {
      query.projectId = projectId;
    }

    if (workerId && workerId !== 'all') {
      query.workerId = workerId;
    }

    if (startDate || endDate) {
      query.borrowedAt = {};
      if (startDate) query.borrowedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.borrowedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { workerName: searchRegex },
        { projectName: searchRegex },
        { location: searchRegex },
        { activityType: searchRegex },
        { inspectorName: searchRegex },
        { notes: searchRegex },
      ];
    }

    const items = await PPEUsage.find(query)
      .sort({ createdAt: -1, borrowedAt: -1 })
      .populate('workerId', 'fullName username role position')
      .populate('projectId', 'nama lokasi status')
      .populate('inspectedBy', 'fullName role')
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MTERP Construction ERP - Safety Module';
    workbook.created = new Date();

    // Sheet 1: Data Rekap Pemakaian APD
    const sheet = workbook.addWorksheet('Catatan Pemakaian APD', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    // Title banner
    sheet.mergeCells('A1:R1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'PT MEGA TAMA ENERCO - LAPORAN PEMAKAIAN ALAT PELINDUNG DIRI (APD / PPE)';
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:R2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Tanggal Ekspor: ${new Date().toLocaleString('id-ID')} | Total Catatan: ${items.length} Data | Kategori: 7 APD Standar K3`;
    subCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };
    sheet.getRow(2).height = 18;

    sheet.getRow(3).height = 8; // Spacer

    // Header columns
    sheet.getRow(4).values = [
      'No',
      'Waktu Pinjam',
      'Nama Pekerja',
      'Jabatan / Posisi',
      'Role Akun',
      'Item APD Digunakan',
      'Jumlah APD',
      'Aktivitas Kerja',
      'Proyek Terkait',
      'Lokasi / Elevasi',
      'Status Pemakaian',
      'Kondisi Awal',
      'Kondisi Kembali',
      'Waktu Kembali',
      'Inspektur K3 (HSE)',
      'Checklist K3',
      'Catatan Awal',
      'Catatan Pengembalian',
    ];

    const colWidths = [6, 20, 26, 24, 16, 42, 12, 34, 32, 25, 20, 20, 22, 20, 26, 24, 30, 30];
    colWidths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    const headerRow = sheet.getRow(4);
    headerRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }, // Slate-900
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 26;

    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: 18 },
    };

    const formatDateStr = (d) => {
      if (!d) return '-';
      return new Date(d).toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    // Populate data rows
    items.forEach((item, index) => {
      const ppeLabels = (item.ppeItems || []).map((k) => PPE_ITEM_LABELS[k] || k).join(', ');
      const isReturned = item.status === 'returned';
      const checklistOk =
        item.inspectionChecklist &&
        item.inspectionChecklist.fitCheck &&
        item.inspectionChecklist.shellStrapsIntact &&
        item.inspectionChecklist.latchLockSecure &&
        item.inspectionChecklist.certifiedStandardChecked;

      const row = sheet.addRow([
        index + 1,
        formatDateStr(item.borrowedAt),
        item.workerName,
        item.workerId?.position || 'Tenaga Kerja Lapangan',
        item.workerRole || item.workerId?.role || 'worker',
        ppeLabels,
        item.ppeItems ? item.ppeItems.length : 0,
        item.activityType,
        item.projectName || item.projectId?.nama || '-',
        item.location || '-',
        isReturned ? 'Telah Dikembalikan' : 'Sedang Dipakai',
        item.conditionBefore,
        item.conditionAfter,
        formatDateStr(item.returnedAt),
        item.inspectorName || 'HSE Manager',
        checklistOk ? 'Lengkap & Memenuhi Standar' : 'Perlu Perhatian',
        item.notes || '-',
        item.returnNotes || '-',
      ]);

      row.height = 22;
      const isEven = index % 2 === 0;

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (colNum === 1 || colNum === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }

        if (colNum === 11) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (isReturned) {
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF065F46' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          } else {
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF92400E' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          }
        } else if (!isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    });

    // Sheet 2: Panduan & Standar SOP 7 APD
    const guideSheet = workbook.addWorksheet('Standar SOP 7 APD', {
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    guideSheet.mergeCells('A1:H1');
    const guideTitle = guideSheet.getCell('A1');
    guideTitle.value = 'STANDAR OPERASIONAL PROSEDUR (SOP) & CARA PEMAKAIAN 7 APD RESMI MTERP';
    guideTitle.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    guideSheet.getRow(1).height = 24;

    guideSheet.getRow(2).values = [
      'No',
      'Nama Item APD',
      'Kategori Perlindungan',
      'Standar Regulasi / Sertifikasi',
      'Tingkat Risiko',
      'Fungsi & Perlindungan Utama',
      'Pemeriksaan Sebelum Pakai',
      'Langkah Pemakaian yang Benar',
    ];

    const guideColWidths = [6, 30, 30, 32, 22, 45, 55, 55];
    guideColWidths.forEach((w, i) => {
      guideSheet.getColumn(i + 1).width = w;
    });

    const guideHeaderRow = guideSheet.getRow(2);
    guideHeaderRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    guideHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' }, // Amber-600
    };
    guideHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    guideHeaderRow.height = 26;

    PPE_GUIDE.forEach((g, idx) => {
      const gRow = guideSheet.addRow([
        idx + 1,
        g.name,
        g.category,
        g.standard,
        g.riskLevel,
        g.description,
        g.preUseInspection.join('\n• '),
        g.wearingSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      ]);

      gRow.height = 65;
      gRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (colNum === 1) cell.alignment = { horizontal: 'center', vertical: 'top' };
      });
    });

    const filename = `Laporan-Pemakaian-APD-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting PPE Excel:', error);
    res.status(500).json({ msg: 'Gagal mengekspor data APD ke Excel', error: error.message });
  }
});

// GET /api/ppe-usages - List usages with filters & pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      status,
      ppeType,
      projectId,
      workerId,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (ppeType && ppeType !== 'all') {
      query.ppeItems = ppeType;
    }

    if (projectId && projectId !== 'all') {
      query.projectId = projectId;
    }

    if (workerId && workerId !== 'all') {
      query.workerId = workerId;
    }

    if (startDate || endDate) {
      query.borrowedAt = {};
      if (startDate) query.borrowedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.borrowedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { workerName: searchRegex },
        { projectName: searchRegex },
        { location: searchRegex },
        { activityType: searchRegex },
        { inspectorName: searchRegex },
        { notes: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      PPEUsage.find(query)
        .sort({ createdAt: -1, borrowedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('workerId', 'fullName username role position')
        .populate('projectId', 'nama lokasi status')
        .populate('inspectedBy', 'fullName role')
        .lean(),
      PPEUsage.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching PPE usages:', error);
    res.status(500).json({ msg: 'Gagal mengambil riwayat penggunaan APD', error: error.message });
  }
});

// POST /api/ppe-usages - Record new PPE usage with photo watermark rules
router.post('/', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    let {
      workerId,
      projectId,
      ppeItems,
      activityType,
      borrowedAt,
      expectedReturnDate,
      conditionBefore,
      location,
      notes,
      inspectionChecklist,
      lat,
      lng,
      accuracy,
      capturedAt,
      isManualGpsOverride,
    } = req.body;

    if (!workerId) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(400).json({ msg: 'Pekerja wajib dipilih' });
    }

    if (typeof ppeItems === 'string') {
      try {
        ppeItems = JSON.parse(ppeItems);
      } catch (e) {
        ppeItems = ppeItems.split(',').map((s) => s.trim());
      }
    }

    if (typeof inspectionChecklist === 'string') {
      try {
        inspectionChecklist = JSON.parse(inspectionChecklist);
      } catch (e) {
        inspectionChecklist = null;
      }
    }

    if (!Array.isArray(ppeItems) || ppeItems.length === 0) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(400).json({ msg: 'Pilih minimal satu item APD yang digunakan' });
    }

    if (!activityType) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(400).json({ msg: 'Jenis aktivitas/pekerjaan wajib diisi' });
    }

    const worker = await User.findById(workerId).select('fullName role position');
    if (!worker) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(404).json({ msg: 'Data pekerja tidak ditemukan' });
    }

    let projectName = '';
    let resolvedLocation = location || '';
    if (projectId) {
      const project = await Project.findById(projectId).select('nama lokasi');
      if (project) {
        projectName = project.nama;
        if (!resolvedLocation) resolvedLocation = project.lokasi || '';
      }
    }

    const inspectorName = req.user
      ? `${req.user.fullName || req.user.username} (${req.user.role || 'Staff'})`
      : 'HSE Officer';

    const photoPath = req.file ? req.file.path : null;
    const hasGps = lat !== undefined && lat !== null && lat !== '' && !isNaN(Number(lat)) &&
                   lng !== undefined && lng !== null && lng !== '' && !isNaN(Number(lng));
    const manualOverride = isManualGpsOverride === 'true' || isManualGpsOverride === true;

    const evidenceObj = {
      photo: photoPath,
      lat: hasGps ? Number(lat) : null,
      lng: hasGps ? Number(lng) : null,
      accuracy: accuracy && !isNaN(Number(accuracy)) ? Number(accuracy) : null,
      capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
      serverTime: new Date(),
      isManualGpsOverride: manualOverride,
      notes: notes || '',
      photoPurged: false,
    };

    const initialHistory = [
      {
        action: 'check_out',
        actionLabel: 'Peminjaman / Check-out APD',
        timestamp: borrowedAt ? new Date(borrowedAt) : new Date(),
        byUserId: req.user?._id || null,
        byUserName: inspectorName,
        location: resolvedLocation,
        condition: conditionBefore || 'Baik & Layak Pakai',
        notes: notes || '',
        evidence: {
          photo: photoPath,
          lat: hasGps ? Number(lat) : null,
          lng: hasGps ? Number(lng) : null,
          accuracy: accuracy && !isNaN(Number(accuracy)) ? Number(accuracy) : null,
          capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
          isManualGpsOverride: manualOverride,
          photoPurged: false,
        },
      },
    ];

    const newUsage = new PPEUsage({
      workerId: worker._id,
      workerName: worker.fullName,
      workerRole: worker.role || 'worker',
      projectId: projectId || null,
      projectName,
      location: resolvedLocation,
      ppeItems,
      activityType,
      borrowedAt: borrowedAt ? new Date(borrowedAt) : new Date(),
      expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
      status: 'in_use',
      conditionBefore: conditionBefore || 'Baik & Layak Pakai',
      conditionAfter: 'Belum Dikembalikan',
      inspectedBy: req.user?._id || null,
      inspectorName,
      inspectionChecklist: inspectionChecklist || {
        fitCheck: true,
        shellStrapsIntact: true,
        latchLockSecure: true,
        certifiedStandardChecked: true,
      },
      notes: notes || '',
      photo: photoPath,
      evidence: evidenceObj,
      history: initialHistory,
    });

    await newUsage.save();

    // Auto-update inventory stock for matching PPEItems
    try {
      for (const itemKey of ppeItems) {
        await PPEItem.updateMany(
          {
            $or: [
              { templateId: itemKey },
              { code: itemKey },
              ...(mongoose.isValidObjectId(itemKey) ? [{ _id: itemKey }] : []),
            ],
            availableQty: { $gt: 0 },
          },
          {
            $inc: { availableQty: -1, inUseQty: 1 },
          }
        );
      }
    } catch (invErr) {
      console.warn('Could not auto-decrement PPEItem stock:', invErr.message);
    }

    const populated = await PPEUsage.findById(newUsage._id)
      .populate('workerId', 'fullName username role position')
      .populate('projectId', 'nama lokasi status')
      .lean();

    res.status(201).json({
      success: true,
      msg: 'Catatan pemakaian APD berhasil disimpan',
      data: populated,
    });
  } catch (error) {
    if (req.file) deletePhysicalFile(req.file.path);
    console.error('Error creating PPE usage:', error);
    res.status(500).json({ msg: 'Gagal mencatat pemakaian APD', error: error.message });
  }
});

// PUT /api/ppe-usages/:id/return - Mark PPE usage returned with return photo evidence
router.put('/:id/return', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      conditionAfter,
      returnNotes,
      returnedAt,
      lat,
      lng,
      accuracy,
      capturedAt,
      isManualGpsOverride,
    } = req.body;

    const usage = await PPEUsage.findById(id);
    if (!usage) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(404).json({ msg: 'Catatan pemakaian APD tidak ditemukan' });
    }

    const returnPhotoPath = req.file ? req.file.path : null;
    const hasReturnGps = lat !== undefined && lat !== null && lat !== '' && !isNaN(Number(lat)) &&
                         lng !== undefined && lng !== null && lng !== '' && !isNaN(Number(lng));
    const manualOverride = isManualGpsOverride === 'true' || isManualGpsOverride === true;

    // Purge previous return photo if re-uploaded
    if (returnPhotoPath && usage.returnEvidence && usage.returnEvidence.photo) {
      deletePhysicalFile(usage.returnEvidence.photo);
    }

    const returnEvidenceObj = {
      photo: returnPhotoPath || (usage.returnEvidence?.photo || null),
      lat: hasReturnGps ? Number(lat) : (usage.returnEvidence?.lat || null),
      lng: hasReturnGps ? Number(lng) : (usage.returnEvidence?.lng || null),
      accuracy: accuracy && !isNaN(Number(accuracy)) ? Number(accuracy) : (usage.returnEvidence?.accuracy || null),
      capturedAt: capturedAt ? new Date(capturedAt) : (usage.returnEvidence?.capturedAt || new Date()),
      serverTime: new Date(),
      isManualGpsOverride: manualOverride,
      notes: returnNotes || '',
      photoPurged: false,
    };

    usage.status = 'returned';
    usage.returnedAt = returnedAt ? new Date(returnedAt) : new Date();
    usage.conditionAfter = conditionAfter || 'Baik & Bersih';
    if (returnNotes !== undefined) usage.returnNotes = returnNotes;
    usage.returnEvidence = returnEvidenceObj;

    const inspectorName = req.user
      ? `${req.user.fullName || req.user.username} (${req.user.role || 'Staff'})`
      : 'HSE Officer';

    // Append return event to history
    usage.history.push({
      action: 'return',
      actionLabel: 'Pengembalian / Return APD Terverifikasi',
      timestamp: usage.returnedAt,
      byUserId: req.user?._id || null,
      byUserName: inspectorName,
      location: usage.projectName || usage.location || 'Site Proyek',
      condition: usage.conditionAfter,
      notes: usage.returnNotes || '',
      evidence: {
        photo: returnPhotoPath,
        lat: hasReturnGps ? Number(lat) : null,
        lng: hasReturnGps ? Number(lng) : null,
        accuracy: accuracy && !isNaN(Number(accuracy)) ? Number(accuracy) : null,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        isManualGpsOverride: manualOverride,
        photoPurged: false,
      },
    });

    await usage.save();

    // Auto-replenish inventory stock on return
    try {
      const isDamaged = conditionAfter === 'Rusak / Afkir';
      for (const itemKey of usage.ppeItems) {
        await PPEItem.updateMany(
          {
            $or: [
              { templateId: itemKey },
              { code: itemKey },
              ...(mongoose.isValidObjectId(itemKey) ? [{ _id: itemKey }] : []),
            ],
          },
          {
            $inc: {
              inUseQty: -1,
              availableQty: isDamaged ? 0 : 1,
              damagedQty: isDamaged ? 1 : 0,
            },
          }
        );
      }
    } catch (invErr) {
      console.warn('Could not auto-replenish PPEItem stock:', invErr.message);
    }

    const updated = await PPEUsage.findById(id)
      .populate('workerId', 'fullName username role position')
      .populate('projectId', 'nama lokasi status')
      .lean();

    res.json({
      success: true,
      msg: 'Pengembalian APD berhasil diverifikasi',
      data: updated,
    });
  } catch (error) {
    if (req.file) deletePhysicalFile(req.file.path);
    console.error('Error returning PPE usage:', error);
    res.status(500).json({ msg: 'Gagal memperbarui status pengembalian', error: error.message });
  }
});

// GET /api/ppe-usages/:id/history - Get chronological audit trail & photo evidence
router.get('/:id/history', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const usage = await PPEUsage.findById(id)
      .select('workerName workerRole ppeItems projectName location status conditionBefore conditionAfter borrowedAt returnedAt inspectorName history evidence returnEvidence createdAt')
      .populate('history.byUserId', 'fullName username role position')
      .lean();

    if (!usage) {
      return res.status(404).json({ msg: 'Catatan pemakaian APD tidak ditemukan' });
    }

    res.json({
      success: true,
      data: {
        usageId: usage._id,
        workerName: usage.workerName,
        workerRole: usage.workerRole,
        ppeItems: usage.ppeItems,
        projectName: usage.projectName,
        location: usage.location,
        status: usage.status,
        conditionBefore: usage.conditionBefore,
        conditionAfter: usage.conditionAfter,
        borrowedAt: usage.borrowedAt,
        returnedAt: usage.returnedAt,
        inspectorName: usage.inspectorName,
        history: usage.history || [],
        evidence: usage.evidence,
        returnEvidence: usage.returnEvidence,
      },
    });
  } catch (error) {
    console.error('Error fetching PPE usage history:', error);
    res.status(500).json({ msg: 'Gagal mengambil riwayat audit APD', error: error.message });
  }
});

// DELETE /api/ppe-usages/:id - Delete a PPE usage log and clean up physical photos
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const usage = await PPEUsage.findById(id);
    if (!usage) {
      return res.status(404).json({ msg: 'Catatan pemakaian APD tidak ditemukan' });
    }

    // Clean up physical photo files
    if (usage.photo) deletePhysicalFile(usage.photo);
    if (usage.evidence?.photo) deletePhysicalFile(usage.evidence.photo);
    if (usage.returnEvidence?.photo) deletePhysicalFile(usage.returnEvidence.photo);
    if (Array.isArray(usage.history)) {
      for (const h of usage.history) {
        if (h.evidence?.photo) deletePhysicalFile(h.evidence.photo);
      }
    }

    await PPEUsage.findByIdAndDelete(id);
    res.json({ success: true, msg: 'Catatan pemakaian APD berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting PPE usage:', error);
    res.status(500).json({ msg: 'Gagal menghapus catatan pemakaian APD', error: error.message });
  }
});

module.exports = router;
