const express = require('express');
const { Project, Supply, DailyReport } = require('../models');
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

// GET /api/projects/:id - Get single project (with supplies)
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'fullName')
      .populate('assignedTo', 'fullName role');
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Fetch supplies from separate collection
    const supplies = await Supply.find({ projectId: project._id }).sort({ createdAt: 1 });
    
    // Merge supplies into response for backward compatibility
    const projectObj = project.toObject();
    projectObj.supplies = supplies;
    
    res.json(projectObj);
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
        workItems: workItems ? JSON.parse(workItems) : [],
        createdBy: req.user._id,
      });
      
      await project.save();

      // Create supplies in separate collection
      if (supplies) {
        const parsedSupplies = JSON.parse(supplies);
        if (parsedSupplies.length > 0) {
          const supplyDocs = parsedSupplies.map(s => ({
            ...s,
            projectId: project._id,
          }));
          await Supply.insertMany(supplyDocs);
        }
      }

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
    
    // Process per-workitem updates (still embedded in project)
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
    
    // Process supply status updates (now in separate collection)
    const processedSupplyUpdates = [];
    if (supplyUpdates && Array.isArray(supplyUpdates)) {
      for (const update of supplyUpdates) {
        const supply = await Supply.findById(update.supplyId);
        if (supply && supply.projectId.toString() === req.params.id) {
          const snapshot = {
            supplyId: supply._id,
            item: supply.item,
            previousStatus: supply.status,
            newStatus: update.newStatus || supply.status,
            actualCost: Number(update.actualCost) || 0,
          };
          if (update.newStatus) supply.status = update.newStatus;
          supply.actualCost = Number(update.actualCost) || supply.actualCost || 0;
          await supply.save();
          processedSupplyUpdates.push(snapshot);
        }
      }
    }
    
    // Recalculate overall progress (cost-weighted, includes supplies)
    const supplies = await Supply.find({ projectId: project._id });
    project.progress = project.calculateProgress(supplies);
    
    // Create daily report in separate collection
    const report = new DailyReport({
      projectId: project._id,
      date: date ? new Date(date) : new Date(),
      progressPercent: project.progress,
      workItemUpdates: processedWorkUpdates,
      supplyUpdates: processedSupplyUpdates,
      weather,
      materials,
      workforce,
      notes,
      createdBy: req.user._id,
    });
    await report.save();
    
    if (project.progress >= 100) {
      project.status = 'Completed';
    } else if (project.progress > 0) {
      project.status = 'In Progress';
    }
    
    await project.save();

    // Return project with supplies for backward compatibility
    const projectObj = project.toObject();
    projectObj.supplies = supplies;

    res.status(201).json(projectObj);
  } catch (error) {
    console.error('Add daily report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/projects/:id - Delete project (also deletes related data)
router.delete('/:id', auth, authorize('owner'), async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Clean up related data in separate collections
    await Supply.deleteMany({ projectId: req.params.id });
    await DailyReport.deleteMany({ projectId: req.params.id });
    
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
    const supplies = await Supply.find({ projectId: project._id });
    project.progress = project.calculateProgress(supplies);
    if (project.progress >= 100) {
      project.status = 'Completed';
    } else if (project.progress > 0) {
      project.status = 'In Progress';
    }
    
    await project.save();

    const projectObj = project.toObject();
    projectObj.supplies = supplies;

    res.json(projectObj);
  } catch (error) {
    console.error('Update work item progress error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// === SUPPLY ROUTES (now using separate Supply collection) ===

// GET /api/projects/:id/supplies - Get all supplies for a project
router.get('/:id/supplies', auth, async (req, res) => {
  try {
    const supplies = await Supply.find({ projectId: req.params.id }).sort({ createdAt: 1 });
    res.json(supplies);
  } catch (error) {
    console.error('Get project supplies error:', error);
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

    const supply = new Supply({
      projectId: project._id,
      item,
      qty,
      unit: unit || 'pcs',
      cost,
      actualCost: 0,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status: status || 'Pending',
    });

    await supply.save();

    // Recalculate project progress
    const supplies = await Supply.find({ projectId: project._id });
    project.progress = project.calculateProgress(supplies);
    await project.save();
    
    res.status(201).json(supply);
  } catch (error) {
    console.error('Add project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/supplies/:supplyId - Update a supply
router.put('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const supply = await Supply.findOne({ _id: req.params.supplyId, projectId: req.params.id });
    if (!supply) {
      return res.status(404).json({ msg: 'Supply not found' });
    }

    // Update allowed fields
    const fields = ['item', 'qty', 'unit', 'cost', 'actualCost', 'status'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        supply[field] = req.body[field];
      }
    });
    
    if (req.body.startDate !== undefined) supply.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
    if (req.body.endDate !== undefined) supply.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
    if (req.body.deliveryDate !== undefined) supply.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : undefined;

    await supply.save();

    // Recalculate project progress
    const project = await Project.findById(req.params.id);
    if (project) {
      const supplies = await Supply.find({ projectId: project._id });
      project.progress = project.calculateProgress(supplies);
      await project.save();
    }
    
    res.json(supply);
  } catch (error) {
    console.error('Update project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/projects/:id/supplies/:supplyId - Delete a supply
router.delete('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const supply = await Supply.findOneAndDelete({ _id: req.params.supplyId, projectId: req.params.id });
    if (!supply) {
      return res.status(404).json({ msg: 'Supply not found' });
    }

    // Recalculate project progress
    const project = await Project.findById(req.params.id);
    if (project) {
      const supplies = await Supply.find({ projectId: project._id });
      project.progress = project.calculateProgress(supplies);
      await project.save();
    }
    
    res.json({ msg: 'Supply deleted successfully' });
  } catch (error) {
    console.error('Delete project supply error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
