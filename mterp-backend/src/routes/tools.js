const express = require('express');
const ExcelJS = require('exceljs');
const { Tool } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { nowWIB } = require('../utils/date');

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
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama')
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
    const { search, kondisi, projectId, columns, headers } = req.query;

    const allTools = await Tool.find()
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama')
      .sort({ nama: 1 })
      .lean();

    // Filter tools based on query params
    const filteredTools = allTools.filter(t => {
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

// GET /api/tools/:id - Get single tool (MUST be after static routes)
router.get('/:id', auth, async (req, res) => {
  try {
    const tool = await Tool.findById(req.params.id)
      .populate('assignedTo', 'fullName')
      .populate('projectId', 'nama')
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

// POST /api/tools - Create tool
router.post('/', auth, authorize('owner', 'director', 'asset_admin'), uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { nama, kategori, stok, satuan, kondisi, lokasi, qrCode, projectId } = req.body;
    
    const tool = new Tool({
      nama,
      kategori,
      stok: Number(stok) || 0,
      satuan: satuan || 'unit',
      kondisi: kondisi || 'Baik',
      lokasi,
      qrCode,
      projectId: projectId || undefined,
      photo: req.file ? req.file.path : undefined,
    });
    
    await tool.save();
    res.status(201).json(tool);
  } catch (error) {
    console.error('Create tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id - Update tool
router.put('/:id', auth, authorize('owner', 'director', 'asset_admin'), uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const allowedFields = ['nama', 'kategori', 'stok', 'satuan', 'kondisi', 'lokasi', 'qrCode', 'notes'];
    const updateData = { updatedAt: nowWIB() };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.file) {
      updateData.photo = req.file.path;
    }

    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    
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
