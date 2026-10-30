/**
 * MTERP ERP - Standar Regulasi K3 & Repositori SOP APD
 * Berdasarkan Regulasi Nasional Republik Indonesia & Standar Keselamatan Internasional:
 *
 * Regulasi Nasional Indonesia:
 * 1. Undang-Undang No. 1 Tahun 1970 tentang Keselamatan Kerja (Pasal 3, 9, 12, 14)
 * 2. Peraturan Menteri Tenaga Kerja dan Transmigrasi RI No. PER.08/MEN/VII/2010 tentang Alat Pelindung Diri (APD)
 * 3. Peraturan Pemerintah No. 50 Tahun 2012 tentang Penerapan Sistem Manajemen K3 (SMK3)
 * 4. Standar Nasional Indonesia (SNI) terkait spesifikasi teknis APD
 *
 * Regulasi & Standar Internasional:
 * 1. Occupational Safety and Health Administration (OSHA) 29 CFR 1910 (General Industry) & 1926 (Construction)
 * 2. American National Standards Institute / International Safety Equipment Association (ANSI / ISEA)
 * 3. European Committee for Standardization (EN) / International Organization for Standardization (ISO)
 */

const PPE_REGULATION_REPOSITORY = [
  {
    templateId: 'safety_helmet',
    name: 'Safety Helmets (Helm Keselamatan Konstruksi)',
    category: 'head_protection',
    categoryLabel: 'Pelindung Kepala (Head Protection)',
    colorCode: 'Putih (Manajer/Tamu/Inspektur), Kuning (Pekerja Sipil/Helper), Biru (Mekanikal/Elektrikal), Merah (HSE/Safety Officer)',
    mandatoryZones: 'Wajib 100% di seluruh portal proyek, zona elevasi, area lintasan alat berat, dan galian',
    expiryYears: 5,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2, 4, 5; UU No. 1/1970 Pasal 14(c); SNI ISO 3873:2012 (Helm Keselamatan Industri); SNI 1811:2007',
      international: 'ANSI/ISEA Z89.1-2014 Type 1 Class E (Tegangan Listrik s.d. 20.000V) & Class G; OSHA 29 CFR 1926.100; EN 397:2012+A1:2012',
      riskLevel: 'Kritis',
    },
    guide: {
      description:
        'Melindungi tempurung kepala dari benturan material jatuh, benturan objek statis, percikan bahan kimia berbahaya, dan induksi tegangan listrik.',
      preUseInspection: [
        'Periksa cangkang helm (outer shell): pastikan tidak terdapat retak rambut, lekukan, atau perubahan warna getas akibat paparan radiasi UV.',
        'Periksa suspensi dalam (inner harness): pastikan pita webbing tidak sobek, tidak berserabut, dan terkunci erat di 4 atau 6 titik penahan.',
        'Periksa tali dagu elastis (chin strap) dan buckle pengunci: pastikan bunyi klik terdengar mantap dan tidak mudah lepas saat ditarik.',
        'Periksa cap stempel tanggal produksi manufaktur: pastikan helm belum melampaui batas kadaluarsa 3–5 tahun.',
      ],
      wearingSteps: [
        'Atur ratchet putar suspensi di bagian tengkuk kepala agar presisi dengan ukuran lingkar kepala.',
        'Posisikan helm secara horizontal rata dan seimbang, tidak condong ke belakang atau menunduk ke depan.',
        'Pasang dan kencangkan tali dagu tepat di bawah dagu dengan kelonggaran maksimal 1–2 jari tangan.',
        'Lakukan uji geleng kepala: helm harus stabil di tempat dan tidak bergoyang sebelum tali dagu dikunci.',
      ],
      maintenance: [
        'Bersihkan permukaan cangkang dan suspensi hanya menggunakan sabun netral dan air hangat. Dilarang memakai pelarut hidrokarbon / tiner.',
        'Simpan di lemari APD berventilasi baik, terhindar dari paparan sinar matahari langsung saat tidak digunakan.',
        'Dilarang keras mengecat, melubangi, atau menempelkan stiker berbahan perekat keras yang dapat menutupi kerusakan struktural.',
      ],
      dosAndDonts: {
        dos: [
          'Wajib selalu dikenakan saat berada di dalam perimeter portal proyek (site gate).',
          'Segera ganti helm baru jika pernah mengalami benturan berat, meskipun tidak tampak retak dari luar.',
        ],
        donts: [
          'Dilarang mengenakan helm secara terbalik kecuali tipe reversible yang disetujui manufaktur.',
          'Dilarang meletakkan benda padat, handuk tebal, atau sarung tangan di dalam celah suspensi helm.',
        ],
      },
    },
  },
  {
    templateId: 'safety_boots',
    name: 'Safety Boots (Sepatu Pelindung Keselamatan)',
    category: 'foot_leg_protection',
    categoryLabel: 'Pelindung Kaki (Foot & Leg Protection)',
    colorCode: 'Hitam / Coklat Kulit Heavy Duty Industri',
    mandatoryZones: 'Seluruh area proyek aktif, workshop fabrikasi, pengecoran, dan area galian tanah',
    expiryYears: 3,
    unit: 'Pasang',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 3; SNI 7079:2009 (Sepatu Pengaman dari Kulit Berpenguat Baja); SNI 0111:2009',
      international: 'EN ISO 20345:2011 S1P / S3 (Pelindung Jari Baja 200J + Anti-Tusuk 1100N); OSHA 29 CFR 1926.96; ASTM F2413-18',
      riskLevel: 'Kritis',
    },
    guide: {
      description:
        'Melindungi jari kaki, telapak, dan pergelangan dari hantaman beban berat, tusukan paku/kawat beton, tumpahan cairan kimia/oli licin, dan bahaya listrik statis.',
      preUseInspection: [
        'Periksa pelindung jari baja (steel toe cap): pastikan cangkang baja tidak bergeser dan kulit pelapis tidak terkoyak.',
        'Periksa tapak outsole: pastikan kedalaman alur kembangan anti-slip masih tebal dan tidak terkelupas.',
        'Periksa sol tengah baja (steel midsole): pastikan tidak ada paku atau kawat yang menembus pelat baja pelindung telapak.',
        'Periksa jahitan dan tali sepatu: pastikan tidak lapuk, putus, atau aus terkena semen/lumpur.',
      ],
      wearingSteps: [
        'Kenakan kaus kaki katun tebal kering untuk menyerap keringat dan mencegah gesekan lecet pada tumit.',
        'Masukkan kaki hingga tumit menempel rapat pada mangkuk tumit (heel counter).',
        'Kencangkan tali sepatu secara simetris dari lubang terbawah hingga ke pergelangan kaki.',
        'Pastikan ujung celana kerja panjang menutupi bagian leher (collar) sepatu untuk mencegah kerikil atau percikan terak masuk.',
      ],
      maintenance: [
        'Bersihkan kotoran lumpur, adukan semen, atau oli segera setelah shift kerja selesai dengan sikat basah berbulu halus.',
        'Keringkan secara alami di ruangan dengan sirkulasi udara baik; dilarang menjemur langsung di bawah terik api.',
        'Oleskan semir atau kondisioner kulit sepekan sekali untuk mencegah kulit sepatu menjadi kaku dan pecah-pecah.',
      ],
      dosAndDonts: {
        dos: [
          'Pilih ukuran sepatu dengan kelonggaran sekitar 0.5 cm pada ujung jari kaki untuk pergerakan bebas.',
          'Ganti sepatu segera jika baja toe cap pernah penyok tertimpa material berat.',
        ],
        donts: [
          'Dilarang menginjak bagian tumit belakang (mengenakan sepatu seperti sandal selop).',
          'Dilarang memakai sepatu pengaman yang alur solnya sudah licin/halus di zona becek atau terjal.',
        ],
      },
    },
  },
  {
    templateId: 'full_body_harness',
    name: 'Full Body Harness (Sabuk Pengaman Tubuh Penuh)',
    category: 'fall_protection',
    categoryLabel: 'Perlindungan Bahaya Jatuh Ketinggian (Fall Protection)',
    colorCode: 'Hi-Vis Neon Yellow / Fluorescent Orange dengan Dorsal D-Ring Baja',
    mandatoryZones: 'Wajib pada seluruh pekerjaan di ketinggian elevasi >= 1.8 meter, scaffolding, rafter, dan tepi jurang',
    expiryYears: 5,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010; Permenaker No. 9 Tahun 2016 tentang K3 Pekerjaan Pada Ketinggian; SNI 0428:1989',
      international: 'ANSI/ASSP Z359.11-2021 (Safety Requirements for Full Body Harnesses); OSHA 29 CFR 1926.502; EN 361:2002 (Kekuatan Beban Min 15 kN)',
      riskLevel: 'Sangat Kritis',
    },
    guide: {
      description:
        'Menahan dan mendistribusikan gaya kejut penahanan jatuh ke area paha, panggul, dada, dan bahu secara merata guna mencegah cedera tulang belakang fatal.',
      preUseInspection: [
        'Pegang cincin D-Ring punggung (dorsal D-ring) dan kibaskan perlahan agar anyaman webbing jatuh alami.',
        'Periksa seluruh serat webbing secara teliti: cari benang putus, bekas terbakar gerinda/las, sayatan, atau paparan bahan kimia asam.',
        'Periksa komponen logam D-Ring dan buckle: pastikan tidak ada korosi, bengkok, retakan mikro, atau bagian tepi tajam.',
        'Periksa jahitan indikator hentakan jatuh (fall impact indicator): JIKA JAHITAN INDIKATOR TERBUKA/JEBOL, HARNESS AFKIR DAN WAJIB DIHANCURKAN.',
      ],
      wearingSteps: [
        'Masukkan lengan ke dalam tali pundak layaknya mengenakan rompi kerja.',
        'Tarik tali paha (leg straps) melalui celah selangkangan dan kunci buckle ke masing-masing sisi paha. Pastikan tali tidak terpuntir.',
        'Hubungkan buckle tali dada (chest strap) dan posisikan tepat di tengah tulang dada (sekitar 15 cm di bawah kerah baju).',
        'Lakukan uji kekencangan (finger test): telapak tangan datar harus bisa masuk di antara webbing dan paha, namun kepalan tangan tidak bisa lewat.',
        'Pastikan dorsal D-ring terletak tepat di antara kedua tulang belikat (tengah punggung atas).',
      ],
      maintenance: [
        'Cuci webbing menggunakan air bersih bersuhu kamar dan deterjen netral ringan jika terkena keringat berlebih atau lumpur.',
        'Gantung mengering di tempat teduh dan berventilasi. Dilarang mengeringkan dengan alat pemanas buatan.',
        'Simpan di lemari gantung K3 khusus yang kering, terhindar dari tikus, zat kimia asam, dan paparan sinar UV matahari langsung.',
      ],
      dosAndDonts: {
        dos: [
          'Wajib selalu dihubungkan ke tali penahan guncangan (shock-absorbing lanyard) berkait ganda (twin lanyard) atau fall arrester otomatis.',
          'Wajib ditambatkan ke titik angkur (anchor point) yang telah disertifikasi mampu menahan beban minimal 15–22.2 kN (5.000 lbs).',
        ],
        donts: [
          'Dilarang menggunakan sabuk pinggang biasa (body belt) untuk penahan jatuh bebas (fall arrest).',
          'Dilarang memotong, membakar, melubangi, atau memodifikasi webbing harness untuk keperluan apapun.',
        ],
      },
    },
  },
  {
    templateId: 'fall_arrester',
    name: 'Fall Arrester (Penahan Jatuh Otomatis / Self-Retracting Lifeline)',
    category: 'fall_protection',
    categoryLabel: 'Perlindungan Bahaya Jatuh Ketinggian (Fall Protection)',
    colorCode: 'Rumah Pelindung Aluminium Merah / Baja Galvanis Heavy Duty',
    mandatoryZones: 'Pekerjaan struktur baja jembatan, tower crane, dinding spillway bendungan, dan confined space vertikal',
    expiryYears: 5,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenaker No. 9 Tahun 2016 Bab III K3 Ketinggian; Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 5',
      international: 'ANSI/ASSP Z359.14-2021 Class 1 & Class 2 (Self-Retracting Devices); OSHA 29 CFR 1926.502(d); EN 360:2002; CE 0194',
      riskLevel: 'Sangat Kritis',
    },
    guide: {
      description:
        'Perangkat mekanik penarik kawat sling otomatis dengan mekanisme rem inersia sentrifugal yang mengunci secara instan (<0.6m) saat mendeteksi percepatan jatuh bebas.',
      preUseInspection: [
        'Tarik kawat sling baja galvanis sepanjang 1 meter lalu lepaskan: sling harus kembali menggulung mulus ke dalam drum tanpa macet.',
        'Lakukan uji sentak rem (sharp pull test): sentak kabel sling dengan cepat ke arah bawah. Mekanisme rem internal harus mengunci klik seketika.',
        'Periksa kawat sling baja: pastikan tidak ada kawat terurai (bird-caging), tertekuk patah (kinking), pipih, atau berkarat.',
        'Periksa snap hook putar (swivel hook) dan indikator beban (load indicator): pastikan gerbang pengunci otomatis menutup sempurna.',
      ],
      wearingSteps: [
        'Kaitkan carabiner karoseri fall arrester ke titik angkur bersertifikasi resmi di atas kepala (overhead anchor point).',
        'Tarik snap hook ujung kawat sling secara perlahan dan kaitkan ke cincin D-Ring punggung (dorsal) pada full body harness pekerja.',
        'Pastikan pengunci snap hook berputar otomatis (auto-locking) dan terkunci rapat.',
        'Jaga sudut deviasi kerja vertikal maksimal 15 derajat dari titik angkur untuk mencegah risiko efek ayunan mematikan (pendulum swing fall).',
      ],
      maintenance: [
        'Bersihkan kabel kawat sling dari debu semen atau kotoran menggunakan kain lap yang dibasahi sedikit pelumas anti-karat ringan.',
        'Lakukan servis kalibrasi berkala tahunan oleh teknisi bersertifikasi pabrikan resmi atau badan inspeksi K3.',
        'Simpan tergantung tegak di ruangan kering dan bersih.',
      ],
      dosAndDonts: {
        dos: [
          'Wajib membiarkan kawat sling menggulung masuk secara terkontrol menggunakan tali pemandu (tag line); dilarang melepas kawat sling hingga tersentak kencang ke drum.',
          'Wajib menghitung jarak jatuh bebas bersih (clear fall distance) di bawah lantai kerja sebelum memulai aktivitas.',
        ],
        donts: [
          'Dilarang menambatkan fall arrester di bawah level kaki kecuali tipe khusus yang bersertifikasi ANSI Class 2 (Leading Edge).',
          'Dilarang menyambung atau mengikat kawat sling baja dengan simpul tali biasa.',
        ],
      },
    },
  },
  {
    templateId: 'safety_web',
    name: 'Safety Webs / Safety Nets (Jaring Pengaman Konstruksi)',
    category: 'fall_protection',
    categoryLabel: 'Perlindungan Bahaya Jatuh Ketinggian (Fall Protection)',
    colorCode: 'Hijau Daun / Biru Terang (Polipropilena / Nilon Tahan UV Berkekuatan Tinggi)',
    mandatoryZones: 'Di bawah lantai bekisting cor bertingkat, struktur jembatan, perancah terbuka, dan tepi void bangunan',
    expiryYears: 3,
    unit: 'Set',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 5; Kepmenaker No. KEP.187/MEN/1999',
      international: 'OSHA 29 CFR 1926.105 (Safety Nets); ANSI/ASSP A10.11-2019; EN 1263-1 (System S / T Netting); ISO 1806',
      riskLevel: 'Tinggi',
    },
    guide: {
      description:
        'Sistem penahan jatuh pasif kolektif yang berfungsi menangkap personel pekerja atau puing material jatuh dari lantai atas agar tidak menghantam tanah atau lantai dasar.',
      preUseInspection: [
        'Periksa seluruh anyaman mesh jaring: pastikan tidak ada mata jaring yang putus, terurai, atau sobek.',
        'Periksa tali tepi perbatasan (border rope): pastikan tambatan tali pengikat utama tidak lapuk atau terputus.',
        'Periksa label sertifikasi uji beban dinamis pabrik pembuat serta tanggal kadaluarsa serat polimer.',
        'Periksa celah lendutan tengah: pastikan tidak ada tumpukan puing beton atau serpihan kayu yang tersangkut dari shift sebelumnya.',
      ],
      wearingSteps: [
        'Pasang braket dan pipa penopang baja penegang jaring pada struktur kolom atau balok bangunan.',
        'Bentangkan jaring pengaman tepat di bawah elevasi kerja aktif (maksimal 3 meter di bawah lantai kerja sesuai OSHA 1926.105).',
        'Ikat tali tepi jaring ke struktur penopang dengan simpul pengaman setiap interval jarak maksimal 1 meter.',
        'Pastikan jarak bebas lendutan jaring (sag clearance) mencukupi sehingga jaring tidak menyentuh lantai/rintangan di bawah saat menahan beban jatuh.',
      ],
      maintenance: [
        'Bersihkan sampah puing dan potongan material tajam dari atas jaring setiap pergantian shift harian.',
        'Uji kekuatan serat secara visual setiap minggu dan lakukan uji drop-test berkala sesuai standar OSHA.',
        'Segera ganti segmen jaring jika pernah mengalami beban jatuh orang atau beban tumbukan berat.',
      ],
      dosAndDonts: {
        dos: [
          'Wajib memasang jaring dengan bentangan menjorok keluar minimal 2.5–4 meter dari tepi terluar bangunan.',
          'Wajib memadukan dengan jaring kasa puing halus (debris mesh 1 mm) jika di bawah jaring terdapat lalu lintas pekerja.',
        ],
        donts: [
          'Dilarang menggunakan jaring yang terkena percikan api las langsung hingga serat nilon meleleh atau hangus.',
          'Dilarang memanfaatkan jaring pengaman sebagai tempat penyimpanan material atau gantungan alat kerja.',
        ],
      },
    },
  },
  {
    templateId: 'welding_helmet',
    name: 'Welding Protection Helmet (Kedok & Helm Pelindung Pengelasan K3)',
    category: 'eye_face_protection',
    categoryLabel: 'Pelindung Mata & Muka (Eye & Face Protection)',
    colorCode: 'Hitam Doff / Shell Termoplastik Tahan Percikan Api & Panas Radiasi',
    mandatoryZones: 'Workshop fabrikasi baja, pemotongan oxy-acetylene/plasma, dan area pengelasan SMAW/GMAW/GTAW',
    expiryYears: 5,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 5; SNI 08-6111-1999 (Kacamata dan Kedok Las)',
      international: 'ANSI/ISEA Z87.1-2020 (Eye and Face Protection); OSHA 29 CFR 1926.102; EN 175:1997; EN 379:2009 (Auto-Darkening Filter / ADF Shade DIN 9-13)',
      riskLevel: 'Tinggi',
    },
    guide: {
      description:
        'Melindungi mata, kornea, dan kulit wajah dari bahaya kebutaan sementara/permanen akibat radiasi sinar ultra-violet (UV), infra-merah (IR), percikan bunga api las (spatter), dan asap logam beracun.',
      preUseInspection: [
        'Periksa filter lensa penggelap otomatis (Auto-Darkening Filter / ADF): pastikan sensor optik bersih dari debu dan baterai/solar cell berfungsi.',
        'Lakukan uji aktivasi sensor ADF menggunakan pemantik api: kaca harus menggelap seketika (<0.1 milidetik).',
        'Periksa kaca mika pelindung luar (cover lens): pastikan bening, tidak buram, dan tidak penuh percikan terak yang menghalangi pandangan.',
        'Periksa penahan kepala (headgear headband): pastikan kenop pengencang samping berfungsi menahan helm pada posisi terangkat dan tertutup.',
      ],
      wearingSteps: [
        'Atur kenop tingkat kegelapan lensa (shade control) sesuai jenis pengelasan (SMAW/MIG: Shade DIN 10–12; TIG: Shade DIN 11–13).',
        'Posisikan suspensi di kepala dan kencangkan kenop belakang hingga pas dan tidak melorot.',
        'Atur jarak antara mata dan kaca filter (sekitar 2–3 cm) serta sudut kemiringan helm.',
        'Tutup kedok las menutupi seluruh dagu dan leher sebelum menyalakan busur api las (striking the arc).',
      ],
      maintenance: [
        'Bersihkan lensa optik dan sensor hanya menggunakan kain mikrofiber kering dan cairan pembersih optik khusus.',
        'Ganti kaca mika pelindung luar transparan secara berkala apabila sudah buram terkena spatter.',
        'Simpan di dalam tas pembungkus atau loker K3 agar tidak tertimpa benda tajam atau tergores.',
      ],
      dosAndDonts: {
        dos: [
          'Wajib memakai kacamata safety bening (safety spectacles ANSI Z87+) di dalam kedok las untuk proteksi saat mengetok terak (chipping slag).',
          'Pastikan ventilasi udara sekitar cukup atau gunakan respirator las partikulat N95/FFP2 untuk menyaring asap seng/logam berat.',
        ],
        donts: [
          'Dilarang melakukan pengelasan dengan lensa yang retak atau tingkat kegelapan (shade) terlalu terang di bawah rekomendasi.',
          'Dilarang mencelupkan kedok las ke dalam air dingin saat kondisi helm masih panas.',
        ],
      },
    },
  },
  {
    templateId: 'leather_gloves',
    name: 'Leather Gloves (Sarung Tangan Kulit Pelindung Mekanik & Termal)',
    category: 'hand_arm_protection',
    categoryLabel: 'Pelindung Tangan & Lengan (Hand & Arm Protection)',
    colorCode: 'Kuning Suede Kulit Sapi Split Tebal / Manset Panjang Gauntlet Cuff',
    mandatoryZones: 'Pekerjaan pengelasan, pemotongan plat besi, penanganan kawat bronjong, dan perakitan besi beton',
    expiryYears: 2,
    unit: 'Pasang',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 5; SNI 06-0652-2005 (Sarung Tangan Kerja Kulit)',
      international: 'EN 388:2016 (Bahaya Mekanik 413X); EN 407:2020 (Panas & Nyala Api 413X4X); OSHA 29 CFR 1910.138; ANSI/ISEA 105-2016 Level A3',
      riskLevel: 'Tinggi',
    },
    guide: {
      description:
        'Melindungi kulit telapak tangan, jari, dan pergelangan dari luka sayat tajam besi rebar, bahaya abrasi kasar, panas konduksi busur las, dan luka bakar percikan logam cair.',
      preUseInspection: [
        'Periksa jahitan benang kevlar: pastikan tidak ada benang putus atau jahitan yang terbuka pada sela-sela pangkal jari.',
        'Periksa permukaan kulit: pastikan tidak ada lubang terbakar, robekan, atau bagian kulit yang mengeras kaku karena panas berlebih.',
        'Pastikan bagian dalam sarung tangan kering, bersih, dan bebas dari butiran gram besi atau paku kecil.',
        'Periksa panjang manset (gauntlet cuff): pastikan panjang minimal 10–15 cm untuk menutup pergelangan tangan secara aman.',
      ],
      wearingSteps: [
        'Pilih ukuran sarung tangan yang pas agar tidak mengorbankan fleksibilitas genggaman alat kerja.',
        'Masukkan tangan secara mantap hingga ujung jari menyentuh dasar sarung tangan.',
        'Tarik manset panjang menutupi ujung lengan baju kerja panjang guna mencegah terak panas masuk ke dalam pakaian.',
        'Pastikan tangan dalam kondisi kering sebelum mengenakan sarung tangan kulit.',
      ],
      maintenance: [
        'Kibaskan sisa debu atau serpihan logam segera setelah selesai bekerja.',
        'Jemur di area teduh berangin bila basah oleh keringat; hindari paparan sinar matahari terik langsung yang membuat kulit rapuh.',
        'Segera ganti sarung tangan jika kulit telapak sudah tipis atau berlubang.',
      ],
      dosAndDonts: {
        dos: [
          'Gunakan kulit sapi tebal (split cowhide) untuk las busur SMAW dan kulit kambing lentur (goat skin) untuk las presisi TIG.',
          'Ganti sarung tangan jika sudah terkontaminasi tumpahan bahan bakar atau oli mudah terbakar.',
        ],
        donts: [
          'Dilarang menggunakan sarung tangan kulit longgar saat mengoperasikan mesin bubut, bor duduk berputar, atau gerinda tangan (risiko terjepit dan terlilit fatal).',
          'Dilarang mencuci sarung tangan kulit menggunakan deterjen keras atau mesin cuci.',
        ],
      },
    },
  },
  {
    templateId: 'safety_glasses',
    name: 'Safety Glasses / Goggles (Kacamata & Goggle Pengaman)',
    category: 'eye_face_protection',
    categoryLabel: 'Pelindung Mata & Muka (Eye & Face Protection)',
    colorCode: 'Lensa Polikarbonat Transparan Anti-Gores & Anti-Kabut (Anti-Fog)',
    mandatoryZones: 'Pekerjaan gerinda, pembobokan beton (chipping), pemotongan keramik, dan penanganan cairan kimia',
    expiryYears: 3,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010 Pasal 2 & 5; SNI 16-7062-2004 (Pengukuran Intensitas Pencahayaan)',
      international: 'ANSI/ISEA Z87.1-2020 (Impact Rated Z87+); OSHA 29 CFR 1926.102; EN 166:2001 (Optical Class 1, Grade B Impact)',
      riskLevel: 'Tinggi',
    },
    guide: {
      description:
        'Melindungi mata dari partikel terbang berkecepatan tinggi, percikan serbuk besi gerinda, debu semen, dan cipratan zat kimia korosif.',
      preUseInspection: [
        'Periksa lensa polikarbonat: pastikan tidak ada goresan dalam atau retakan yang mengurangi kejernihan pandangan.',
        'Periksa pelindung samping (side shields): pastikan terpasang kokoh melindungi area pelipis.',
        'Periksa elastisitas tali strap goggle atau engsel tangkai kacamata.',
      ],
      wearingSteps: [
        'Pasang kacamata hingga menutupi seluruh rongga mata dengan bantalan hidung terpasang nyaman.',
        'Untuk goggle cairan kimia: pastikan segel silikon menempel rapat kedap pada kontur wajah.',
        'Sesuaikan panjang tali strap belakang agar tidak mudah bergeser saat menunduk.',
      ],
      maintenance: [
        'Bersihkan lensa menggunakan air mengalir dan lap mikrofiber bersih. Hindari mengusap lensa kering dengan baju kotor yang mengandung debu pasir.',
        'Simpan di kantong kain atau wadah pelindung khusus saat tidak dipakai.',
      ],
      dosAndDonts: {
        dos: [
          'Pilih tipe anti-fog goggle untuk lingkungan kerja panas, lembap, atau berkeringat tinggi.',
          'Ganti lensa segera jika telah terpapar benturan proyektil keras.',
        ],
        donts: [
          'Dilarang menggunakan kacamata minus baca harian biasa sebagai pengganti safety glasses tanpa sertifikasi Z87+.',
          'Dilarang meletakkan kacamata dengan posisi lensa menghadap ke bawah meja kerja.',
        ],
      },
    },
  },
  {
    templateId: 'respiratory_protection',
    name: 'Respiratory Mask / Half-Mask (Masker & Respirator Partikulat K3)',
    category: 'respiratory_protection',
    categoryLabel: 'Pelindung Pernapasan (Respiratory Protection)',
    colorCode: 'Silikon Abu-abu / Filter Cartridge Ganda N95 / P100 / FFP3',
    mandatoryZones: 'Area batching plant beton, pencampuran mortar, sand-blasting, pengecatan semprot, dan debu silika',
    expiryYears: 5,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010; Permenaker No. 5 Tahun 2018 tentang K3 Lingkungan Kerja (Nilai Ambang Batas Kimia & Debu)',
      international: 'NIOSH 42 CFR Part 84 (N95 / N99 / P100); OSHA 29 CFR 1910.134 (Respiratory Protection Program); EN 140 / EN 14387 / EN 149',
      riskLevel: 'Tinggi',
    },
    guide: {
      description:
        'Melindungi saluran pernapasan dan paru-paru dari inhalasi debu silika kristalin berbahaya, uap zat pelarut organik (VOC), gas beracun, dan asap las.',
      preUseInspection: [
        'Periksa katup hisap (inhalation valve) dan katup buang (exhalation valve): pastikan elastis, tidak sobek, dan tidak terganjal kotoran.',
        'Periksa body silikon respirator: pastikan lentur dan tidak mengalami keretakan getas.',
        'Periksa masa pakai cartridge filter: pastikan segel cartridge belum kadaluarsa dan tidak jenuh/sesak saat dihisap.',
      ],
      wearingSteps: [
        'Posisikan respirator menutupi mulut dan pangkal hidung.',
        'Tarik tali strap atas melewati ubun-ubun dan kaitkan tali strap bawah di belakang leher.',
        'Lakukan uji kerapatan positif (positive user seal check): tutup katup buang dengan telapak tangan dan hembuskan napas perlahan. Respirator harus sedikit menggelembung tanpa bocor.',
        'Lakukan uji kerapatan negatif (negative user seal check): tutup cartridge filter dan tarik napas dalam. Respirator harus sedikit mengempis menempel rapat.',
      ],
      maintenance: [
        'Lepas filter cartridge sebelum mencuci body silikon respirator dengan air sabun hangat.',
        'Keringkan di tempat bersih terbebas dari uap kontaminan kimia.',
        'Simpan di dalam kantong plastik klip ziplock kedap udara saat tidak digunakan.',
      ],
      dosAndDonts: {
        dos: [
          'Ganti filter partikulat segera jika tarikan napas terasa mulai berat atau sesak.',
          'Ganti filter uap kimia jika mulai tercium bau zat pelarut saat memakai masker.',
        ],
        donts: [
          'Dilarang menggunakan masker jika memiliki jenggot tebal yang menghalangi segel silikon ke kulit wajah (bearded seal failure).',
          'Dilarang mencuci filter cartridge berbahan karbon aktif dengan air.',
        ],
      },
    },
  },
  {
    templateId: 'hearing_protection',
    name: 'Ear Muffs & Ear Plugs (Pelindung Pendengaran K3)',
    category: 'hearing_protection',
    categoryLabel: 'Pelindung Pendengaran (Hearing Protection)',
    colorCode: 'Hi-Vis Kuning / Oranye (Peredaman Kebisingan NRR 25-33 dB)',
    mandatoryZones: 'Area pemancangan tiang pile hammer, mesin genset daya tinggi, kompresor angin, dan jackhammer',
    expiryYears: 3,
    unit: 'Unit',
    standardRegulation: {
      indonesian: 'Permenaker No. 5 Tahun 2018 (NAB Kebisingan 85 dBA untuk 8 jam kerja per hari); Permenakertrans No. PER.08/MEN/VII/2010',
      international: 'ANSI/ASA S3.19-1974 (Noise Reduction Rating - NRR); OSHA 29 CFR 1910.95; EN 352-1 (Ear Muffs); EN 352-2 (Ear Plugs)',
      riskLevel: 'Sedang',
    },
    guide: {
      description:
        'Meredam intensitas kebisingan suara di atas Nilai Ambang Batas (NAB >85 dBA) untuk mencegah risiko tuli permanen akibat kebisingan industri (Noise Induced Hearing Loss / NIHL).',
      preUseInspection: [
        'Periksa bantalan telinga ear muff (ear cushions): pastikan kenyal, tidak pecah-pecah, dan busa peredam tidak kempis.',
        'Periksa bando baja penegang (headband): pastikan daya cengkeram pegas masih kuat menekan bantalan ke kepala.',
        'Untuk ear plug busa: pastikan busa higienis bersih dan mampu kembali mengembang perlahan (slow recovery foam).',
      ],
      wearingSteps: [
        'Untuk ear plug: gulung busa silinder hingga pipih dengan jari bersih, tarik daun telinga ke atas dan ke belakang, lalu masukkan ke liang telinga hingga mengembang kedap.',
        'Untuk ear muff: posisikan mangkuk peredam menutupi seluruh daun telinga secara simetris.',
        'Pastikan tidak ada rambut tebal atau gagang kacamata tebal yang membuat celah kebocoran suara pada bantalan muff.',
      ],
      maintenance: [
        'Lap bantalan telinga ear muff menggunakan tisu antiseptik non-alkohol sehabis dipakai.',
        'Ganti busa ear plug sekali pakai setiap hari demi menjaga kebersihan liang telinga dari infeksi bakteri.',
        'Simpan ear muff di tempat bersih dan kering.',
      ],
      dosAndDonts: {
        dos: [
          'Gunakan proteksi ganda (dual protection: ear plug + ear muff) bila tingkat kebisingan lingkungan melebihi 100 dBA (contoh: pemancangan pile).',
          'Pastikan tangan bersih higienis saat memilin ear plug busa.',
        ],
        donts: [
          'Dilarang menggunakan earphone pemutar musik sebagai pengganti pelindung pendengaran K3 resmi.',
          'Dilarang mencuci ear muff dengan merendam seluruh mangkuk ke dalam air.',
        ],
      },
    },
  },
];

module.exports = {
  PPE_REGULATION_REPOSITORY,
};

