const express = require('express');
const { Warehouse, Tool } = require('../models');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_HEAD_OFFICE_SEED = {
  name: 'Head Office PT Mega Tama Enerco',
  code: 'WH-HQ',
  type: 'head_office',
  address: 'PT Mega Tama Enerco Head Office',
  geo: {
    lat: -7.175077420272807,
    lng: 107.57089981757514,
    radiusMeters: 150,
  },
  zones: [
    {
      name: 'Zona A - Tool Crib & Power Tools',
      code: 'Z-A',
      racks: [
        {
          name: 'Rak 1 (Hand Tools)',
          bins: [
            { label: 'A-01 (Kunci & Tang)', capacity: 20 },
            { label: 'A-02 (Gerinda & Bor)', capacity: 15 },
          ],
        },
        {
          name: 'Rak 2 (Electrical & Measuring)',
          bins: [
            { label: 'A-03 (Multimeter & Laser)', capacity: 20 },
          ],
        },
      ],
    },
    {
      name: 'Zona B - Heavy Machinery & Generator',
      code: 'Z-B',
      racks: [
        {
          name: 'Floor Bay 1',
          bins: [
            { label: 'B-01 (Genset & Compressor)', capacity: 5 },
          ],
        },
      ],
    },
    {
      name: 'Zona C - Safety & Consumables',
      code: 'Z-C',
      racks: [
        {
          name: 'Rak Safety',
          bins: [
            { label: 'C-01 (Helm & Harness)', capacity: 50 },
          ],
        },
      ],
    },
  ],
  isDefault: true,
  isActive: true,
};

// Seed default warehouse if collection is empty
async function ensureDefaultWarehouse() {
  const count = await Warehouse.countDocuments();
  if (count === 0) {
    try {
      const defaultWh = new Warehouse(DEFAULT_HEAD_OFFICE_SEED);
      await defaultWh.save();
      console.log('✅ Seeded default Head Office warehouse: WH-HQ');
      return defaultWh;
    } catch (err) {
      console.warn('⚠️ Could not seed default warehouse:', err.message);
    }
  }
  return null;
}

// GET /api/warehouses - List all warehouses
router.get('/', auth, async (req, res) => {
  try {
    await ensureDefaultWarehouse();

    const { active, search } = req.query;
    const query = {};

    if (active === 'true') {
      query.isActive = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }

    const warehouses = await Warehouse.find(query)
      .populate('managerId', 'fullName username role phone')
      .populate('projectId', 'nama code')
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    // Compute toolsCount for each warehouse
    const toolCounts = await Tool.aggregate([
      {
        $group: {
          _id: '$warehouseId',
          totalTools: { $sum: 1 },
          totalUnits: { $sum: '$stok' },
        },
      },
    ]);

    const toolCountMap = {};
    toolCounts.forEach((c) => {
      if (c._id) {
        toolCountMap[c._id.toString()] = { count: c.totalTools, units: c.totalUnits };
      }
    });

    const enrichedWarehouses = warehouses.map((wh) => {
      const stats = toolCountMap[wh._id.toString()] || { count: 0, units: 0 };
      return {
        ...wh,
        toolsCount: stats.count,
        toolsUnits: stats.units,
      };
    });

    res.json(enrichedWarehouses);
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ msg: 'Server error saat mengambil data gudang' });
  }
});

// GET /api/warehouses/:id - Get warehouse detail
router.get('/:id', auth, async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id)
      .populate('managerId', 'fullName username role phone')
      .populate('projectId', 'nama code')
      .lean();

    if (!warehouse) {
      return res.status(404).json({ msg: 'Gudang tidak ditemukan' });
    }

    // Get count of tools currently in this warehouse
    const toolsCount = await Tool.countDocuments({ warehouseId: warehouse._id });
    res.json({ ...warehouse, toolsCount });
  } catch (error) {
    console.error('Get warehouse error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/warehouses - Create warehouse
router.post('/', auth, authorize('owner', 'director', 'asset_admin', 'pm'), async (req, res) => {
  try {
    const { name, code, type, address, geo, projectId, managerId, zones, isDefault, isActive } = req.body;

    if (!name || !code) {
      return res.status(400).json({ msg: 'Nama dan kode gudang wajib diisi' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await Warehouse.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ msg: `Kode gudang "${cleanCode}" sudah digunakan` });
    }

    if (isDefault) {
      await Warehouse.updateMany({}, { $set: { isDefault: false } });
    }

    const warehouse = new Warehouse({
      name: name.trim(),
      code: cleanCode,
      type: type || 'central_warehouse',
      address: address ? address.trim() : undefined,
      geo: {
        lat: geo && geo.lat !== undefined ? Number(geo.lat) : -7.175077420272807,
        lng: geo && geo.lng !== undefined ? Number(geo.lng) : 107.57089981757514,
        radiusMeters: geo && geo.radiusMeters ? Number(geo.radiusMeters) : 150,
      },
      projectId: projectId || null,
      managerId: managerId || null,
      zones: Array.isArray(zones) ? zones : [],
      isDefault: !!isDefault,
      isActive: isActive !== undefined ? !!isActive : true,
    });

    await warehouse.save();
    res.status(201).json(warehouse);
  } catch (error) {
    console.error('Create warehouse error:', error);
    res.status(500).json({ msg: 'Server error saat membuat gudang baru' });
  }
});

// PUT /api/warehouses/:id - Update warehouse
router.put('/:id', auth, authorize('owner', 'director', 'asset_admin', 'pm'), async (req, res) => {
  try {
    const { name, code, type, address, geo, projectId, managerId, zones, isDefault, isActive } = req.body;

    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ msg: 'Gudang tidak ditemukan' });
    }

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode !== warehouse.code) {
        const existing = await Warehouse.findOne({ code: cleanCode, _id: { $ne: warehouse._id } });
        if (existing) {
          return res.status(400).json({ msg: `Kode gudang "${cleanCode}" sudah digunakan` });
        }
        warehouse.code = cleanCode;
      }
    }

    if (name) warehouse.name = name.trim();
    if (type) warehouse.type = type;
    if (address !== undefined) warehouse.address = address ? address.trim() : '';

    if (geo) {
      if (geo.lat !== undefined) warehouse.geo.lat = Number(geo.lat);
      if (geo.lng !== undefined) warehouse.geo.lng = Number(geo.lng);
      if (geo.radiusMeters !== undefined) warehouse.geo.radiusMeters = Number(geo.radiusMeters);
    }

    if (projectId !== undefined) warehouse.projectId = projectId || null;
    if (managerId !== undefined) warehouse.managerId = managerId || null;
    if (Array.isArray(zones)) warehouse.zones = zones;
    if (isActive !== undefined) warehouse.isActive = !!isActive;

    if (isDefault) {
      await Warehouse.updateMany({ _id: { $ne: warehouse._id } }, { $set: { isDefault: false } });
      warehouse.isDefault = true;
    } else if (isDefault === false && warehouse.isDefault) {
      // Don't unmark default if it's the only one
      const otherCount = await Warehouse.countDocuments({ _id: { $ne: warehouse._id }, isDefault: true });
      if (otherCount > 0) {
        warehouse.isDefault = false;
      }
    }

    await warehouse.save();
    res.json(warehouse);
  } catch (error) {
    console.error('Update warehouse error:', error);
    res.status(500).json({ msg: 'Server error saat memperbarui data gudang' });
  }
});

// DELETE /api/warehouses/:id - Delete warehouse (only if no tools assigned)
router.delete('/:id', auth, authorize('owner', 'asset_admin'), async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ msg: 'Gudang tidak ditemukan' });
    }

    if (warehouse.isDefault) {
      return res.status(400).json({ msg: 'Gudang default (Head Office) tidak dapat dihapus' });
    }

    const assignedToolsCount = await Tool.countDocuments({ warehouseId: warehouse._id });
    if (assignedToolsCount > 0) {
      return res.status(400).json({
        msg: `Tidak dapat menghapus gudang karena masih terdapat ${assignedToolsCount} alat yang tersimpan di dalamnya. Silakan pindahkan alat terlebih dahulu.`,
      });
    }

    await Warehouse.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Gudang berhasil dihapus' });
  } catch (error) {
    console.error('Delete warehouse error:', error);
    res.status(500).json({ msg: 'Server error saat menghapus gudang' });
  }
});

module.exports = router;
