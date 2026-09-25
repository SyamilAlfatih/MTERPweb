const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Helper to safely delete file from disk
const deleteLocalFile = (fileUrl) => {
  if (!fileUrl) return;
  try {
    const cleanPath = fileUrl.replace(/\\/g, '/');
    const uploadIndex = cleanPath.indexOf('uploads/');
    if (uploadIndex !== -1) {
      const relativePath = cleanPath.substring(uploadIndex);
      const fullPath = path.join(__dirname, '../../', relativePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.error('Error deleting local file:', err.message);
  }
};

// All routes in this file require auth and owner role
router.use(auth);
router.use(authorize('owner'));

// Allowed roles enum
const VALID_ROLES = [
  'worker', 'tukang', 'helper',
  'supervisor', 'site_manager', 'foreman',
  'device_admin', 'asset_admin', 'admin_project',
  'director', 'president_director', 'operational_director',
  'owner'
];

// Allowed employment types enum
const VALID_EMPLOYMENT_TYPES = ['tetap', 'kontrak', 'harian_lepas', 'magang'];

// Column definitions for export
const EXPORT_COLUMNS = {
  no: { header: 'No', width: 6, get: (u, idx) => idx + 1 },
  fullName: { header: 'Full Name', width: 25, get: (u) => u.fullName || '' },
  username: { header: 'Username', width: 18, get: (u) => u.username || '' },
  email: { header: 'Email', width: 25, get: (u) => u.email || '' },
  role: { header: 'Role', width: 18, get: (u) => u.role || 'worker' },
  position: { header: 'Position', width: 18, get: (u) => u.position || '' },
  employmentType: { header: 'Employment Type', width: 18, get: (u) => u.employmentType || 'tetap' },
  contractStartDate: {
    header: 'Contract Start',
    width: 15,
    get: (u) => u.contractStartDate ? new Date(u.contractStartDate).toISOString().split('T')[0] : ''
  },
  contractEndDate: {
    header: 'Contract End',
    width: 15,
    get: (u) => u.contractEndDate ? new Date(u.contractEndDate).toISOString().split('T')[0] : ''
  },
  phone: { header: 'Phone', width: 16, get: (u) => u.phone || '' },
  address: { header: 'Address', width: 30, get: (u) => u.address || '' },
  bpjsTk: { header: 'BPJS Ketenagakerjaan (TK)', width: 24, get: (u) => u.bpjsTk || '' },
  bpjsKesehatan: { header: 'BPJS Kesehatan', width: 22, get: (u) => u.bpjsKesehatan || '' },
  latestEducation: {
    header: 'Pendidikan Terakhir',
    width: 25,
    get: (u) => {
      if (!u.education?.level) return '';
      const parts = [u.education.level];
      if (u.education.major) parts.push(u.education.major);
      if (u.education.institution) parts.push(u.education.institution);
      return parts.join(' - ');
    }
  },
  competencies: {
    header: 'Sertifikasi / Kompetensi',
    width: 32,
    get: (u) => (u.competencies || []).map(c => c.name + (c.issuer ? ` (${c.issuer})` : '')).join(', ')
  },
  emergencyContactName: {
    header: 'Kontak Darurat (Name)',
    width: 25,
    get: (u) => u.emergencyContact?.name || ''
  },
  emergencyContactPhone: {
    header: 'Kontak Darurat (Phone)',
    width: 18,
    get: (u) => u.emergencyContact?.phone || ''
  },
  emergencyContactRelationship: {
    header: 'Kontak Darurat (Hubungan)',
    width: 20,
    get: (u) => u.emergencyContact?.relationship || ''
  },
  bankAccount: { header: 'Bank Account', width: 18, get: (u) => u.paymentInfo?.bankAccount || '' },
  bankPlatform: { header: 'Bank Platform', width: 15, get: (u) => u.paymentInfo?.bankPlatform || '' },
  accountName: { header: 'Account Name', width: 22, get: (u) => u.paymentInfo?.accountName || '' },
  isVerified: { header: 'Verified', width: 10, get: (u) => (u.isVerified ? 'Yes' : 'No') },
  createdAt: {
    header: 'Created At',
    width: 15,
    get: (u) => u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : ''
  },
};

// Helper: build filter query for exports and lists
const buildUserFilter = (query) => {
  const { search, role, employmentType } = query;
  const filter = {};

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { fullName: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { position: searchRegex },
      { bpjsTk: searchRegex },
      { bpjsKesehatan: searchRegex },
    ];
  }

  if (role) filter.role = role;
  if (employmentType) filter.employmentType = employmentType;

  return filter;
};

// Helper to normalize strings for flexible header matching
const norm = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

// ==========================================
// EXPORT & IMPORT ENDPOINTS (Placed BEFORE /:id)
// ==========================================

// GET /api/users/export-excel - Export users to .xlsx with configurable columns & header toggle
router.get('/export-excel', async (req, res) => {
  try {
    const filter = buildUserFilter(req.query);
    const users = await User.find(filter).sort({ fullName: 1, createdAt: -1 }).lean();

    // Determine requested columns
    let selectedKeys = req.query.columns ? req.query.columns.split(',').map(c => c.trim()) : Object.keys(EXPORT_COLUMNS);
    selectedKeys = selectedKeys.filter(key => EXPORT_COLUMNS[key]);
    if (selectedKeys.length === 0) selectedKeys = Object.keys(EXPORT_COLUMNS);

    const includeHeaders = req.query.headers !== 'false' && req.query.headers !== '0';

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pekerja');

    if (includeHeaders) {
      sheet.columns = selectedKeys.map(key => ({
        header: EXPORT_COLUMNS[key].header,
        key,
        width: EXPORT_COLUMNS[key].width,
      }));

      // Style header row
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Slate-800
      };
      sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getRow(1).height = 24;

      users.forEach((u, idx) => {
        const rowData = {};
        selectedKeys.forEach(key => {
          rowData[key] = EXPORT_COLUMNS[key].get(u, idx);
        });
        const addedRow = sheet.addRow(rowData);
        addedRow.alignment = { vertical: 'middle' };
      });
    } else {
      // Without headers, set column widths and insert data directly starting at row 1
      selectedKeys.forEach((key, colIdx) => {
        sheet.getColumn(colIdx + 1).width = EXPORT_COLUMNS[key].width;
      });

      users.forEach((u, idx) => {
        const rowValues = selectedKeys.map(key => EXPORT_COLUMNS[key].get(u, idx));
        sheet.addRow(rowValues);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="pekerja-export.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ msg: 'Failed to export Excel' });
  }
});

// GET /api/users/export-csv - Export users to .csv with configurable columns & header toggle
router.get('/export-csv', async (req, res) => {
  try {
    const filter = buildUserFilter(req.query);
    const users = await User.find(filter).sort({ fullName: 1, createdAt: -1 }).lean();

    let selectedKeys = req.query.columns ? req.query.columns.split(',').map(c => c.trim()) : Object.keys(EXPORT_COLUMNS);
    selectedKeys = selectedKeys.filter(key => EXPORT_COLUMNS[key]);
    if (selectedKeys.length === 0) selectedKeys = Object.keys(EXPORT_COLUMNS);

    const includeHeaders = req.query.headers !== 'false' && req.query.headers !== '0';

    const escapeCsv = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [];

    if (includeHeaders) {
      lines.push(selectedKeys.map(k => escapeCsv(EXPORT_COLUMNS[k].header)).join(','));
    }

    users.forEach((u, idx) => {
      lines.push(selectedKeys.map(k => escapeCsv(EXPORT_COLUMNS[k].get(u, idx))).join(','));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n'); // Add UTF-8 BOM for Windows Excel
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pekerja-export.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ msg: 'Failed to export CSV' });
  }
});

// GET /api/users/import-template - Download Excel template for worker import
router.get('/import-template', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Pekerja');

    const headers = [
      'Full Name *',
      'Username *',
      'Email *',
      'Password *',
      'Role',
      'Employment Type',
      'Position',
      'Phone',
      'Address',
      'BPJS Ketenagakerjaan (TK)',
      'BPJS Kesehatan',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Relationship',
    ];

    sheet.addRow(headers);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0284C7' }, // Sky-600
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 26;

    // Sample data rows
    const sampleRows = [
      [
        'Budi Santoso',
        'budi_santoso',
        'budi@mterp.com',
        'P@ssword123',
        'worker',
        'tetap',
        'Tukang Besi',
        '081234567890',
        'Jl. Melati No. 12, Jakarta',
        '00012345678',
        '00098765432',
        'Siti Aminah',
        '081298765432',
        'Istri',
      ],
      [
        'Ahmad Hidayat',
        'ahmad_h',
        'ahmad@mterp.com',
        'P@ssword123',
        'tukang',
        'kontrak',
        'Tukang Kayu',
        '085678901234',
        'Jl. Mawar No. 45, Bandung',
        '00055443322',
        '00066778899',
        'Hasan Hidayat',
        '085611223344',
        'Ayah',
      ],
    ];

    sampleRows.forEach(row => sheet.addRow(row));

    sheet.columns = [
      { width: 25 }, // Full Name
      { width: 20 }, // Username
      { width: 25 }, // Email
      { width: 18 }, // Password
      { width: 18 }, // Role (worker, tukang, helper, supervisor, etc.)
      { width: 20 }, // Employment Type (tetap, kontrak, harian_lepas, magang)
      { width: 20 }, // Position
      { width: 18 }, // Phone
      { width: 30 }, // Address
      { width: 24 }, // BPJS TK
      { width: 22 }, // BPJS Kesehatan
      { width: 25 }, // Emergency Contact Name
      { width: 22 }, // Emergency Contact Phone
      { width: 25 }, // Emergency Contact Relationship
    ];

    // Information sheet with allowed values
    const infoSheet = workbook.addWorksheet('Petunjuk Pengisian');
    infoSheet.addRow(['Kolom', 'Keterangan', 'Nilai yang Diperbolehkan']);
    infoSheet.getRow(1).font = { bold: true };
    infoSheet.addRow(['Full Name *', 'Nama lengkap pekerja', 'Wajib diisi']);
    infoSheet.addRow(['Username *', 'Nama pengguna unik (huruf kecil)', 'Wajib diisi, unik']);
    infoSheet.addRow(['Email *', 'Alamat email aktif pekerja', 'Wajib diisi, unik']);
    infoSheet.addRow(['Password *', 'Kata sandi akun (min. 6 karakter)', 'Wajib diisi, min. 6 karakter']);
    infoSheet.addRow(['Role', 'Peran dalam sistem', VALID_ROLES.join(', ')]);
    infoSheet.addRow(['Employment Type', 'Status ikatan kerja', VALID_EMPLOYMENT_TYPES.join(', ')]);
    infoSheet.addRow(['Position', 'Jabatan / Keahlian spesifik', 'Bebas']);
    infoSheet.addRow(['BPJS Ketenagakerjaan (TK)', 'Nomor kartu BPJS TK / KPJ (Opsional)', 'Nomor / Teks']);
    infoSheet.addRow(['BPJS Kesehatan', 'Nomor kartu BPJS Kesehatan (Opsional)', 'Nomor / Teks']);
    infoSheet.addRow(['Emergency Contact', 'Kontak Darurat (Keluarga/Kerabat)', 'Nama, No HP, Hubungan (Istri, Ayah, Ibu, dll)']);
    infoSheet.columns = [{ width: 25 }, { width: 35 }, { width: 50 }];

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MTERP_Template_Import_Pekerja.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Generate import template error:', error);
    res.status(500).json({ msg: 'Failed to generate template' });
  }
});

// POST /api/users/import - Parse uploaded .xlsx/.csv, validate and insert users
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    const fileData = req.file.buffer || fs.readFileSync(req.file.path);
    const originalName = req.file.originalname.toLowerCase();
    const workbook = new ExcelJS.Workbook();

    if (originalName.endsWith('.csv')) {
      // ExcelJS CSV load requires a readable stream or buffer
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(fileData);
      stream.push(null);
      await workbook.csv.read(stream);
    } else {
      await workbook.xlsx.load(fileData);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ msg: 'Uploaded file has no data rows' });
    }

    // Extract headers from row 1
    const rawHeaders = [];
    sheet.getRow(1).eachCell((cell, colNum) => {
      rawHeaders[colNum] = String(cell.value || '').trim();
    });

    const findCol = (aliases) => {
      for (let i = 1; i < rawHeaders.length; i++) {
        if (aliases.includes(norm(rawHeaders[i]))) return i;
      }
      return -1;
    };

    const colFullName = findCol(['fullname', 'namalengkap', 'nama', 'name']);
    const colUsername = findCol(['username', 'user', 'namauser']);
    const colEmail = findCol(['email', 'surel', 'alamattemail']);
    const colPassword = findCol(['password', 'katasandi', 'pass']);
    const colRole = findCol(['role', 'peran']);
    const colEmploymentType = findCol(['employmenttype', 'statuspekerja', 'statuskerja', 'jenispekerja', 'statustk']);
    const colPosition = findCol(['position', 'posisi', 'jabatan']);
    const colPhone = findCol(['phone', 'nohp', 'telepon', 'telp', 'hp']);
    const colAddress = findCol(['address', 'alamat']);
    const colBpjsTk = findCol(['bpjstk', 'bpjsketenagakerjaan', 'nobpjstk', 'nomorbpjstk', 'kpj', 'bpjstkno']);
    const colBpjsKes = findCol(['bpjskesehatan', 'bpjskes', 'nobpjskesehatan', 'nobpjskes', 'nomorbpjskesehatan', 'bpjskesno']);
    const colEmergName = findCol(['emergencycontactname', 'namakontakdarurat', 'kontakdaruratnama', 'daruratnama', 'emergencyname']);
    const colEmergPhone = findCol(['emergencycontactphone', 'nohpkontakdarurat', 'kontakdarurattelepon', 'kontakdaruratphone', 'daruratphone', 'emergencyphone']);
    const colEmergRel = findCol(['emergencycontactrelationship', 'hubungankontakdarurat', 'hubungankeluarga', 'kontakdarurathubungan', 'darurathubungan', 'relationship', 'hubungan']);

    if (colFullName === -1 || colUsername === -1 || colEmail === -1) {
      return res.status(400).json({
        msg: 'File is missing required column headers: Full Name, Username, and Email are required.'
      });
    }

    const rowsToProcess = [];
    const errors = [];
    const seenUsernames = new Set();
    const seenEmails = new Set();

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Skip header

      const getCellStr = (colIdx) => {
        if (colIdx === -1) return '';
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return '';
        if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
        return String(cell.value).trim();
      };

      const fullName = getCellStr(colFullName);
      const username = getCellStr(colUsername).toLowerCase();
      const email = getCellStr(colEmail).toLowerCase();
      const password = getCellStr(colPassword) || 'Mterp1234!';
      let role = getCellStr(colRole).toLowerCase();
      let employmentType = getCellStr(colEmploymentType).toLowerCase();
      const position = getCellStr(colPosition);
      const phone = getCellStr(colPhone);
      const address = getCellStr(colAddress);
      const bpjsTk = getCellStr(colBpjsTk);
      const bpjsKesehatan = getCellStr(colBpjsKes);
      const emergencyContactName = getCellStr(colEmergName);
      const emergencyContactPhone = getCellStr(colEmergPhone);
      const emergencyContactRel = getCellStr(colEmergRel);

      // If empty row, skip
      if (!fullName && !username && !email) return;

      // Validation
      if (!fullName) {
        errors.push({ row: rowNum, error: 'Full Name is required' });
        return;
      }
      if (!username) {
        errors.push({ row: rowNum, error: 'Username is required' });
        return;
      }
      if (!email || !email.includes('@')) {
        errors.push({ row: rowNum, error: 'Valid Email is required' });
        return;
      }
      if (password.length < 6) {
        errors.push({ row: rowNum, error: 'Password must be at least 6 characters' });
        return;
      }

      if (seenUsernames.has(username)) {
        errors.push({ row: rowNum, error: `Duplicate username '${username}' within import file` });
        return;
      }
      if (seenEmails.has(email)) {
        errors.push({ row: rowNum, error: `Duplicate email '${email}' within import file` });
        return;
      }

      if (!VALID_ROLES.includes(role)) {
        role = 'worker';
      }

      if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
        employmentType = 'tetap';
      }

      seenUsernames.add(username);
      seenEmails.add(email);

      rowsToProcess.push({
        rowNum,
        userData: {
          fullName,
          username,
          email,
          password,
          role,
          employmentType,
          position,
          phone,
          address,
          bpjsTk,
          bpjsKesehatan,
          emergencyContact: {
            name: emergencyContactName,
            phone: emergencyContactPhone,
            relationship: emergencyContactRel,
          },
          isVerified: true,
        },
      });
    });

    if (rowsToProcess.length === 0) {
      return res.status(400).json({
        msg: 'No valid rows to import',
        errors,
      });
    }

    // Check database collisions for usernames & emails
    const existingUsers = await User.find({
      $or: [
        { username: { $in: Array.from(seenUsernames) } },
        { email: { $in: Array.from(seenEmails) } },
      ],
    }).select('username email');

    const existingUsernames = new Set(existingUsers.map(u => u.username));
    const existingEmails = new Set(existingUsers.map(u => u.email));

    const createdUsers = [];
    for (const item of rowsToProcess) {
      const { userData, rowNum } = item;

      if (existingUsernames.has(userData.username)) {
        errors.push({ row: rowNum, error: `Username '${userData.username}' already exists in database` });
        continue;
      }
      if (existingEmails.has(userData.email)) {
        errors.push({ row: rowNum, error: `Email '${userData.email}' already exists in database` });
        continue;
      }

      try {
        const user = new User(userData);
        await user.save();
        createdUsers.push(user.toJSON());
      } catch (err) {
        errors.push({ row: rowNum, error: err.message });
      }
    }

    res.json({
      msg: `Import completed: ${createdUsers.length} user(s) created, ${errors.length} failed`,
      createdCount: createdUsers.length,
      failedCount: errors.length,
      createdUsers,
      errors,
    });
  } catch (error) {
    console.error('Import users error:', error);
    res.status(500).json({ msg: 'Failed to process import file: ' + error.message });
  } finally {
    // Cleanup temporary file if diskStorage was used
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // ignore
      }
    }
  }
});

// POST /api/users/bulk - Bulk create users from JSON array (for Quick Add modal)
router.post('/bulk', async (req, res) => {
  try {
    const { users: userList } = req.body;

    if (!Array.isArray(userList) || userList.length === 0) {
      return res.status(400).json({ msg: 'users array is required and must not be empty' });
    }

    const created = [];
    const errors = [];
    const seenUsernames = new Set();
    const seenEmails = new Set();

    // In-memory duplicate checks
    for (let i = 0; i < userList.length; i++) {
      const u = userList[i];
      const username = String(u.username || '').toLowerCase().trim();
      const email = String(u.email || '').toLowerCase().trim();

      if (!u.fullName || !username || !email || !u.password) {
        errors.push({ index: i, error: 'fullName, username, email, and password are required' });
        continue;
      }

      if (u.password.length < 6) {
        errors.push({ index: i, error: 'Password must be at least 6 characters' });
        continue;
      }

      if (seenUsernames.has(username)) {
        errors.push({ index: i, error: `Duplicate username '${username}' in batch` });
        continue;
      }
      if (seenEmails.has(email)) {
        errors.push({ index: i, error: `Duplicate email '${email}' in batch` });
        continue;
      }

      seenUsernames.add(username);
      seenEmails.add(email);
    }

    // Database collision checks
    const existing = await User.find({
      $or: [
        { username: { $in: Array.from(seenUsernames) } },
        { email: { $in: Array.from(seenEmails) } },
      ],
    }).select('username email');

    const dbUsernames = new Set(existing.map(u => u.username));
    const dbEmails = new Set(existing.map(u => u.email));

    for (let i = 0; i < userList.length; i++) {
      // Check if already errored
      if (errors.some(e => e.index === i)) continue;

      const u = userList[i];
      const username = String(u.username).toLowerCase().trim();
      const email = String(u.email).toLowerCase().trim();

      if (dbUsernames.has(username)) {
        errors.push({ index: i, error: `Username '${username}' already exists in database` });
        continue;
      }
      if (dbEmails.has(email)) {
        errors.push({ index: i, error: `Email '${email}' already exists in database` });
        continue;
      }

      let role = u.role || 'worker';
      if (!VALID_ROLES.includes(role)) role = 'worker';

      let employmentType = u.employmentType || 'tetap';
      if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) employmentType = 'tetap';

      try {
        const newUser = new User({
          fullName: u.fullName.trim(),
          username,
          email,
          password: u.password,
          role,
          employmentType,
          position: u.position || '',
          phone: u.phone || '',
          address: u.address || '',
          bpjsTk: u.bpjsTk ? String(u.bpjsTk).trim() : '',
          bpjsKesehatan: u.bpjsKesehatan ? String(u.bpjsKesehatan).trim() : '',
          emergencyContact: {
            name: u.emergencyContact?.name || '',
            phone: u.emergencyContact?.phone || '',
            relationship: u.emergencyContact?.relationship || '',
          },
          contractStartDate: u.contractStartDate || null,
          contractEndDate: u.contractEndDate || null,
          isVerified: true,
        });

        await newUser.save();
        created.push(newUser.toJSON());
      } catch (err) {
        errors.push({ index: i, error: err.message });
      }
    }

    res.json({
      msg: `Bulk create finished: ${created.length} created, ${errors.length} failed`,
      createdCount: created.length,
      failedCount: errors.length,
      created,
      errors,
    });
  } catch (error) {
    console.error('Bulk create users error:', error);
    res.status(500).json({ msg: 'Server error during bulk create' });
  }
});

// ==========================================
// STANDARD USER CRUD ENDPOINTS
// ==========================================

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const filter = buildUserFilter(req.query);
    const users = await User.find(filter)
      .select('-password -otp')
      .sort({ fullName: 1, createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/users - Create new user as owner
router.post('/', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      role,
      phone,
      address,
      position,
      employmentType,
      contractStartDate,
      contractEndDate,
      emergencyContact,
      bpjsTk,
      bpjsKesehatan,
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create user (Auto-verify since owner creates it)
    const user = new User({
      username,
      email,
      password,
      fullName,
      role: role || 'worker',
      phone,
      address,
      position: position || '',
      employmentType: VALID_EMPLOYMENT_TYPES.includes(employmentType) ? employmentType : 'tetap',
      contractStartDate: contractStartDate || null,
      contractEndDate: contractEndDate || null,
      emergencyContact: emergencyContact || { name: '', phone: '', relationship: '' },
      bpjsTk: bpjsTk ? String(bpjsTk).trim() : '',
      bpjsKesehatan: bpjsKesehatan ? String(bpjsKesehatan).trim() : '',
      isVerified: true
    });

    await user.save();
    res.status(201).json(user.toJSON());
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/users/:id - Update user details (employmentType, emergencyContact, profile fields)
router.put('/:id', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      address,
      position,
      employmentType,
      contractStartDate,
      contractEndDate,
      emergencyContact,
      paymentInfo,
    } = req.body;

    const updateData = {};

    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address.trim();
    if (position !== undefined) updateData.position = position.trim();
    if (employmentType !== undefined && VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
      updateData.employmentType = employmentType;
    }
    if (contractStartDate !== undefined) updateData.contractStartDate = contractStartDate || null;
    if (contractEndDate !== undefined) updateData.contractEndDate = contractEndDate || null;
    if (req.body.bpjsTk !== undefined) {
      updateData.bpjsTk = req.body.bpjsTk ? String(req.body.bpjsTk).trim() : '';
    }
    if (req.body.bpjsKesehatan !== undefined) {
      updateData.bpjsKesehatan = req.body.bpjsKesehatan ? String(req.body.bpjsKesehatan).trim() : '';
    }
    if (emergencyContact !== undefined) {
      updateData.emergencyContact = {
        name: emergencyContact.name ? emergencyContact.name.trim() : '',
        phone: emergencyContact.phone ? emergencyContact.phone.trim() : '',
        relationship: emergencyContact.relationship ? emergencyContact.relationship.trim() : '',
      };
    }
    if (paymentInfo !== undefined) {
      updateData.paymentInfo = {
        bankAccount: paymentInfo.bankAccount ? paymentInfo.bankAccount.trim() : '',
        bankPlatform: paymentInfo.bankPlatform ? paymentInfo.bankPlatform.trim() : '',
        accountName: paymentInfo.accountName ? paymentInfo.accountName.trim() : '',
      };
    }
    if (req.body.education !== undefined) {
      updateData.education = {
        level: req.body.education.level || '',
        institution: (req.body.education.institution || '').trim(),
        major: (req.body.education.major || '').trim(),
        graduationYear: (req.body.education.graduationYear || '').trim(),
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -otp');

    if (!updatedUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// POST /api/users/:id/education - Update education info and optional proof document
router.post('/:id/education', upload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(404).json({ msg: 'User not found' });
    }

    const { level, institution, major, graduationYear } = req.body;

    if (!user.education) {
      user.education = {};
    }

    if (level !== undefined) user.education.level = level;
    if (institution !== undefined) user.education.institution = (institution || '').trim();
    if (major !== undefined) user.education.major = (major || '').trim();
    if (graduationYear !== undefined) user.education.graduationYear = (graduationYear || '').trim();

    if (req.file) {
      if (user.education.documentUrl) {
        deleteLocalFile(user.education.documentUrl);
      }
      user.education.documentUrl = `/uploads/documents/${req.file.filename}`;
      user.education.documentName = req.file.originalname;
      user.education.documentSize = req.file.size;
      user.education.uploadedAt = new Date();
    }

    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    if (req.file) deleteLocalFile(req.file.path);
    console.error('Update education error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// DELETE /api/users/:id/education/proof - Remove education proof file
router.delete('/:id/education/proof', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.education?.documentUrl) {
      deleteLocalFile(user.education.documentUrl);
      user.education.documentUrl = '';
      user.education.documentName = '';
      user.education.documentSize = 0;
      user.education.uploadedAt = null;
      await user.save();
    }

    res.json(user.toJSON());
  } catch (error) {
    console.error('Delete education proof error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// POST /api/users/:id/competencies - Add a competency certificate
router.post('/:id/competencies', upload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(404).json({ msg: 'User not found' });
    }

    const { name, issuer, certificateNumber, issueDate, expiryDate } = req.body;

    if (!name || !name.trim()) {
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(400).json({ msg: 'Nama sertifikat / kompetensi wajib diisi' });
    }

    const newCert = {
      name: name.trim(),
      issuer: (issuer || '').trim(),
      certificateNumber: (certificateNumber || '').trim(),
      issueDate: issueDate ? new Date(issueDate) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      documentUrl: req.file ? `/uploads/documents/${req.file.filename}` : '',
      documentName: req.file ? req.file.originalname : '',
      documentSize: req.file ? req.file.size : 0,
      uploadedAt: req.file ? new Date() : null,
    };

    if (!user.competencies) {
      user.competencies = [];
    }
    user.competencies.push(newCert);

    await user.save();
    res.status(201).json(user.toJSON());
  } catch (error) {
    if (req.file) deleteLocalFile(req.file.path);
    console.error('Add competency certificate error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// PUT /api/users/:id/competencies/:certId - Update a competency certificate
router.put('/:id/competencies/:certId', upload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(404).json({ msg: 'User not found' });
    }

    const cert = user.competencies.id(req.params.certId);
    if (!cert) {
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(404).json({ msg: 'Certificate not found' });
    }

    const { name, issuer, certificateNumber, issueDate, expiryDate } = req.body;

    if (name !== undefined) cert.name = name.trim();
    if (issuer !== undefined) cert.issuer = (issuer || '').trim();
    if (certificateNumber !== undefined) cert.certificateNumber = (certificateNumber || '').trim();
    if (issueDate !== undefined) cert.issueDate = issueDate ? new Date(issueDate) : null;
    if (expiryDate !== undefined) cert.expiryDate = expiryDate ? new Date(expiryDate) : null;

    if (req.file) {
      if (cert.documentUrl) {
        deleteLocalFile(cert.documentUrl);
      }
      cert.documentUrl = `/uploads/documents/${req.file.filename}`;
      cert.documentName = req.file.originalname;
      cert.documentSize = req.file.size;
      cert.uploadedAt = new Date();
    }

    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    if (req.file) deleteLocalFile(req.file.path);
    console.error('Update competency certificate error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// DELETE /api/users/:id/competencies/:certId - Delete a competency certificate
router.delete('/:id/competencies/:certId', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const cert = user.competencies.id(req.params.certId);
    if (!cert) {
      return res.status(404).json({ msg: 'Certificate not found' });
    }

    if (cert.documentUrl) {
      deleteLocalFile(cert.documentUrl);
    }

    cert.deleteOne();
    await user.save();

    res.json(user.toJSON());
  } catch (error) {
    console.error('Delete competency certificate error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// PUT /api/users/:id/role - Update user role
router.put('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ msg: 'Invalid role provided' });
    }

    // Prevent owner from removing their own owner role through this endpoint 
    if (req.params.id === req.user._id.toString() && role !== 'owner') {
      const ownerCount = await User.countDocuments({ role: 'owner' });
      if (ownerCount <= 1) {
        return res.status(400).json({ msg: 'Cannot remove last owner role' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true }
    ).select('-password -otp');

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/users/:id/verify - Manually verify a user
router.put('/:id/verify', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ msg: 'User is already verified' });
    }

    user.isVerified = true;
    user.otp = undefined; // Clear any pending OTP
    await user.save();

    res.json(user.toJSON());
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/users/:id - Delete a user
router.delete('/:id', async (req, res) => {
  try {
    // Prevent owner from deleting themselves
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ msg: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({ msg: 'User removed successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
