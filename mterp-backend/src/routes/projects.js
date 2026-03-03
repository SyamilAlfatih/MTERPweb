const express = require('express');
const { Project } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// GET /api/projects - Get all projects
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Workers can only see projects assigned to them or created by them
    if (req.user.role === 'worker') {
      query = {
        $or: [
          { assignedTo: req.user._id },
          { createdBy: req.user._id }
        ]
      };
    }
    
    const projects = await Project.find(query)
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 });
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/:id - Get single project
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'fullName')
      .populate('assignedTo', 'fullName role');
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects - Create project
router.post('/', auth, authorize('owner', 'director'), uploadLimiter,
  upload.fields([
    { name: 'shopDrawing', maxCount: 1 },
    { name: 'hse', maxCount: 1 },
    { name: 'manPowerList', maxCount: 1 },
    { name: 'materialList', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { nama, lokasi, description, totalBudget, startDate, endDate, supplies, workItems } = req.body;
      
      const documents = {};
      if (req.files) {
        Object.keys(req.files).forEach(key => {
          if (req.files[key] && req.files[key][0]) {
            documents[key] = req.files[key][0].path;
          }
        });
      }
      
      const project = new Project({
        nama,
        lokasi,
        description,
        totalBudget: Number(totalBudget) || 0,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        documents,
        supplies: supplies ? JSON.parse(supplies) : [],
        workItems: workItems ? JSON.parse(workItems) : [],
        createdBy: req.user._id,
      });
      
      await project.save();
      res.status(201).json(project);
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// PUT /api/projects/:id - Update project
router.put('/:id', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const allowedFields = ['nama', 'lokasi', 'description', 'totalBudget', 'status', 'startDate', 'endDate'];
    const updateData = { updatedAt: new Date() };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/progress - Update project progress
router.put('/:id/progress', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const { progress } = req.body;
    
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          progress: Math.min(100, Math.max(0, Number(progress))),
          status: Number(progress) >= 100 ? 'Completed' : 'In Progress'
        } 
      },
      { new: true }
    );
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/daily-report - Add daily report with per-item progress
router.post('/:id/daily-report', auth, authorize('supervisor', 'owner', 'director'), async (req, res) => {
  try {
    const { workItemUpdates, supplyUpdates, weather, materials, workforce, notes, date } = req.body;
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    // Process per-workitem updates
    const processedWorkUpdates = [];
    if (workItemUpdates && Array.isArray(workItemUpdates)) {
      for (const update of workItemUpdates) {
        const workItem = project.workItems.id(update.workItemId);
        if (workItem) {
          const snapshot = {
            workItemId: workItem._id,
            name: workItem.name,
            previousProgress: workItem.progress || 0,
            newProgress: Math.min(100, Math.max(0, Number(update.newProgress) || 0)),
            actualCost: Number(update.actualCost) || 0,
          };
          workItem.progress = snapshot.newProgress;
          workItem.actualCost = snapshot.actualCost;
          processedWorkUpdates.push(snapshot);
        }
      }
    }
    
    // Process supply status updates
    const processedSupplyUpdates = [];
    if (supplyUpdates && Array.isArray(supplyUpdates)) {
      for (const update of supplyUpdates) {
        const supply = project.supplies.id(update.supplyId);
        if (supply) {
          const snapshot = {
            supplyId: supply._id,
            item: supply.item,
            previousStatus: supply.status,
            newStatus: update.newStatus || supply.status,
            actualCost: Number(update.actualCost) || 0,
          };
          if (update.newStatus) supply.status = update.newStatus;
          supply.actualCost = Number(update.actualCost) || supply.actualCost || 0;
          processedSupplyUpdates.push(snapshot);
        }
      }
    }
    
    // Recalculate overall progress (cost-weighted, includes supplies)
    project.progress = project.calculateProgress();
    
    const report = {
      date: date ? new Date(date) : new Date(),
      progressPercent: project.progress,
      workItemUpdates: processedWorkUpdates,
      supplyUpdates: processedSupplyUpdates,
      weather,
      materials,
      workforce,
      notes,
      createdBy: req.user._id,
    };
    
    project.dailyReports.push(report);
    
    if (project.progress >= 100) {
      project.status = 'Completed';
    } else if (project.progress > 0) {
      project.status = 'In Progress';
    }
    
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    console.error('Add daily report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', auth, authorize('owner'), async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    res.json({ msg: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/work-items/:itemId/progress - Update individual work item progress
router.put('/:id/work-items/:itemId/progress', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const { progress, actualCost } = req.body;
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }
    
    const workItem = project.workItems.id(req.params.itemId);
    if (!workItem) {
      return res.status(404).json({ msg: 'Work item not found' });
    }
    
    if (progress !== undefined) {
      workItem.progress = Math.min(100, Math.max(0, Number(progress)));
    }
    if (actualCost !== undefined) {
      workItem.actualCost = Number(actualCost) || 0;
    }
    
    // Recalculate overall project progress (cost-weighted)
    project.progress = project.calculateProgress();
    if (project.progress >= 100) {
      project.status = 'Completed';
    } else if (project.progress > 0) {
      project.status = 'In Progress';
    }
    
    await project.save();
    res.json(project);
  } catch (error) {
    console.error('Update work item progress error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/supplies - Add a supply
router.post('/:id/supplies', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const { item, qty, unit, cost, startDate, endDate, status } = req.body;

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    project.supplies.push({
      item,
      qty,
      unit: unit || 'pcs',
      cost,
      actualCost: 0,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status: status || 'Pending',
    });

    project.progress = project.calculateProgress();
    await project.save();
    
    res.status(201).json(project.supplies[project.supplies.length - 1]);
  } catch (error) {
    console.error('Add project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/supplies/:supplyId - Update a supply
router.put('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const supply = project.supplies.id(req.params.supplyId);
    if (!supply) {
      return res.status(404).json({ msg: 'Supply not found' });
    }

    // Update fields
    const fields = ['item', 'qty', 'unit', 'cost', 'actualCost', 'status'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        supply[field] = req.body[field];
      }
    });
    
    if (req.body.startDate !== undefined) supply.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
    if (req.body.endDate !== undefined) supply.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
    if (req.body.deliveryDate !== undefined) supply.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : undefined;

    project.progress = project.calculateProgress();
    await project.save();
    
    res.json(supply);
  } catch (error) {
    console.error('Update project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/projects/:id/supplies/:supplyId - Delete a supply
router.delete('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    project.supplies.pull(req.params.supplyId);

    project.progress = project.calculateProgress();
    await project.save();
    
    res.json({ msg: 'Supply deleted successfully' });
  } catch (error) {
    console.error('Delete project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
