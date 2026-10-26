const express = require('express');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { Tool, ToolMovement, Warehouse } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { nowWIB } = require('../utils/date');

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

// GET /api/tools/dashboard - Get tool statistics and list
router.get('/dashboard', auth, async (req, res) => {
  try {
    const { search, projectId } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { nama: { $regex: search, $options: 'i' } },
        { kategori: { $regex: search, $options: 'i' } },
        { lokasi: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Project filter
    if (projectId) {
      query.projectId = projectId;
    }
    
    // Get ALL tools first for stats, then filter for display
    const allTools = await Tool.find()
      .populate('assignedTo', 'fullName username role')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault')
      .sort({ nama: 1 })
      .lean();
    
    // Calculate stats from full set
    const stats = {
      total: allTools.length,
      available: allTools.filter(t => t.kondisi === 'Baik' && !t.assignedTo).length,
      inUse: allTools.filter(t => t.assignedTo).length,
      maintenance: allTools.filter(t => t.kondisi === 'Maintenance').length,
      other: allTools.filter(t => t.kondisi === 'Rusak').length,
    };
    
    // Apply search/project filters for the display list
    let tools = allTools;
    if (search || projectId) {
      const searchLower = search ? search.toLowerCase() : '';
      tools = allTools.filter(t => {
        if (projectId && (!t.projectId || t.projectId._id.toString() !== projectId)) return false;
        if (search) {
          return (t.nama && t.nama.toLowerCase().includes(searchLower)) ||
                 (t.kategori && t.kategori.toLowerCase().includes(searchLower)) ||
                 (t.lokasi && t.lokasi.toLowerCase().includes(searchLower));
        }
        return true;
      });
    }
    
    res.json({ tools, stats });
  } catch (error) {
    console.error('Get tools dashboard error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tools - Get all tools
router.get('/', auth, async (req, res) => {
  try {
    const tools = await Tool.find()
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama')
      .lean();
    res.json(tools);
  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Helper to format date in WIB (Asia/Jakarta)
const formatDateWIB = (date) => {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch (e) {
    return String(date).split('T')[0];
  }
};

// Exportable column configurations
const TOOL_EXPORT_COLUMNS = {
  no: {
    header: 'No',
    width: 6,
    get: (t, idx) => idx + 1,
    align: 'center',
  },
  nama: {
    header: 'Nama Alat / Mesin',
    width: 32,
    get: (t) => t.nama || '',
    align: 'left',
  },
  kategori: {
    header: 'Kategori',
    width: 20,
    get: (t) => t.kategori || '-',
    align: 'left',
  },
  kondisi: {
    header: 'Kondisi',
    width: 16,
    get: (t) => t.kondisi || 'Baik',
    align: 'center',
  },
  stok: {
    header: 'Stok',
    width: 10,
    get: (t) => Number(t.stok) || 0,
    align: 'right',
  },
  satuan: {
    header: 'Satuan',
    width: 12,
    get: (t) => t.satuan || 'unit',
    align: 'center',
  },
  lokasi: {
    header: 'Lokasi Penyimpanan',
    width: 22,
    get: (t) => t.lokasi || '-',
    align: 'left',
  },
  status: {
    header: 'Status Penggunaan',
    width: 18,
    get: (t) => (t.assignedTo ? 'Digunakan' : 'Tersedia'),
    align: 'center',
  },
  assignedTo: {
    header: 'Penanggung Jawab / Pengguna',
    width: 28,
    get: (t) => t.assignedTo?.fullName || '-',
    align: 'left',
  },
  project: {
    header: 'Proyek Terkait',
    width: 28,
    get: (t) => t.projectId?.nama || '-',
    align: 'left',
  },
  lastChecked: {
    header: 'Pengecekan Terakhir',
    width: 20,
    get: (t) => (t.lastChecked ? formatDateWIB(t.lastChecked) : '-'),
    align: 'center',
  },
  createdAt: {
    header: 'Tanggal Didaftarkan',
    width: 18,
    get: (t) => (t.createdAt ? formatDateWIB(t.createdAt) : '-'),
    align: 'center',
  },
  notes: {
    header: 'Catatan',
    width: 26,
    get: (t) => t.notes || '-',
    align: 'left',
  },
};

// GET /api/tools/export-excel - Export tools inventory to formatted Excel (.xlsx) (MUST be before /:id)
router.get('/export-excel', auth, async (req, res) => {
  try {
    const { search, kondisi, projectId, columns, headers, toolIds } = req.query;

    const allTools = await Tool.find()
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama')
      .sort({ nama: 1 })
      .lean();

    // Filter tools based on query params
    const filteredTools = allTools.filter(t => {
      // Specific tool IDs filter (for bulk export)
      if (toolIds) {
        const idList = Array.isArray(toolIds) ? toolIds : toolIds.split(',');
        if (!idList.includes(t._id.toString())) {
          return false;
        }
      }

      // Project filter
      if (projectId && (!t.projectId || t.projectId._id.toString() !== projectId)) {
        return false;
      }

      // Kondisi / status filter
      if (kondisi && kondisi !== 'all') {
        if (kondisi === 'inUse' && !t.assignedTo) return false;
        if (kondisi === 'available' && (t.kondisi !== 'Baik' || t.assignedTo)) return false;
        if (['Baik', 'Maintenance', 'Rusak'].includes(kondisi) && t.kondisi !== kondisi) return false;
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesNama = t.nama && t.nama.toLowerCase().includes(searchLower);
        const matchesKategori = t.kategori && t.kategori.toLowerCase().includes(searchLower);
        const matchesLokasi = t.lokasi && t.lokasi.toLowerCase().includes(searchLower);
        const matchesAssigned = t.assignedTo?.fullName && t.assignedTo.fullName.toLowerCase().includes(searchLower);
        const matchesProject = t.projectId?.nama && t.projectId.nama.toLowerCase().includes(searchLower);
        if (!matchesNama && !matchesKategori && !matchesLokasi && !matchesAssigned && !matchesProject) {
          return false;
        }
      }

      return true;
    });

    // Determine requested columns
    let selectedKeys = columns ? columns.split(',').map(c => c.trim()) : Object.keys(TOOL_EXPORT_COLUMNS);
    selectedKeys = selectedKeys.filter(k => TOOL_EXPORT_COLUMNS[k]);
    if (selectedKeys.length === 0) selectedKeys = Object.keys(TOOL_EXPORT_COLUMNS);

    const includeHeaders = headers !== 'false' && headers !== '0';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MTERP Construction ERP';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Inventaris Alat', {
      views: [{ state: 'frozen', ySplit: includeHeaders ? 1 : 0 }],
    });

    // Set columns configuration
    sheet.columns = selectedKeys.map(k => ({
      header: TOOL_EXPORT_COLUMNS[k].header,
      key: k,
      width: TOOL_EXPORT_COLUMNS[k].width,
    }));

    if (includeHeaders) {
      // Header row styling: Dark Slate/Navy with crisp white bold font
      const headerRow = sheet.getRow(1);
      headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Slate-800
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      // Enable AutoFilter on header row
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: selectedKeys.length },
      };
    }

    // Add data rows with borders, alternating colors, and condition styling
    filteredTools.forEach((t, idx) => {
      const rowData = {};
      selectedKeys.forEach(k => {
        rowData[k] = TOOL_EXPORT_COLUMNS[k].get(t, idx);
      });

      const row = sheet.addRow(rowData);
      row.height = 22;
      const isEven = idx % 2 === 0;

      selectedKeys.forEach((k, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        const colDef = TOOL_EXPORT_COLUMNS[k];

        // Font
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };

        // Zebra striping background
        if (!isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }, // Light slate
          };
        }

        // Cell borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        // Alignment
        cell.alignment = {
          vertical: 'middle',
          horizontal: colDef.align || 'left',
        };

        // Custom highlight for Kondisi column
        if (k === 'kondisi') {
          if (t.kondisi === 'Baik') {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF059669' } }; // Emerald
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          } else if (t.kondisi === 'Maintenance') {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } }; // Amber
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          } else if (t.kondisi === 'Rusak') {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } }; // Red
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          }
        }

        // Custom highlight for Status column
        if (k === 'status') {
          if (t.assignedTo) {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2563EB' } }; // Blue
          } else {
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF059669' } }; // Green
          }
        }
      });
    });

    // Add Summary Row if headers included and tools present
    if (includeHeaders && filteredTools.length > 0) {
      const summaryRowIndex = filteredTools.length + 2;
      const summaryRow = sheet.getRow(summaryRowIndex);
      summaryRow.height = 24;

      selectedKeys.forEach((k, colIdx) => {
        const cell = summaryRow.getCell(colIdx + 1);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
        };

        if (colIdx === 0) {
          cell.value = 'TOTAL';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (k === 'nama') {
          cell.value = `${filteredTools.length} Alat`;
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (k === 'stok') {
          const totalStock = filteredTools.reduce((acc, curr) => acc + (Number(curr.stok) || 0), 0);
          cell.value = totalStock;
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="MTERP_Inventaris_Alat_${dateStr}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Export Tools Excel error:', error);
    res.status(500).json({ msg: 'Gagal mengekspor file Excel' });
  }
});

// GET /api/tools/template-excel - Download pre-styled template for bulk tool import
router.get('/template-excel', auth, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MTERP Construction ERP';
    workbook.created = new Date();

    // Sheet 1: Template
    const sheet = workbook.addWorksheet('Template Import Alat', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama Alat / Mesin *', key: 'nama', width: 32 },
      { header: 'Kategori', key: 'kategori', width: 22 },
      { header: 'Stok', key: 'stok', width: 10 },
      { header: 'Satuan', key: 'satuan', width: 12 },
      { header: 'Kondisi (Baik/Maintenance/Rusak)', key: 'kondisi', width: 30 },
      { header: 'Lokasi Penyimpanan', key: 'lokasi', width: 28 },
      { header: 'Catatan / Spesifikasi', key: 'notes', width: 32 },
    ];

    // Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Slate 800
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Sample data rows
    const sampleRows = [
      {
        no: 1,
        nama: 'Genset Silent 5 kVA Loncin',
        kategori: 'Mesin & Genset',
        stok: 1,
        satuan: 'unit',
        kondisi: 'Baik',
        lokasi: 'Head Office PT Mega Tama Enerco',
        notes: 'Nomor Seri: GEN-2026-081, Starter elektrik',
      },
      {
        no: 2,
        nama: 'Mesin Las Inverter 200A Daiden',
        kategori: 'Mesin & Genset',
        stok: 2,
        satuan: 'unit',
        kondisi: 'Baik',
        lokasi: 'Head Office PT Mega Tama Enerco',
        notes: 'Lengkap tang las & tang massa',
      },
      {
        no: 3,
        nama: 'Helm Proyek Putih MSA Standard',
        kategori: 'K3 / Safety',
        stok: 25,
        satuan: 'unit',
        kondisi: 'Baik',
        lokasi: 'Head Office PT Mega Tama Enerco',
        notes: 'Tali dagu lengkap, stok safety baru',
      },
      {
        no: 4,
        nama: 'Bor Rotary Hammer SDS-Plus Makita',
        kategori: 'Perkakas Listrik',
        stok: 1,
        satuan: 'unit',
        kondisi: 'Maintenance',
        lokasi: 'Head Office PT Mega Tama Enerco',
        notes: 'Perlu servis carbon brush',
      },
    ];

    sampleRows.forEach((row, idx) => {
      const addedRow = sheet.addRow(row);
      addedRow.height = 22;
      addedRow.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
      addedRow.alignment = { vertical: 'middle', horizontal: 'left' };
      addedRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      addedRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
      addedRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      addedRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };

      // Border
      for (let i = 1; i <= 8; i++) {
        addedRow.getCell(i).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    });

    // Sheet 2: Panduan
    const guideSheet = workbook.addWorksheet('Petunjuk & Nilai Valid');
    guideSheet.columns = [
      { header: 'Kolom', key: 'col', width: 25 },
      { header: 'Wajib/Opsional', key: 'req', width: 16 },
      { header: 'Contoh / Nilai Valid', key: 'ex', width: 35 },
      { header: 'Penjelasan Teknis', key: 'desc', width: 45 },
    ];
    const guideHeader = guideSheet.getRow(1);
    guideHeader.height = 26;
    guideHeader.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    guideHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal 700
    };

    const guideRules = [
      { col: 'Nama Alat / Mesin', req: 'Wajib', ex: 'Genset Silent 5 kVA', desc: 'Nama identifikasi unik alat atau perkakas' },
      { col: 'Kategori', req: 'Opsional', ex: 'Mesin & Genset, K3, Alat Ukur', desc: 'Kategori klasifikasi inventaris' },
      { col: 'Stok', req: 'Opsional', ex: '1, 5, 20', desc: 'Jumlah fisik alat (default: 1 jika kosong)' },
      { col: 'Satuan', req: 'Opsional', ex: 'unit, set, pcs, roll, buah', desc: 'Satuan hitung jumlah alat (default: unit)' },
      { col: 'Kondisi', req: 'Opsional', ex: 'Baik, Maintenance, Rusak', desc: 'Wajib salah satu nilai tersebut (default: Baik)' },
      { col: 'Lokasi Penyimpanan', req: 'Opsional', ex: 'Head Office PT Mega Tama Enerco', desc: 'Lokasi awal alat saat didaftarkan' },
      { col: 'Catatan', req: 'Opsional', ex: 'Nomor seri, kelengkapan, dll.', desc: 'Keterangan tambahan atau spesifikasi alat' },
    ];
    guideRules.forEach(r => guideSheet.addRow(r));

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MTERP_Template_Import_Alat.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Download template Excel error:', error);
    res.status(500).json({ msg: 'Gagal membuat template Excel' });
  }
});

// POST /api/tools/parse-excel - Upload & pre-validate Excel/CSV for preview modal
router.post('/parse-excel', auth, authorize('owner', 'director', 'asset_admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'File Excel (.xlsx) atau CSV tidak ditemukan' });
    }

    const filePath = req.file.path;
    const originalName = (req.file.originalname || '').toLowerCase();
    const workbook = new ExcelJS.Workbook();

    try {
      if (originalName.endsWith('.csv')) {
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(fs.readFileSync(filePath));
        stream.push(null);
        await workbook.csv.read(stream);
      } else {
        await workbook.xlsx.readFile(filePath);
      }
    } finally {
      // Remove temporary uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // ignore deletion failure
      }
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ msg: 'File tidak memiliki baris data (hanya judul atau kosong)' });
    }

    // Header alias matching helpers
    const rawHeaders = [];
    sheet.getRow(1).eachCell((cell, colNum) => {
      rawHeaders[colNum] = String(cell.value || '').trim().toLowerCase();
    });

    const findCol = (aliases) => {
      for (let i = 1; i < rawHeaders.length; i++) {
        const header = rawHeaders[i];
        if (header && aliases.some(alias => header.includes(alias))) {
          return i;
        }
      }
      return -1;
    };

    const colNama = findCol(['nama', 'alat', 'tool', 'barang', 'item']);
    const colKategori = findCol(['kategori', 'category', 'jenis', 'tipe']);
    const colStok = findCol(['stok', 'stock', 'qty', 'jumlah', 'kuantitas']);
    const colSatuan = findCol(['satuan', 'unit', 'uom']);
    const colKondisi = findCol(['kondisi', 'condition', 'keadaan', 'status']);
    const colLokasi = findCol(['lokasi', 'location', 'gudang', 'warehouse', 'posisi']);
    const colNotes = findCol(['catatan', 'notes', 'keterangan', 'deskripsi', 'spesifikasi']);

    if (colNama === -1) {
      return res.status(400).json({
        msg: 'Kolom "Nama Alat" tidak terdeteksi. Pastikan file memiliki kolom Nama Alat atau Nama.',
      });
    }

    // Retrieve existing tools to identify duplicates
    const existingTools = await Tool.find().select('nama stok kondisi lokasi').lean();
    const existingMap = new Map();
    existingTools.forEach(t => {
      if (t.nama) {
        existingMap.set(t.nama.trim().toLowerCase(), t);
      }
    });

    const parsedRows = [];
    let validCount = 0;
    let duplicateCount = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const rawNama = row.getCell(colNama).value;
      if (!rawNama && rawNama !== 0) continue; // skip totally empty rows

      const nama = String(rawNama).trim();
      if (!nama) continue;

      const rawKategori = colKategori !== -1 ? row.getCell(colKategori).value : '';
      const rawStok = colStok !== -1 ? row.getCell(colStok).value : 1;
      const rawSatuan = colSatuan !== -1 ? row.getCell(colSatuan).value : 'unit';
      const rawKondisi = colKondisi !== -1 ? row.getCell(colKondisi).value : 'Baik';
      const rawLokasi = colLokasi !== -1 ? row.getCell(colLokasi).value : 'Head Office PT Mega Tama Enerco';
      const rawNotes = colNotes !== -1 ? row.getCell(colNotes).value : '';

      // Normalize Kondisi
      let kondisi = 'Baik';
      const kLower = String(rawKondisi || '').toLowerCase();
      if (kLower.includes('rusak') || kLower.includes('broken')) {
        kondisi = 'Rusak';
      } else if (kLower.includes('maint') || kLower.includes('servis') || kLower.includes('perbaikan')) {
        kondisi = 'Maintenance';
      }

      // Normalize Stok
      let stok = Number(rawStok);
      if (isNaN(stok) || stok < 0) {
        stok = 1;
      }

      const kategori = String(rawKategori || '').trim() || 'Umum';
      const satuan = String(rawSatuan || '').trim() || 'unit';
      const lokasi = String(rawLokasi || '').trim() || 'Head Office PT Mega Tama Enerco';
      const notes = String(rawNotes || '').trim();

      // Check existing tool by name
      const existing = existingMap.get(nama.toLowerCase());
      const isDuplicate = Boolean(existing);
      if (isDuplicate) duplicateCount++;

      const errors = [];
      if (!nama) errors.push('Nama alat tidak boleh kosong');

      const isValid = errors.length === 0;
      if (isValid) validCount++;

      parsedRows.push({
        rowNumber: r,
        nama,
        kategori,
        stok,
        satuan,
        kondisi,
        lokasi,
        notes,
        isDuplicate,
        existingId: existing?._id || null,
        existingStok: existing?.stok ?? null,
        existingKondisi: existing?.kondisi ?? null,
        isValid,
        errors,
      });
    }

    res.json({
      summary: {
        total: parsedRows.length,
        valid: validCount,
        invalid: parsedRows.length - validCount,
        duplicates: duplicateCount,
      },
      rows: parsedRows,
    });
  } catch (error) {
    console.error('Parse Tools Excel error:', error);
    res.status(500).json({ msg: 'Gagal memproses file Excel: ' + (error.message || 'Format tidak valid') });
  }
});

// POST /api/tools/import-excel - Commit parsed rows to database
router.post('/import-excel', auth, authorize('owner', 'director', 'asset_admin'), async (req, res) => {
  try {
    const { rows, mode = 'skip' } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ msg: 'Tidak ada baris data untuk diimpor' });
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const item of rows) {
      if (!item.nama || !item.isValid) {
        failedCount++;
        continue;
      }

      const namaTrimmed = String(item.nama).trim();
      const existing = await Tool.findOne({ nama: new RegExp(`^${namaTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

      if (existing) {
        if (mode === 'skip') {
          skippedCount++;
          continue;
        } else if (mode === 'update') {
          existing.stok = Number(item.stok) || existing.stok;
          if (item.kategori) existing.kategori = item.kategori;
          if (item.satuan) existing.satuan = item.satuan;
          if (item.kondisi) existing.kondisi = item.kondisi;
          if (item.lokasi) existing.lokasi = item.lokasi;
          if (item.notes) existing.notes = item.notes;
          existing.updatedAt = nowWIB();
          await existing.save();
          updatedCount++;
          continue;
        }
      }

      // Mode is 'insert' or tool didn't exist
      const newTool = new Tool({
        nama: namaTrimmed,
        kategori: item.kategori || 'Umum',
        stok: Number(item.stok) || 1,
        satuan: item.satuan || 'unit',
        kondisi: item.kondisi || 'Baik',
        lokasi: item.lokasi || 'Head Office PT Mega Tama Enerco',
        notes: item.notes || '',
        createdAt: nowWIB(),
        updatedAt: nowWIB(),
      });
      await newTool.save();
      insertedCount++;
    }

    res.json({
      success: true,
      message: `Impor berhasil: ${insertedCount} ditambahkan, ${updatedCount} diperbarui, ${skippedCount} dilewati, ${failedCount} gagal.`,
      count: {
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
    });
  } catch (error) {
    console.error('Commit Tools Excel error:', error);
    res.status(500).json({ msg: 'Gagal menyimpan data impor: ' + error.message });
  }
});

// GET /api/tools/available - Get tools available for assignment (MUST be before /:id)
router.get('/available', auth, async (req, res) => {
  try {
    const tools = await Tool.find({ 
      $or: [
        { projectId: null },
        { projectId: { $exists: false } }
      ],
      kondisi: { $ne: 'Rusak' }
    }).sort({ nama: 1 }).lean();
    
    res.json(tools);
  } catch (error) {
    console.error('Get available tools error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tools/project/:projectId - Get tools assigned to a project (MUST be before /:id)
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const tools = await Tool.find({ projectId: req.params.projectId })
      .populate('assignedTo', 'fullName role')
      .populate('projectId', 'nama')
      .lean();
    
    res.json(tools);
  } catch (error) {
    console.error('Get project tools error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tools/my-tools - Get tools assigned to the current authenticated user (MUST be before /:id)
router.get('/my-tools', auth, async (req, res) => {
  try {
    const tools = await Tool.find({ assignedTo: req.user._id })
      .populate('assignedTo', 'fullName username role phone')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault')
      .sort({ updatedAt: -1 })
      .lean();

    // Fetch the latest movement record for each tool to show checkout context
    const toolIds = tools.map((t) => t._id);
    const latestMovements = await ToolMovement.aggregate([
      { $match: { toolId: { $in: toolIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$toolId',
          latestMovement: { $first: '$$ROOT' },
        },
      },
    ]);

    const movementMap = {};
    latestMovements.forEach((m) => {
      movementMap[m._id.toString()] = m.latestMovement;
    });

    const enriched = tools.map((t) => ({
      ...t,
      lastMovement: movementMap[t._id.toString()] || null,
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Get my-tools error:', error);
    res.status(500).json({ msg: 'Server error saat mengambil data alat saya' });
  }
});

// POST /api/tools/bulk-delete - Delete multiple tools and purge physical photos
router.post('/bulk-delete', auth, authorize('owner', 'asset_admin'), async (req, res) => {
  try {
    const { toolIds } = req.body;
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
      return res.status(400).json({ msg: 'Pilih setidaknya satu alat untuk dihapus' });
    }
    const tools = await Tool.find({ _id: { $in: toolIds } });
    for (const t of tools) {
      if (t.photo) deletePhysicalFile(t.photo);
    }
    await Tool.deleteMany({ _id: { $in: toolIds } });
    res.json({ msg: `${tools.length} alat berhasil dihapus`, count: tools.length });
  } catch (error) {
    console.error('Bulk delete tools error:', error);
    res.status(500).json({ msg: 'Server error saat menghapus alat massal' });
  }
});

// POST /api/tools/bulk-update-condition - Update condition for multiple tools
router.post('/bulk-update-condition', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), async (req, res) => {
  try {
    const { toolIds, kondisi, notes } = req.body;
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
      return res.status(400).json({ msg: 'Pilih setidaknya satu alat' });
    }
    if (!['Baik', 'Maintenance', 'Rusak'].includes(kondisi)) {
      return res.status(400).json({ msg: 'Kondisi tidak valid (Baik, Maintenance, Rusak)' });
    }
    await Tool.updateMany(
      { _id: { $in: toolIds } },
      { $set: { kondisi, lastChecked: new Date() } }
    );
    res.json({ msg: `Kondisi ${toolIds.length} alat berhasil diperbarui ke ${kondisi}`, count: toolIds.length });
  } catch (error) {
    console.error('Bulk update condition error:', error);
    res.status(500).json({ msg: 'Server error saat mengubah kondisi massal' });
  }
});

// POST /api/tools/bulk-relocate - Relocate multiple tools to warehouse/bin or project
router.post('/bulk-relocate', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), async (req, res) => {
  try {
    const { toolIds, warehouseId, binLocation, projectId, notes } = req.body;
    if (!Array.isArray(toolIds) || toolIds.length === 0) {
      return res.status(400).json({ msg: 'Pilih setidaknya satu alat' });
    }
    const updateFields = { lastChecked: new Date() };
    if (warehouseId) {
      updateFields.warehouseId = warehouseId;
      const wh = await Warehouse.findById(warehouseId).lean();
      if (wh) updateFields.lokasi = wh.name;
    }
    if (binLocation !== undefined) {
      updateFields.binLocation = binLocation;
      updateFields.binRef = binLocation;
    }
    if (projectId !== undefined) {
      updateFields.projectId = projectId || null;
    }

    await Tool.updateMany(
      { _id: { $in: toolIds } },
      { $set: updateFields }
    );

    // Record movement history for tracking
    const movementDocs = toolIds.map(id => ({
      toolId: id,
      action: projectId ? 'deploy_project' : 'warehouse_transfer',
      toWarehouseId: warehouseId || null,
      toBinLocation: binLocation || '',
      toProjectId: projectId || null,
      notes: notes || 'Relokasi massal via dashboard',
      performedBy: req.user._id,
      evidence: { serverTime: new Date() }
    }));
    try {
      await ToolMovement.insertMany(movementDocs);
    } catch (mErr) {
      console.warn('Failed inserting bulk movement docs:', mErr.message);
    }

    res.json({ msg: `${toolIds.length} alat berhasil direlokasi`, count: toolIds.length });
  } catch (error) {
    console.error('Bulk relocate tools error:', error);
    res.status(500).json({ msg: 'Server error saat relokasi massal' });
  }
});

// GET /api/tools/:id - Get single tool (MUST be after static routes)
router.get('/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findById(req.params.id)
      .populate('assignedTo', 'fullName username role phone')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault')
      .lean();
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json(tool);
  } catch (error) {
    console.error('Get tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/tools/:id/movements - Get audit trail of all movements for a tool
router.get('/:id/movements', auth, async (req, res) => {
  try {
    const movements = await ToolMovement.find({ toolId: req.params.id })
      .populate('byUserId', 'fullName username role')
      .populate('assignedTo', 'fullName username role')
      .populate('projectId', 'nama code')
      .populate('fromWarehouseId', 'name code')
      .populate('toWarehouseId', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    res.json(movements);
  } catch (error) {
    console.error('Get tool movements error:', error);
    res.status(500).json({ msg: 'Server error saat mengambil riwayat pergerakan alat' });
  }
});

// POST /api/tools/movement - Move tool (check-out, return, hand-over, transfer, relocation, etc.)
// Enforces GPS / manual override, live watermark photo, and automatic storage purging of previous photos
router.post('/movement', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const {
      toolId,
      action,
      qty,
      toWarehouseId,
      toBin,
      toLokasi,
      assignedTo,
      projectId,
      condition,
      lat,
      lng,
      accuracy,
      capturedAt,
      isManualGpsOverride,
      notes,
    } = req.body;

    if (!toolId || !action) {
      return res.status(400).json({ msg: 'toolId dan action wajib diisi' });
    }

    const tool = await Tool.findById(toolId);
    if (!tool) {
      return res.status(404).json({ msg: 'Alat tidak ditemukan' });
    }

    const userRole = req.user.role;
    const isOwnerOrAdmin = ['owner', 'director', 'asset_admin'].includes(userRole);
    const isSupervisor = userRole === 'supervisor';

    // Verify Action Permissions
    if (action === 'check_out') {
      if (!isOwnerOrAdmin && !isSupervisor) {
        return res.status(403).json({ msg: 'Check-out alat hanya dapat dilakukan oleh Supervisor atau Asset Admin' });
      }
    } else if (action === 'return') {
      const isCurrentHolder = tool.assignedTo && tool.assignedTo.toString() === req.user._id.toString();
      if (!isOwnerOrAdmin && !isSupervisor && !isCurrentHolder) {
        return res.status(403).json({ msg: 'Pengembalian alat hanya dapat dilakukan oleh pemegang alat, Supervisor, atau Asset Admin' });
      }
    } else {
      // hand_over, transfer, relocation, maintenance_in, maintenance_out, condition_change
      if (!isOwnerOrAdmin && !isSupervisor) {
        return res.status(403).json({ msg: 'Aksi ini memerlukan wewenang Supervisor atau Asset Admin' });
      }
    }

    // Validate GPS / Manual Override
    const hasGps = lat !== undefined && lat !== null && lat !== '' && !isNaN(Number(lat)) &&
                   lng !== undefined && lng !== null && lng !== '' && !isNaN(Number(lng));
    const manualOverride = isManualGpsOverride === 'true' || isManualGpsOverride === true;
    if (!hasGps) {
      if (!manualOverride) {
        return res.status(400).json({ msg: 'Lokasi GPS tidak terdeteksi. Aktifkan GPS pada perangkat atau minta Asset Admin untuk mengesahkan override manual.' });
      }
      if (!isOwnerOrAdmin) {
        return res.status(403).json({ msg: 'Hanya Asset Admin atau Owner yang dapat mengesahkan override manual GPS.' });
      }
    }

    // Capture Previous State for Audit Log
    const fromWarehouseId = tool.warehouseId || null;
    const fromBin = tool.binRef || '';
    const fromLokasi = tool.lokasi || '';

    // STORAGE OPTIMIZATION RULE:
    // When tools move, purge previous physical photos from server disk to save space while retaining metadata
    let purgedCount = 0;
    const previousMovementsWithPhotos = await ToolMovement.find({
      toolId: tool._id,
      'evidence.photo': { $ne: null },
      'evidence.photoPurged': { $ne: true },
    });

    for (const prev of previousMovementsWithPhotos) {
      if (prev.evidence && prev.evidence.photo) {
        deletePhysicalFile(prev.evidence.photo);
        prev.evidence.photoPurged = true;
        prev.evidence.photoPurgedAt = nowWIB();
        await prev.save();
        purgedCount++;
      }
    }

    // Also purge previous tool.photo if a new photo is uploaded
    if (req.file && tool.photo) {
      deletePhysicalFile(tool.photo);
    }

    // Target warehouse details
    let targetWh = null;
    if (toWarehouseId) {
      targetWh = await Warehouse.findById(toWarehouseId);
    }

    // Update Tool properties
    const now = nowWIB();
    tool.lastChecked = now;
    tool.lastMovedAt = now;
    if (req.file) {
      tool.photo = req.file.path;
    }

    let finalToLokasi = toLokasi || '';
    let finalToWarehouseId = toWarehouseId || tool.warehouseId;
    let finalToBin = toBin !== undefined ? toBin : (tool.binRef || '');

    switch (action) {
      case 'check_out':
        tool.assignedTo = assignedTo || req.user._id;
        tool.projectId = projectId || tool.projectId || null;
        finalToLokasi = toLokasi || (projectId ? 'On-Site' : 'In Use');
        tool.lokasi = finalToLokasi;
        break;

      case 'return':
        tool.assignedTo = null;
        tool.projectId = null;
        if (targetWh) {
          tool.warehouseId = targetWh._id;
          finalToWarehouseId = targetWh._id;
          finalToLokasi = targetWh.name + (toBin ? ` (${toBin})` : '');
        } else {
          finalToLokasi = toLokasi || 'Warehouse';
        }
        tool.lokasi = finalToLokasi;
        if (toBin !== undefined) tool.binRef = toBin;
        if (condition) tool.kondisi = condition;
        break;

      case 'hand_over':
        if (assignedTo) tool.assignedTo = assignedTo;
        if (projectId !== undefined) tool.projectId = projectId || null;
        finalToLokasi = toLokasi || 'In Use';
        tool.lokasi = finalToLokasi;
        break;

      case 'transfer':
        if (targetWh) {
          tool.warehouseId = targetWh._id;
          finalToWarehouseId = targetWh._id;
          finalToLokasi = targetWh.name + (toBin ? ` (${toBin})` : '');
        } else {
          finalToLokasi = toLokasi || 'Transferred';
        }
        tool.lokasi = finalToLokasi;
        if (toBin !== undefined) tool.binRef = toBin;
        if (projectId !== undefined) tool.projectId = projectId || null;
        break;

      case 'relocation':
        if (targetWh) {
          tool.warehouseId = targetWh._id;
          finalToWarehouseId = targetWh._id;
        }
        if (toBin) tool.binRef = toBin;
        finalToLokasi = (targetWh ? targetWh.name : (tool.lokasi || 'Warehouse')) + (toBin ? ` (${toBin})` : '');
        tool.lokasi = finalToLokasi;
        break;

      case 'maintenance_in':
        tool.kondisi = 'Maintenance';
        tool.lokasi = toLokasi || 'Workshop / Vendor Service';
        finalToLokasi = tool.lokasi;
        break;

      case 'maintenance_out':
        tool.kondisi = condition || 'Baik';
        if (targetWh) {
          tool.warehouseId = targetWh._id;
          finalToWarehouseId = targetWh._id;
          finalToLokasi = targetWh.name + (toBin ? ` (${toBin})` : '');
        } else {
          finalToLokasi = toLokasi || 'Warehouse';
        }
        tool.lokasi = finalToLokasi;
        if (toBin !== undefined) tool.binRef = toBin;
        break;

      case 'condition_change':
        if (condition) tool.kondisi = condition;
        break;

      default:
        break;
    }

    await tool.save();

    // Create ToolMovement record
    const movement = new ToolMovement({
      toolId: tool._id,
      fromWarehouseId,
      fromBin,
      fromLokasi,
      toWarehouseId: finalToWarehouseId || null,
      toBin: finalToBin || '',
      toLokasi: finalToLokasi,
      action,
      qty: Number(qty) || 1,
      byUserId: req.user._id,
      assignedTo: tool.assignedTo || null,
      projectId: tool.projectId || null,
      condition: tool.kondisi,
      evidence: {
        photo: req.file ? req.file.path : null,
        lat: hasGps ? Number(lat) : null,
        lng: hasGps ? Number(lng) : null,
        accuracy: accuracy ? Number(accuracy) : null,
        capturedAt: capturedAt ? new Date(capturedAt) : now,
        serverTime: now,
        isManualGpsOverride: manualOverride,
        notes: notes ? notes.trim() : '',
        photoPurged: false,
      },
    });

    await movement.save();

    const updatedTool = await Tool.findById(tool._id)
      .populate('assignedTo', 'fullName username role phone')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault')
      .lean();

    res.json({
      success: true,
      msg: 'Perpindahan alat berhasil dicatat',
      tool: updatedTool,
      movement,
      purgedCount,
    });
  } catch (error) {
    console.error('Record tool movement error:', error);
    res.status(500).json({ msg: 'Server error saat mencatat perpindahan alat' });
  }
});

// POST /api/tools - Create tool
router.post('/', auth, authorize('owner', 'director', 'asset_admin'), uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { nama, kategori, stok, satuan, kondisi, lokasi, qrCode, projectId, warehouseId, binRef, notes } = req.body;
    
    let whId = warehouseId || null;
    let computedLokasi = lokasi;
    if (whId) {
      const wh = await Warehouse.findById(whId);
      if (wh && (!lokasi || lokasi === 'Warehouse')) {
        computedLokasi = wh.name + (binRef ? ` (${binRef})` : '');
      }
    } else {
      const defaultWh = await Warehouse.findOne({ isDefault: true });
      if (defaultWh) {
        whId = defaultWh._id;
        if (!computedLokasi) {
          computedLokasi = defaultWh.name + (binRef ? ` (${binRef})` : '');
        }
      }
    }

    const tool = new Tool({
      nama,
      kategori,
      stok: Number(stok) || 0,
      satuan: satuan || 'unit',
      kondisi: kondisi || 'Baik',
      lokasi: computedLokasi || 'Warehouse',
      warehouseId: whId,
      binRef: binRef || '',
      qrCode,
      projectId: projectId || undefined,
      photo: req.file ? req.file.path : undefined,
      notes: notes || undefined,
      lastMovedAt: nowWIB(),
    });
    
    await tool.save();

    // Create initial register movement record
    try {
      const initialMovement = new ToolMovement({
        toolId: tool._id,
        toWarehouseId: whId,
        toBin: binRef || '',
        toLokasi: tool.lokasi,
        action: 'initial_register',
        qty: tool.stok || 1,
        byUserId: req.user._id,
        condition: tool.kondisi,
        evidence: {
          photo: tool.photo || null,
          serverTime: nowWIB(),
          notes: 'Pendaftaran inventaris alat baru',
          photoPurged: false,
        },
      });
      await initialMovement.save();
    } catch (movErr) {
      console.warn('Initial movement save warning:', movErr.message);
    }

    const populated = await Tool.findById(tool._id)
      .populate('assignedTo', 'fullName username role')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id - Update tool
router.put('/:id', auth, authorize('owner', 'director', 'asset_admin'), uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const allowedFields = ['nama', 'kategori', 'stok', 'satuan', 'kondisi', 'lokasi', 'qrCode', 'notes', 'warehouseId', 'binRef'];
    const updateData = { updatedAt: nowWIB() };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.file) {
      // Delete old photo if exists
      const existing = await Tool.findById(req.params.id);
      if (existing && existing.photo) {
        deletePhysicalFile(existing.photo);
      }
      updateData.photo = req.file.path;
    }

    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    )
      .populate('assignedTo', 'fullName username role')
      .populate('projectId', 'nama code')
      .populate('warehouseId', 'name code type geo zones isDefault');
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json(tool);
  } catch (error) {
    console.error('Update tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id/assign - Assign tool to user/project
router.put('/:id/assign', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), async (req, res) => {
  try {
    const { assignedTo, projectId } = req.body;
    
    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          assignedTo: assignedTo || undefined,
          projectId: projectId || undefined,
          lokasi: projectId ? 'On-Site' : 'Warehouse',
          lastChecked: nowWIB(),
        } 
      },
      { new: true }
    )
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama');
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json(tool);
  } catch (error) {
    console.error('Assign tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id/unassign - Unassign user from tool (keep on project)
router.put('/:id/unassign', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), async (req, res) => {
  try {
    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { 
        $unset: { assignedTo: 1 },
        $set: {
          lastChecked: nowWIB(),
          updatedAt: nowWIB(),
        }
      },
      { new: true }
    )
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama');
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json(tool);
  } catch (error) {
    console.error('Unassign tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id/return - Return tool to warehouse
router.put('/:id/return', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { kondisi } = req.body;
    const updateData = {
      lokasi: 'Warehouse',
      lastChecked: nowWIB(),
      updatedAt: nowWIB(),
    };

    if (kondisi) {
      updateData.kondisi = kondisi;
    }

    if (req.file) {
      updateData.photo = req.file.path;
    }

    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { 
        $unset: {
          assignedTo: 1,
          projectId: 1,
        },
        $set: updateData
      },
      { new: true }
    );
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json(tool);
  } catch (error) {
    console.error('Return tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/tools/:id - Delete tool
router.delete('/:id', auth, authorize('owner', 'asset_admin'), async (req, res) => {
  try {
    const tool = await Tool.findByIdAndDelete(req.params.id);
    
    if (!tool) {
      return res.status(404).json({ msg: 'Tool not found' });
    }
    
    res.json({ msg: 'Tool deleted' });
  } catch (error) {
    console.error('Delete tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
