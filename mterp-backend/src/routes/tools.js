const express = require('express');
const { Tool } = require('../models');
const { auth, authorize } = require('../middleware/auth');

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
      .sort({ nama: 1 });
    
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
      .populate('projectId', 'nama');
    res.json(tools);
  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({ msg: 'Server error' });
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
    }).sort({ nama: 1 });
    
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
      .populate('projectId', 'nama');
    
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
      .populate('projectId', 'nama');
    
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
router.post('/', auth, authorize('owner', 'director', 'asset_admin'), async (req, res) => {
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
    });
    
    await tool.save();
    res.status(201).json(tool);
  } catch (error) {
    console.error('Create tool error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/tools/:id - Update tool
router.put('/:id', auth, authorize('owner', 'director', 'asset_admin'), async (req, res) => {
  try {
    const allowedFields = ['nama', 'kategori', 'stok', 'satuan', 'kondisi', 'lokasi', 'qrCode', 'notes'];
    const updateData = { updatedAt: new Date() };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

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
          lastChecked: new Date(),
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

// PUT /api/tools/:id/return - Return tool to warehouse
router.put('/:id/return', auth, authorize('owner', 'director', 'asset_admin', 'supervisor'), async (req, res) => {
  try {
    const tool = await Tool.findByIdAndUpdate(
      req.params.id,
      { 
        $unset: {
          assignedTo: 1,
          projectId: 1,
        },
        $set: {
          lokasi: 'Warehouse',
          lastChecked: new Date(),
          updatedAt: new Date(),
        }
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
