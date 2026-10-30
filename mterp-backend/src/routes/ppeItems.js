const express = require('express');
const fs = require('fs');
const path = require('path');
const { PPEItem, Project, Warehouse } = require('../models');
const { auth, authorize } = require('../middleware/auth');
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

// Category prefixes for automatic code generation
const CATEGORY_PREFIXES = {
  head_protection: 'HLM',
  foot_leg_protection: 'BOT',
  fall_protection: 'HAR',
  eye_face_protection: 'KDK',
  hand_arm_protection: 'GLV',
  respiratory_protection: 'MSK',
  hearing_protection: 'EAR',
  body_protective_clothing: 'APP',
  other: 'APD',
};

// GET /api/ppe-items/repo-templates - Browse standard regulation repository
router.get('/repo-templates', (req, res) => {
  res.json({
    success: true,
    data: PPE_REGULATION_REPOSITORY,
  });
});

// GET /api/ppe-items - List PPE items with filters
router.get('/', auth, async (req, res) => {
  try {
    const {
      search,
      category,
      status,
      condition,
      projectId,
      all,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      query.status = 'active'; // Default to active items
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (condition && condition !== 'all') {
      query.condition = condition;
    }

    if (projectId && projectId !== 'all') {
      query.projectId = projectId;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { code: searchRegex },
        { name: searchRegex },
        { brand: searchRegex },
        { modelNumber: searchRegex },
        { location: searchRegex },
        { 'standardRegulation.indonesian': searchRegex },
        { 'standardRegulation.international': searchRegex },
      ];
    }

    // If caller requests all active items for dropdown/multi-select
    if (all === 'true') {
      const allItems = await PPEItem.find(query)
        .sort({ category: 1, name: 1 })
        .populate('projectId', 'nama lokasi')
        .populate('warehouseId', 'name code type address zones isDefault')
        .lean();

      return res.json({
        success: true,
        data: allItems,
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      PPEItem.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('projectId', 'nama lokasi')
        .populate('warehouseId', 'name code type address zones isDefault')
        .populate('createdBy', 'fullName username role')
        .lean(),
      PPEItem.countDocuments(query),
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
    console.error('Error fetching PPE items:', error);
    res.status(500).json({ msg: 'Gagal mengambil daftar APD', error: error.message });
  }
});

// GET /api/ppe-items/:id - Get single PPE item details
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PPEItem.findById(id)
      .populate('projectId', 'nama lokasi')
      .populate('warehouseId', 'name code type address zones isDefault')
      .populate('createdBy', 'fullName username role')
      .lean();

    if (!item) {
      return res.status(404).json({ msg: 'Item APD tidak ditemukan' });
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Error fetching PPE item detail:', error);
    res.status(500).json({ msg: 'Gagal mengambil detail APD', error: error.message });
  }
});

// POST /api/ppe-items - Add new PPE item to master catalog
router.post('/', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    let {
      code,
      name,
      category,
      categoryLabel,
      brand,
      modelNumber,
      totalQty,
      availableQty,
      unit,
      condition,
      warehouseId,
      binRef,
      location,
      projectId,
      templateId,
      standardRegulation,
      guide,
      notes,
    } = req.body;

    if (!name) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(400).json({ msg: 'Nama APD wajib diisi' });
    }

    // Parse JSON if passed through FormData
    if (typeof standardRegulation === 'string') {
      try {
        standardRegulation = JSON.parse(standardRegulation);
      } catch (e) {
        standardRegulation = {};
      }
    }

    if (typeof guide === 'string') {
      try {
        guide = JSON.parse(guide);
      } catch (e) {
        guide = {};
      }
    }

    // If templateId provided and fields not fully given, merge with standard regulation repo
    if (templateId) {
      const template = PPE_REGULATION_REPOSITORY.find((t) => t.templateId === templateId);
      if (template) {
        if (!category) category = template.category;
        if (!categoryLabel) categoryLabel = template.categoryLabel;
        if (!unit) unit = template.unit;
        standardRegulation = {
          indonesian: standardRegulation?.indonesian || template.standardRegulation.indonesian,
          international: standardRegulation?.international || template.standardRegulation.international,
          riskLevel: standardRegulation?.riskLevel || template.standardRegulation.riskLevel,
          colorCode: standardRegulation?.colorCode || template.colorCode,
          mandatoryZones: standardRegulation?.mandatoryZones || template.mandatoryZones,
        };
        guide = {
          description: guide?.description || template.guide.description,
          preUseInspection: guide?.preUseInspection || template.guide.preUseInspection,
          wearingSteps: guide?.wearingSteps || template.guide.wearingSteps,
          maintenance: guide?.maintenance || template.guide.maintenance,
          dosAndDonts: guide?.dosAndDonts || template.guide.dosAndDonts,
          expiryYears: guide?.expiryYears || template.expiryYears || 5,
        };
      }
    }

    // Auto-generate code if empty
    if (!code || !code.trim()) {
      const prefix = CATEGORY_PREFIXES[category] || 'APD';
      const count = await PPEItem.countDocuments();
      code = `APD-${prefix}-${String(count + 1).padStart(3, '0')}`;
    } else {
      code = code.trim().toUpperCase();
      const existing = await PPEItem.findOne({ code });
      if (existing) {
        if (req.file) deletePhysicalFile(req.file.path);
        return res.status(400).json({ msg: `Kode APD "${code}" sudah digunakan. Gunakan kode lain.` });
      }
    }

    const totalQtyNum = Math.max(0, parseInt(totalQty, 10) || 1);
    const availQtyNum = availableQty !== undefined ? Math.max(0, parseInt(availableQty, 10)) : totalQtyNum;

    // Resolve registered warehouse
    let resolvedWarehouseId = null;
    let resolvedLocation = location || '';
    if (warehouseId) {
      const wh = await Warehouse.findById(warehouseId).select('name code address');
      if (wh) {
        resolvedWarehouseId = wh._id;
        resolvedLocation = wh.name;
        if (binRef && binRef.trim()) {
          resolvedLocation = `${wh.name} (${binRef.trim()})`;
        }
      }
    } else {
      const defaultWh = await Warehouse.findOne({ isDefault: true }).select('name code');
      if (defaultWh) {
        resolvedWarehouseId = defaultWh._id;
        resolvedLocation = defaultWh.name;
      }
    }

    const newItem = new PPEItem({
      code,
      name: name.trim(),
      category: category || 'head_protection',
      categoryLabel: categoryLabel || 'Pelindung Kepala',
      brand: brand || '',
      modelNumber: modelNumber || '',
      totalQty: totalQtyNum,
      availableQty: availQtyNum,
      inUseQty: 0,
      damagedQty: 0,
      unit: unit || 'Unit',
      condition: condition || 'Baik',
      warehouseId: resolvedWarehouseId,
      binRef: binRef || '',
      location: resolvedLocation || 'Head Office PT Mega Tama Enerco',
      projectId: projectId || null,
      status: 'active',
      photo: req.file ? req.file.path : null,
      templateId: templateId || null,
      standardRegulation: standardRegulation || {
        indonesian: 'Permenakertrans No. PER.08/MEN/VII/2010; UU No. 1/1970',
        international: 'OSHA 29 CFR 1926; ANSI/EN Standards',
        riskLevel: 'Kritis',
      },
      guide: guide || {
        description: 'Standar penggunaan APD resmi perusahaan.',
        preUseInspection: ['Periksa kelayakan fisik sebelum pemakaian.'],
        wearingSteps: ['Gunakan sesuai instruksi dan ukuran tubuh.'],
        maintenance: ['Bersihkan dan simpan di lemari APD setelah selesai kerja.'],
        dosAndDonts: { dos: ['Selalu gunakan di zona wajib'], donts: ['Dilarang memodifikasi'] },
        expiryYears: 5,
      },
      notes: notes || '',
      createdBy: req.user?._id || null,
    });

    await newItem.save();
    const populatedItem = await PPEItem.findById(newItem._id)
      .populate('warehouseId', 'name code type address zones isDefault')
      .populate('projectId', 'nama lokasi')
      .lean();

    res.status(201).json({
      success: true,
      msg: `Item APD "${newItem.name}" (${newItem.code}) berhasil ditambahkan ke Master Catalog`,
      data: populatedItem,
    });
  } catch (error) {
    if (req.file) deletePhysicalFile(req.file.path);
    console.error('Error creating PPE item:', error);
    res.status(500).json({ msg: 'Gagal menambahkan item APD', error: error.message });
  }
});

// PUT /api/ppe-items/:id - Update PPE item and customized SOP
router.put('/:id', auth, uploadLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PPEItem.findById(id);
    if (!item) {
      if (req.file) deletePhysicalFile(req.file.path);
      return res.status(404).json({ msg: 'Item APD tidak ditemukan' });
    }

    let {
      code,
      name,
      category,
      categoryLabel,
      brand,
      modelNumber,
      totalQty,
      availableQty,
      inUseQty,
      damagedQty,
      unit,
      condition,
      warehouseId,
      binRef,
      location,
      projectId,
      status,
      standardRegulation,
      guide,
      notes,
    } = req.body;

    if (code && code.trim().toUpperCase() !== item.code) {
      const existing = await PPEItem.findOne({ code: code.trim().toUpperCase() });
      if (existing) {
        if (req.file) deletePhysicalFile(req.file.path);
        return res.status(400).json({ msg: `Kode APD "${code}" sudah dipakai oleh item lain` });
      }
      item.code = code.trim().toUpperCase();
    }

    if (name) item.name = name.trim();
    if (category) item.category = category;
    if (categoryLabel) item.categoryLabel = categoryLabel;
    if (brand !== undefined) item.brand = brand;
    if (modelNumber !== undefined) item.modelNumber = modelNumber;
    if (unit !== undefined) item.unit = unit;
    if (condition !== undefined) item.condition = condition;

    // Handle registered warehouse
    if (warehouseId !== undefined) {
      if (warehouseId) {
        const wh = await Warehouse.findById(warehouseId).select('name code address');
        if (wh) {
          item.warehouseId = wh._id;
          item.location = wh.name;
          if (binRef && binRef.trim()) {
            item.location = `${wh.name} (${binRef.trim()})`;
          }
        }
      } else {
        item.warehouseId = null;
      }
    }
    if (binRef !== undefined) item.binRef = binRef;
    if (location !== undefined && !warehouseId) item.location = location;
    if (projectId !== undefined) item.projectId = projectId || null;
    if (status !== undefined) item.status = status;
    if (notes !== undefined) item.notes = notes;

    if (totalQty !== undefined) item.totalQty = Math.max(0, parseInt(totalQty, 10));
    if (availableQty !== undefined) item.availableQty = Math.max(0, parseInt(availableQty, 10));
    if (inUseQty !== undefined) item.inUseQty = Math.max(0, parseInt(inUseQty, 10));
    if (damagedQty !== undefined) item.damagedQty = Math.max(0, parseInt(damagedQty, 10));

    // Photo replacement rule
    if (req.file) {
      if (item.photo) deletePhysicalFile(item.photo);
      item.photo = req.file.path;
    }

    // Update Regulations & SOP Guide
    if (standardRegulation) {
      if (typeof standardRegulation === 'string') {
        try {
          standardRegulation = JSON.parse(standardRegulation);
        } catch (e) {}
      }
      item.standardRegulation = { ...item.standardRegulation.toObject(), ...standardRegulation };
    }

    if (guide) {
      if (typeof guide === 'string') {
        try {
          guide = JSON.parse(guide);
        } catch (e) {}
      }
      item.guide = { ...item.guide.toObject(), ...guide };
    }

    await item.save();

    const populatedItem = await PPEItem.findById(item._id)
      .populate('warehouseId', 'name code type address zones isDefault')
      .populate('projectId', 'nama lokasi')
      .lean();

    res.json({
      success: true,
      msg: `Data APD "${item.name}" berhasil diperbarui`,
      data: populatedItem,
    });
  } catch (error) {
    if (req.file) deletePhysicalFile(req.file.path);
    console.error('Error updating PPE item:', error);
    res.status(500).json({ msg: 'Gagal memperbarui item APD', error: error.message });
  }
});

// DELETE /api/ppe-items/:id - Remove PPE item from master
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PPEItem.findById(id);
    if (!item) {
      return res.status(404).json({ msg: 'Item APD tidak ditemukan' });
    }

    if (item.photo) {
      deletePhysicalFile(item.photo);
    }

    await PPEItem.findByIdAndDelete(id);

    res.json({
      success: true,
      msg: `Item APD "${item.name}" (${item.code}) berhasil dihapus dari Master APD`,
    });
  } catch (error) {
    console.error('Error deleting PPE item:', error);
    res.status(500).json({ msg: 'Gagal menghapus item APD', error: error.message });
  }
});

module.exports = router;

