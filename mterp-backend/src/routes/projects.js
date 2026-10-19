const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Project, Supply, DailyReport, MaterialLog, ProjectReport, ProjectTask, ProjectCalendar, ProjectResource, RABItem } = require('../models');
const bcrypt = require('bcryptjs');
const { auth, authorize, authOrApiKey } = require('../middleware/auth');
const { withTransaction } = require('../utils/transaction');
const { ensureProjectTasksFromLegacy, syncProjectTasksToProjectEntities } = require('../utils/projectSync');
const { calculateProjectProgress } = require('../utils/projectProgress');
const { recalculateProjectSchedule } = require('../utils/scheduling');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const projectExcelService = require('../services/projectExcelService');
const { parseWIBDate, nowWIB, wibDayRange } = require('../utils/date');
const { notify, notifyByRole } = require('../utils/notify');
const fs = require('fs');
const path = require('path');
const { convertToWebP, deleteLocalFile } = require('../utils/imageProcessor');

// GET /api/projects - Get all projects
// Accepts JWT Bearer token OR X-API-Key header (for external integrations like EnercoSafe)
router.get('/', authOrApiKey, async (req, res) => {
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
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// === IMPORT FROM SPREADSHEET ===

// Helper: add a styled header row + data rows to an ExcelJS worksheet
// (Delegated to projectExcelService)

// GET /api/projects/import-template - Download a blank .xlsx template matching ERP WBS Wizard
router.get('/import-template', auth, authorize('owner', 'director'), async (req, res) => {
  try {
    const buffer = await projectExcelService.generateWbsTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MTERP_Project_WBS_Template.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Generate import template error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/import - Parse uploaded .xlsx and return structured WBS data
router.post('/import', auth, authorize('owner', 'director'), uploadLimiter,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: 'No file uploaded' });
      }

      const fileData = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
      if (!fileData) {
        return res.status(400).json({ msg: 'Could not read uploaded file' });
      }

      const result = await projectExcelService.parseProjectWorkbook(fileData, req.file.originalname);
      res.json(result);
    } catch (error) {
      console.error('Import project spreadsheet error:', error);
      res.status(500).json({ msg: 'Failed to parse spreadsheet' });
    }
  }
);

// GET /api/projects/:id - Get single project (with supplies)
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'fullName')
      .populate('assignedTo', 'fullName role')
      .lean();
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Auto-migrate legacy projects to unified WBS ProjectTask hierarchy
    await ensureProjectTasksFromLegacy(project._id);

    // Fetch unified WBS tasks (single canonical source of truth)
    const tasks = await ProjectTask.find({ projectId: project._id }).sort({ sortOrder: 1 }).lean();

    if (tasks.length > 0) {
      // 1. Work Items projection from unified ProjectTask (NO DUAL DATA)
      const workTasks = tasks.filter(t => t.itemType === 'work');
      project.workItems = workTasks.map(t => ({
        _id: t._id,
        name: t.name,
        qty: t.quantity || 1,
        volume: t.unit || 'M2',
        unit: t.unit || 'M2',
        cost: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
        actualCost: t.actualCost || 0,
        progress: t.percentComplete || 0,
        physicalWeight: t.physicalWeight || 0,
        startDate: t.startDate,
        endDate: t.finishDate,
        outlineLevel: t.outlineLevel,
        wbsCode: t.wbsCode,
        parentTaskId: t.parentTaskId,
        isSummary: t.isSummary,
      }));

      // 2. Supplies projection from unified ProjectTask (NO DUAL DATA)
      const supplyTasks = tasks.filter(t => t.itemType === 'supply');
      project.supplies = supplyTasks.map(t => ({
        _id: t._id,
        projectId: t.projectId,
        item: t.name,
        qty: t.quantity || 1,
        unit: t.unit || 'pcs',
        cost: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
        actualCost: t.actualCost || 0,
        totalQtyUsed: t.realizedQuantity || 0,
        status: t.supplyStatus || (t.percentComplete === 100 ? 'Delivered' : t.percentComplete > 0 ? 'Ordered' : 'Pending'),
        startDate: t.startDate,
        endDate: t.finishDate,
        deliveryDate: t.deliveryDate,
        outlineLevel: t.outlineLevel,
        wbsCode: t.wbsCode,
        parentTaskId: t.parentTaskId,
      }));

      // 3. Roll up totalBudget directly from tasks
      const rootTasks = tasks.filter(t => t.outlineLevel === 1);
      const computedBudget = rootTasks.length > 0
        ? rootTasks.reduce((sum, t) => sum + (t.plannedCost || 0), 0)
        : tasks.reduce((sum, t) => sum + (t.plannedCost || 0), 0);
      if (computedBudget > 0) {
        project.totalBudget = computedBudget;
      }

      // Calculate canonical one true progress
      const canonical = calculateProjectProgress(project, tasks);
      project.progress = canonical.progress;
      if (project._id && project.progress !== canonical.progress) {
        Project.updateOne({ _id: project._id }, { $set: { progress: canonical.progress } }).catch(() => {});
      }
    } else {
      project.supplies = await Supply.find({ projectId: project._id }).sort({ createdAt: 1 }).lean();
      const canonical = calculateProjectProgress(project, []);
      project.progress = canonical.progress;
    }

    project.tasks = tasks;
    
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/:id/supplies - Get only supplies for a project (derived from ProjectTask WBS)
router.get('/:id/supplies', auth, async (req, res) => {
  try {
    const tasks = await ProjectTask.find({ projectId: req.params.id, itemType: 'supply' }).sort({ sortOrder: 1 }).lean();
    if (tasks.length > 0) {
      const mappedSupplies = tasks.map(t => ({
        _id: t._id,
        projectId: t.projectId,
        item: t.name,
        qty: t.quantity || 1,
        unit: t.unit || 'pcs',
        cost: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
        actualCost: t.actualCost || 0,
        totalQtyUsed: t.realizedQuantity || 0,
        status: t.supplyStatus || (t.percentComplete === 100 ? 'Delivered' : t.percentComplete > 0 ? 'Ordered' : 'Pending'),
        startDate: t.startDate,
        endDate: t.finishDate,
        deliveryDate: t.deliveryDate,
        wbsCode: t.wbsCode,
      }));
      return res.json(mappedSupplies);
    }
    const supplies = await Supply.find({ projectId: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json(supplies);
  } catch (error) {
    console.error('Get project supplies error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/supplies - Add a supply/material to project
router.post('/:id/supplies', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ msg: 'Project not found' });

    const { item, qty, unit, cost, status, startDate, endDate, deadline, deliveryDate } = req.body;
    const numQty = Number(qty) || 1;
    const numCost = Number(cost) || 0;

    const newSupply = new Supply({
      projectId: id,
      item: item || 'Material Item',
      qty: numQty,
      unit: unit || 'pcs',
      cost: numCost,
      status: status || 'Pending',
      startDate: startDate || project.startDate,
      endDate: endDate || deadline || project.endDate,
      deliveryDate: deliveryDate || null,
    });
    await newSupply.save();

    // Sync to unified ProjectTask under Pengadaan summary package
    try {
      await ensureProjectTasksFromLegacy(id);
      let supplySummary = await ProjectTask.findOne({ projectId: id, itemType: 'summary', category: 'material' });
      if (!supplySummary) {
        supplySummary = await ProjectTask.findOne({ projectId: id, isSummary: true });
      }

      const tasksCount = await ProjectTask.countDocuments({ projectId: id });
      const parentWbs = supplySummary ? supplySummary.wbsCode : '2';
      const childTasks = supplySummary ? await ProjectTask.find({ parentTaskId: supplySummary._id }) : [];

      const newTask = new ProjectTask({
        projectId: id,
        wbsCode: `${parentWbs}.${childTasks.length + 1}`,
        outlineLevel: supplySummary ? supplySummary.outlineLevel + 1 : 2,
        parentTaskId: supplySummary ? supplySummary._id : null,
        sortOrder: tasksCount,
        name: item || 'Material Item',
        itemType: 'supply',
        category: 'material',
        duration: 1,
        startDate: startDate || project.startDate || new Date(),
        finishDate: endDate || deadline || project.endDate || new Date(),
        quantity: numQty,
        unit: unit || 'pcs',
        unitRate: numQty > 0 ? Math.round(numCost / numQty) : numCost,
        totalBudget: numCost,
        plannedCost: numCost,
        actualCost: 0,
        supplyStatus: status || 'Pending',
        percentComplete: status === 'Delivered' ? 100 : status === 'Ordered' ? 50 : 0,
        legacySupplyId: newSupply._id.toString(),
      });
      await newTask.save();
      await syncProjectTasksToProjectEntities(id);
    } catch (taskErr) {
      console.error('Error syncing new supply to ProjectTask:', taskErr);
    }

    res.status(201).json(newSupply);
  } catch (error) {
    console.error('Add project supply error:', error);
    res.status(500).json({ msg: error.message || 'Server error adding supply' });
  }
});

// PUT /api/projects/:id/supplies/:supplyId - Update project supply
router.put('/:id/supplies/:supplyId', auth, async (req, res) => {
  try {
    const { id, supplyId } = req.params;
    const supply = await Supply.findOne({ _id: supplyId, projectId: id });
    if (!supply) return res.status(404).json({ msg: 'Supply item not found' });

    const { item, qty, unit, cost, status, startDate, endDate, deadline, deliveryDate, actualCost } = req.body;
    if (item !== undefined) supply.item = item;
    if (qty !== undefined) supply.qty = Number(qty);
    if (unit !== undefined) supply.unit = unit;
    if (cost !== undefined) supply.cost = Number(cost);
    if (status !== undefined) supply.status = status;
    if (actualCost !== undefined) supply.actualCost = Number(actualCost);
    if (startDate !== undefined) supply.startDate = startDate;
    if (endDate !== undefined) supply.endDate = endDate;
    if (deadline !== undefined) supply.deadline = deadline;
    if (deliveryDate !== undefined) supply.deliveryDate = deliveryDate;

    await supply.save();

    // Sync to corresponding ProjectTask
    try {
      const numQty = Number(supply.qty) || 1;
      const numCost = Number(supply.cost) || 0;
      await ProjectTask.updateOne(
        {
          projectId: id,
          $or: [
            { legacySupplyId: supplyId },
            { _id: mongoose.Types.ObjectId.isValid(supplyId) ? supplyId : null }
          ]
        },
        {
          $set: {
            name: supply.item,
            quantity: numQty,
            unit: supply.unit,
            unitRate: numQty > 0 ? Math.round(numCost / numQty) : numCost,
            totalBudget: numCost,
            plannedCost: numCost,
            ...(supply.actualCost !== undefined && { actualCost: supply.actualCost }),
            supplyStatus: supply.status,
            percentComplete: supply.status === 'Delivered' ? 100 : supply.status === 'Ordered' ? 50 : 0,
            deliveryDate: supply.deliveryDate,
          }
        }
      );
      await syncProjectTasksToProjectEntities(id);
    } catch (taskErr) {
      console.error('Error syncing supply update to ProjectTask:', taskErr);
    }

    res.json(supply);
  } catch (error) {
    console.error('Update project supply error:', error);
    res.status(500).json({ msg: error.message || 'Server error updating supply' });
  }
});

// DELETE /api/projects/:id/supplies/:supplyId - Delete project supply
router.delete('/:id/supplies/:supplyId', auth, async (req, res) => {
  try {
    const { id, supplyId } = req.params;
    const supply = await Supply.findOneAndDelete({ _id: supplyId, projectId: id });
    if (!supply) return res.status(404).json({ msg: 'Supply item not found' });

    // Remove corresponding ProjectTask
    try {
      await ProjectTask.deleteOne({
        projectId: id,
        $or: [
          { legacySupplyId: supplyId },
          { _id: mongoose.Types.ObjectId.isValid(supplyId) ? supplyId : null }
        ]
      });
      await syncProjectTasksToProjectEntities(id);
    } catch (taskErr) {
      console.error('Error syncing supply deletion to ProjectTask:', taskErr);
    }

    res.json({ msg: 'Supply deleted successfully' });
  } catch (error) {
    console.error('Delete project supply error:', error);
    res.status(500).json({ msg: error.message || 'Server error deleting supply' });
  }
});

// GET /api/projects/:id/daily-reports - Get all daily reports for a project
router.get('/:id/daily-reports', auth, async (req, res) => {
  try {
    const reports = await DailyReport.find({ projectId: req.params.id })
      .sort({ date: 1 })
      .populate('createdBy', 'fullName')
      .lean();
    res.json(reports);
  } catch (error) {
    console.error('Get project daily reports error:', error);
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
      const { nama, lokasi, description, totalBudget, startDate, endDate, supplies, workItems, tasks } = req.body;
      
      const documents = {};
      if (req.files) {
        Object.keys(req.files).forEach(key => {
          if (req.files[key] && req.files[key][0]) {
            documents[key] = req.files[key][0].path;
          }
        });
      }

      let parsedTasks = [];
      if (tasks) {
        try {
          parsedTasks = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
        } catch (e) {
          console.warn('Failed to parse tasks in create project:', e.message);
        }
      }

      let parsedWorkItems = [];
      if (workItems) {
        try {
          parsedWorkItems = typeof workItems === 'string' ? JSON.parse(workItems) : workItems;
        } catch (e) {
          console.warn('Failed to parse workItems in create project:', e.message);
        }
      }

      let parsedSupplies = [];
      if (supplies) {
        try {
          parsedSupplies = typeof supplies === 'string' ? JSON.parse(supplies) : supplies;
        } catch (e) {
          console.warn('Failed to parse supplies in create project:', e.message);
        }
      }

      const pStart = parseWIBDate(startDate) || undefined;
      const pEnd = parseWIBDate(endDate) || undefined;

      const project = new Project({
        nama,
        lokasi,
        description,
        totalBudget: Number(totalBudget) || 0,
        startDate: pStart,
        endDate: pEnd,
        documents,
        workItems: parsedWorkItems,
        createdBy: req.user._id,
      });

      await project.save();

      // If unified WBS tasks are provided from the ERP WBS Wizard:
      if (Array.isArray(parsedTasks) && parsedTasks.length > 0) {
        const taskDocs = [];
        const stack = []; // for parent tracking [{ level, id }]
        let sortOrder = 0;
        const defaultStart = pStart || new Date();
        const defaultEnd = pEnd || new Date(defaultStart.getTime() + 30 * 86400000);

        for (let i = 0; i < parsedTasks.length; i++) {
          const t = parsedTasks[i];
          const level = Math.max(1, Number(t.outlineLevel) || 1);
          const taskId = new mongoose.Types.ObjectId();

          // Stack tracking for parent-child relationship
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }
          const parentTaskId = stack.length > 0 ? stack[stack.length - 1].id : null;
          stack.push({ level, id: taskId });

          const isMilestone = t.itemType === 'milestone' || t.duration === 0;
          const qty = isMilestone ? 0 : (Number(t.quantity || t.qty) || 1);
          const unitRate = Number(t.unitRate) || 0;
          const cost = Number(t.cost || t.plannedCost || t.totalBudget) || Math.round(qty * unitRate);
          const duration = isMilestone ? 0 : Math.max(1, Number(t.duration) || 1);
          const tStart = parseWIBDate(t.startDate) || defaultStart;
          const tEnd = parseWIBDate(t.endDate) || new Date(tStart.getTime() + duration * 86400000);

          let itemType = t.itemType || 'work';
          let category = t.category || (itemType === 'supply' ? 'material' : 'general');
          if (/summary/i.test(itemType)) {
            itemType = 'summary';
            category = 'general';
          } else if (isMilestone || /milestone/i.test(itemType)) {
            itemType = 'milestone';
            category = 'general';
          } else if (/supply|material/i.test(itemType) || category === 'material' || /material|bahan|barang/i.test(category)) {
            itemType = 'supply';
            category = 'material';
          } else {
            itemType = 'work';
            if (category === 'material') category = 'labor';
          }

          taskDocs.push({
            _id: taskId,
            projectId: project._id,
            wbsCode: t.wbsCode || String(i + 1),
            outlineLevel: level,
            parentTaskId,
            sortOrder: sortOrder++,
            isSummary: itemType === 'summary',
            isMilestone,
            name: t.name || `Item ${i + 1}`,
            itemType,
            category,
            duration,
            startDate: tStart,
            finishDate: tEnd,
            quantity: qty,
            unit: t.unit || (t.itemType === 'supply' ? 'pcs' : 'ls'),
            unitRate,
            totalBudget: cost,
            plannedCost: cost,
            actualCost: 0,
            percentComplete: 0,
            supplyStatus: 'Pending',
            deliveryDate: t.deliveryDate ? parseWIBDate(t.deliveryDate) : tEnd,
            createdBy: req.user._id,
          });
        }

        // Mark tasks with children as isSummary
        const parentIds = new Set(taskDocs.map(d => d.parentTaskId?.toString()).filter(Boolean));
        taskDocs.forEach(d => {
          if (parentIds.has(d._id.toString())) {
            d.isSummary = true;
            if (d.itemType !== 'milestone') {
              d.itemType = 'summary';
            }
          }
        });

        // Ensure default calendar
        let calendar = await ProjectCalendar.findOne({ projectId: project._id, isDefault: true });
        if (!calendar) {
          calendar = await ProjectCalendar.create({
            projectId: project._id,
            name: 'Standard Construction Indonesia (Mon-Sat)',
            isDefault: true,
            workingDays: [1, 2, 3, 4, 5, 6],
            hoursPerDay: 8,
            workingHours: [{ start: '08:00', end: '17:00' }],
            exceptions: [],
          });
        }

        await ProjectTask.insertMany(taskDocs);

        // Recalculate CPM scheduling and dates
        try {
          const calObj = calendar.toObject ? calendar.toObject() : calendar;
          recalculateProjectSchedule(taskDocs, project.startDate, calObj);
          for (const td of taskDocs) {
            await ProjectTask.findByIdAndUpdate(td._id, {
              wbsCode: td.wbsCode,
              startDate: td.startDate,
              finishDate: td.finishDate,
              duration: td.duration,
              earlyStart: td.earlyStart,
              earlyFinish: td.earlyFinish,
              lateStart: td.lateStart,
              lateFinish: td.lateFinish,
              totalFloat: td.totalFloat,
              freeFloat: td.freeFloat,
              isCritical: td.isCritical,
              baselineStart: td.startDate,
              baselineFinish: td.finishDate,
              baselineDuration: td.duration,
              baselineCost: td.plannedCost,
            });
          }
        } catch (schedErr) {
          console.warn('CPM schedule calculation warning:', schedErr.message);
        }

        // Populate matching RABItem records
        try {
          const rabDocs = taskDocs.map(td => ({
            _id: td._id,
            projectId: project._id,
            wbsCode: td.wbsCode,
            description: td.name,
            category: td.itemType === 'supply' ? 'Material' : (td.category === 'labor' ? 'Upah' : (td.category === 'equipment' ? 'Alat' : 'Subkon')),
            unitOfMeasure: ['M3', 'CUM'].includes((td.unit || '').toUpperCase()) ? 'CUM' : (['M2', 'SQM'].includes((td.unit || '').toUpperCase()) ? 'SQM' : (['TON', 'MT'].includes((td.unit || '').toUpperCase()) ? 'MT' : (['SAK', 'ZAK'].includes((td.unit || '').toUpperCase()) ? 'ZAK' : 'PCS'))),
            budgetedQuantity: td.quantity || 1,
            unitRate: td.unitRate || 0,
            totalBudget: td.plannedCost || 0,
            committedQuantity: 0,
            realizedQuantity: 0,
            realizedAmount: 0,
          }));
          await RABItem.insertMany(rabDocs);
        } catch (rabErr) {
          console.warn('RAB sync warning in create project:', rabErr.message);
        }

        // Sync to Project.workItems and Supply collection
        await syncProjectTasksToProjectEntities(project._id);

        // Auto-rollup totalBudget if 0
        if (!project.totalBudget || project.totalBudget === 0) {
          const rootTasks = taskDocs.filter(td => td.outlineLevel === 1);
          const computedBudget = rootTasks.reduce((s, td) => s + (td.plannedCost || 0), 0);
          if (computedBudget > 0) {
            project.totalBudget = computedBudget;
            await project.save();
          }
        }
      } else {
        // Fallback for legacy requests without tasks
        if (parsedSupplies.length > 0) {
          const supplyDocs = parsedSupplies.map(s => ({
            ...s,
            projectId: project._id,
          }));
          await Supply.insertMany(supplyDocs);
        }
        await ensureProjectTasksFromLegacy(project._id);
      }

      // Notify managers about new project (fire-and-forget)
      try {
        const actorId = req.user ? String(req.user._id || req.user.id || 'system') : 'system';
        notifyByRole(
          ['owner', 'director', 'supervisor'],
          {
            type: 'project_created',
            title: 'New Project',
            message: `Project "${nama}" has been created at ${lokasi || 'N/A'}`,
            data: { projectId: project._id },
          },
          actorId
        ).catch(console.error);
      } catch (notifyErr) {
        console.warn('Notify error:', notifyErr.message);
      }

      return res.status(201).json(project);
    } catch (error) {
      console.error('Create project error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ msg: 'Server error' });
      }
    }
  }
);

// DELETE /api/projects/:id - Delete a project and its related data
router.delete('/:id', auth, authorize('owner'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Delete related data
    await Promise.all([
      Supply.deleteMany({ projectId: project._id }),
      DailyReport.deleteMany({ projectId: project._id }),
      MaterialLog.deleteMany({ projectId: project._id }),
      ProjectReport.deleteMany({ projectId: project._id }),
    ]);

    await project.deleteOne();
    res.json({ msg: 'Project and related data deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/progress - Manually update project progress
router.put('/:id/progress', auth, authorize('owner', 'director', 'supervisor'), async (req, res) => {
  try {
    const { progress } = req.body;
    if (progress === undefined || progress < 0 || progress > 100) {
      return res.status(400).json({ msg: 'Progress must be between 0 and 100' });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { progress: Number(progress), updatedAt: nowWIB() } },
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

// PUT /api/projects/:id/payroll-config - Update weekly payroll cutoff days for a project
router.put('/:id/payroll-config', auth, authorize('owner', 'director', 'supervisor', 'admin_project'), async (req, res) => {
  try {
    const { cutoffStartDay, cutoffEndDay } = req.body;
    const start = parseInt(cutoffStartDay, 10);
    const end = parseInt(cutoffEndDay, 10);
    if (isNaN(start) || start < 0 || start > 6 || isNaN(end) || end < 0 || end > 6) {
      return res.status(400).json({ msg: 'cutoffStartDay and cutoffEndDay must be integers between 0 and 6 (0=Sun, 1=Mon, ..., 6=Sat)' });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'payrollConfig.cutoffStartDay': start,
          'payrollConfig.cutoffEndDay': end,
          updatedAt: nowWIB(),
        }
      },
      { new: true }
    ).select('_id nama lokasi payrollConfig');

    if (!project) return res.status(404).json({ msg: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Update project payroll config error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/duplicate - Clone a project (aligned to unified Single Source of Truth)
router.post('/:id/duplicate', auth, authorize('owner', 'director'), async (req, res) => {
  try {
    const { newName, options = {} } = req.body;
    const source = await Project.findById(req.params.id).lean();
    if (!source) {
      return res.status(404).json({ msg: 'Source project not found' });
    }

    const includeTasks = options.includeTasks !== undefined ? Boolean(options.includeTasks) : (options.includeWBS !== undefined ? Boolean(options.includeWBS) : true);
    const includeCalendar = options.includeCalendar !== undefined ? Boolean(options.includeCalendar) : true;
    const includeResources = options.includeResources !== undefined ? Boolean(options.includeResources) : true;

    // Build new project data
    const newProject = new Project({
      nama: newName || `Copy of ${source.nama}`,
      lokasi: source.lokasi,
      description: source.description,
      totalBudget: source.totalBudget || 0,
      startDate: source.startDate,
      endDate: source.endDate,
      progress: 0,
      status: 'Planning',
      documents: options.includeDocuments ? source.documents : {},
      documentFiles: options.includeDocuments ? (source.documentFiles || []) : [],
      workItems: [],
      assignedTo: options.includeAssignedUsers ? source.assignedTo : [],
      createdBy: req.user._id,
    });

    await newProject.save();

    // 1. Clone Calendar
    let newCalendar = null;
    if (includeCalendar) {
      const sourceCal = await ProjectCalendar.findOne({ projectId: source._id, isDefault: true }).lean();
      if (sourceCal) {
        newCalendar = await ProjectCalendar.create({
          projectId: newProject._id,
          name: sourceCal.name,
          isDefault: true,
          workingDays: sourceCal.workingDays || [1, 2, 3, 4, 5, 6],
          hoursPerDay: sourceCal.hoursPerDay || 8,
          workingHours: sourceCal.workingHours || [{ start: '08:00', end: '17:00' }],
          exceptions: sourceCal.exceptions || [],
        });
      }
    }
    if (!newCalendar) {
      newCalendar = await ProjectCalendar.create({
        projectId: newProject._id,
        name: 'Standard Construction Indonesia (Mon-Sat)',
        isDefault: true,
        workingDays: [1, 2, 3, 4, 5, 6],
        hoursPerDay: 8,
        workingHours: [{ start: '08:00', end: '17:00' }],
        exceptions: [],
      });
    }

    // 2. Clone Resources
    if (includeResources) {
      const sourceResources = await ProjectResource.find({ projectId: source._id }).lean();
      if (sourceResources.length > 0) {
        const clonedResources = sourceResources.map(r => ({
          ...r,
          _id: new mongoose.Types.ObjectId(),
          projectId: newProject._id,
        }));
        await ProjectResource.insertMany(clonedResources);
      }
    }

    // 3. Clone Unified WBS Tasks (Single Source of Truth)
    const sourceTasks = await ProjectTask.find({ projectId: source._id }).sort({ sortOrder: 1 }).lean();
    if (includeTasks && sourceTasks.length > 0) {
      // Create mapping from old task ObjectIds to new ObjectIds
      const oldIdToNewId = new Map();
      sourceTasks.forEach(st => {
        oldIdToNewId.set(st._id.toString(), new mongoose.Types.ObjectId());
      });

      const clonedTasks = sourceTasks.map(st => {
        const newId = oldIdToNewId.get(st._id.toString());
        const newParentId = st.parentTaskId && oldIdToNewId.has(st.parentTaskId.toString())
          ? oldIdToNewId.get(st.parentTaskId.toString())
          : null;

        const remappedPredecessors = (st.predecessors || [])
          .map(p => {
            const remappedTaskId = p.taskId ? (oldIdToNewId.get(p.taskId.toString()) || p.taskId) : null;
            return remappedTaskId ? { taskId: remappedTaskId, type: p.type || 'FS', lagDays: p.lagDays || 0 } : null;
          })
          .filter(Boolean);

        return {
          _id: newId,
          projectId: newProject._id,
          wbsCode: st.wbsCode,
          outlineLevel: st.outlineLevel,
          parentTaskId: newParentId,
          sortOrder: st.sortOrder,
          isSummary: st.isSummary,
          isMilestone: st.isMilestone,
          name: st.name,
          duration: st.duration,
          durationUnit: st.durationUnit || 'days',
          startDate: st.startDate,
          finishDate: st.finishDate,
          percentComplete: 0,
          plannedCost: st.plannedCost || 0,
          actualCost: 0,
          plannedWork: st.plannedWork || 0,
          actualWork: 0,
          remainingWork: st.plannedWork || 0,
          taskType: st.taskType || 'FixedUnits',
          isEffortDriven: st.isEffortDriven !== undefined ? st.isEffortDriven : true,
          levelingDelay: 0,
          constraintType: st.constraintType || 'ASAP',
          constraintDate: st.constraintDate,
          deadlineDate: st.deadlineDate,
          assignedResources: st.assignedResources || [],
          predecessors: remappedPredecessors,
          itemType: st.itemType || 'work',
          category: st.category || 'general',
          quantity: st.quantity || 1,
          unit: st.unit || 'ls',
          unitRate: st.unitRate || 0,
          totalBudget: st.plannedCost || ((st.quantity || 1) * (st.unitRate || 0)),
          realizedQuantity: 0,
          realizedAmount: 0,
          physicalWeight: st.physicalWeight || 0,
          supplyStatus: 'Pending',
          deliveryDate: st.deliveryDate,
          createdBy: req.user._id,
        };
      });

      await ProjectTask.insertMany(clonedTasks);

      // Recalculate CPM scheduling on the cloned tasks
      try {
        const calObj = newCalendar.toObject ? newCalendar.toObject() : newCalendar;
        recalculateProjectSchedule(clonedTasks, newProject.startDate, calObj);
        for (const ct of clonedTasks) {
          await ProjectTask.findByIdAndUpdate(ct._id, {
            wbsCode: ct.wbsCode,
            startDate: ct.startDate,
            finishDate: ct.finishDate,
            earlyStart: ct.earlyStart,
            earlyFinish: ct.earlyFinish,
            lateStart: ct.lateStart,
            lateFinish: ct.lateFinish,
            totalFloat: ct.totalFloat,
            freeFloat: ct.freeFloat,
            isCritical: ct.isCritical,
            baselineStart: ct.startDate,
            baselineFinish: ct.finishDate,
            baselineDuration: ct.duration,
            baselineCost: ct.plannedCost,
          });
        }
      } catch (cpmErr) {
        console.warn('Warning: CPM scheduling error during duplication:', cpmErr.message);
      }

      // Synchronize Project.workItems and Supply collection
      await syncProjectTasksToProjectEntities(newProject._id);

      // Populate matching RABItem collection for instant Swakelola SCM readiness
      const rabDocs = clonedTasks.map(t => ({
        _id: t._id,
        projectId: newProject._id,
        wbsCode: t.wbsCode,
        description: t.name,
        category: t.itemType === 'supply' ? 'Material' : (t.category === 'labor' ? 'Upah' : 'Subkon'),
        unitOfMeasure: ['M3', 'CUM'].includes((t.unit || '').toUpperCase()) ? 'CUM' : (['M2', 'SQM'].includes((t.unit || '').toUpperCase()) ? 'SQM' : 'PCS'),
        budgetedQuantity: t.quantity || 1,
        unitRate: t.unitRate || 0,
        totalBudget: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
        committedQuantity: 0,
        realizedQuantity: 0,
        realizedAmount: 0,
      }));
      await RABItem.insertMany(rabDocs);

    } else {
      // Fallback: If source had no tasks, clone supplies & workItems and ensure tasks
      if (options.includeSupplies) {
        const sourceSupplies = await Supply.find({ projectId: source._id }).lean();
        if (sourceSupplies.length > 0) {
          const clonedSupplies = sourceSupplies.map(s => ({
            projectId: newProject._id,
            item: s.item,
            qty: s.qty,
            unit: s.unit,
            cost: s.cost,
            actualCost: 0,
            totalQtyUsed: 0,
            status: 'Pending',
            startDate: s.startDate,
            endDate: s.endDate,
          }));
          await Supply.insertMany(clonedSupplies);
        }
      }
      if (options.includeWorkItems && source.workItems?.length > 0) {
        newProject.workItems = source.workItems.map(w => ({
          ...w,
          _id: new mongoose.Types.ObjectId(),
          progress: 0,
          actualCost: 0,
        }));
        await newProject.save();
      }
      await ensureProjectTasksFromLegacy(newProject._id);
    }

    const finalProject = await Project.findById(newProject._id).lean();
    res.status(201).json(finalProject);
  } catch (error) {
    console.error('Duplicate project error:', error);
    res.status(500).json({ msg: 'Server error duplicating project: ' + error.message });
  }
});

// POST /api/projects/:id/material-logs - Log material usage with ACID Transaction Safety
router.post('/:id/material-logs', auth, async (req, res) => {
  try {
    const { supplyId, qtyUsed, notes, date } = req.body;

    if (!supplyId || !qtyUsed || Number(qtyUsed) <= 0) {
      return res.status(400).json({ msg: 'supplyId and a positive qtyUsed are required' });
    }

    const numericQty = Number(qtyUsed);

    const log = await withTransaction(async (session) => {
      // Find the supply and validate within transaction session
      const query = { _id: supplyId, projectId: req.params.id };
      const supply = session
        ? await Supply.findOne(query).session(session)
        : await Supply.findOne(query);

      if (!supply) {
        const err = new Error('Supply not found for this project');
        err.statusCode = 404;
        throw err;
      }

      const remaining = supply.qty - (supply.totalQtyUsed || 0);
      if (numericQty > remaining) {
        const err = new Error(`Insufficient stock. Only ${remaining} ${supply.unit} remaining.`);
        err.statusCode = 400;
        throw err;
      }

      // Atomically increment totalQtyUsed on supply with concurrency protection
      if (session) {
        await Supply.updateOne(
          { _id: supplyId },
          { $inc: { totalQtyUsed: numericQty } },
          { session }
        );
        await ProjectTask.updateOne(
          {
            projectId: req.params.id,
            $or: [
              { legacySupplyId: supplyId.toString() },
              { name: supply.item, itemType: 'supply' },
            ],
          },
          { $inc: { realizedQuantity: numericQty } },
          { session }
        );
      } else {
        await Supply.updateOne(
          { _id: supplyId },
          { $inc: { totalQtyUsed: numericQty } }
        );
        await ProjectTask.updateOne(
          {
            projectId: req.params.id,
            $or: [
              { legacySupplyId: supplyId.toString() },
              { name: supply.item, itemType: 'supply' },
            ],
          },
          { $inc: { realizedQuantity: numericQty } }
        );
      }

      const qtyLeft = remaining - numericQty;

      // Create the material log within the session
      const newLog = new MaterialLog({
        projectId: req.params.id,
        supplyId,
        date: parseWIBDate(date) || nowWIB(),
        qtyUsed: numericQty,
        qtyLeft,
        notes: notes || '',
        recordedBy: req.user._id,
      });

      if (session) {
        await newLog.save({ session });
      } else {
        await newLog.save();
      }

      return newLog;
    });

    // Populate for response outside transaction
    await log.populate('supplyId', 'item unit qty totalQtyUsed');
    await log.populate('recordedBy', 'fullName');

    res.status(201).json(log);
  } catch (error) {
    console.error('Log material usage error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ msg: error.message });
    }
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/:id/members - Get project members (assignedTo populated)
router.get('/:id/members', auth, authorize('owner', 'director', 'supervisor', 'asset_admin', 'admin_project'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedTo', '_id fullName username role profileImage isVerified')
      .select('_id nama lokasi assignedTo')
      .lean();
    if (!project) return res.status(404).json({ msg: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Get project members error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/:id/members - Replace the full assignedTo list
router.put('/:id/members', auth, authorize('owner', 'director', 'supervisor', 'asset_admin', 'admin_project'), async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return res.status(400).json({ msg: 'userIds must be an array' });
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { assignedTo: userIds, updatedAt: nowWIB() } },
      { new: true }
    ).populate('assignedTo', '_id fullName username role profileImage isVerified');
    if (!project) return res.status(404).json({ msg: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Update project members error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});
// GET /api/projects/:id/material-logs - Get material usage logs for a project
router.get('/:id/material-logs', auth, async (req, res) => {
  try {
    const { date } = req.query;
    let query = { projectId: req.params.id };
    
    if (date) {
      const { start, end } = wibDayRange(date);
      query.createdAt = { $gte: start, $lte: end };
    }

    const logs = await MaterialLog.find(query)
      .populate('supplyId', 'item unit')
      .populate('recordedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (error) {
    console.error('Get material logs error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});
// === DAILY REPORT ROUTE ===

// POST /api/projects/:id/daily-report - Submit a daily report
router.post('/:id/daily-report', auth, uploadLimiter,
  upload.array('photos', 5),
  async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ msg: 'Project not found' });
      }

      const { weather, materials, workforce, notes, date } = req.body;
      const workItemUpdates = JSON.parse(req.body.workItemUpdates || '[]');
      const supplyUpdates = JSON.parse(req.body.supplyUpdates || '[]');

      // Convert uploaded photos to WebP and collect paths with alt texts
      const photoAltTexts = JSON.parse(req.body.photoAltTexts || '[]');
      const uploadedFiles = req.files || [];
      const photoEntries = [];
      for (let i = 0; i < uploadedFiles.length; i++) {
        const webpPath = await convertToWebP(uploadedFiles[i].path);
        photoEntries.push({
          path: webpPath,
          altText: photoAltTexts[i] || '',
        });
      }

      // Build DailyReport workItemUpdates with previous progress
      const reportWorkItems = [];
      for (const wu of workItemUpdates) {
        const existing = project.workItems.id(wu.workItemId);
        const previousProgress = existing ? (existing.progress || 0) : 0;
        reportWorkItems.push({
          workItemId: wu.workItemId,
          name: existing ? existing.name : '',
          previousProgress,
          newProgress: wu.newProgress,
          volumeCompleted: wu.volumeCompleted || 0,
          actualCost: wu.actualCost || 0,
        });

        // Update the work item on the project
        if (existing) {
          existing.progress = wu.newProgress;
          if (wu.actualCost !== undefined) existing.actualCost = wu.actualCost;

          // Sync to unified ProjectTask
          try {
            await ProjectTask.updateOne(
              {
                projectId: project._id,
                $or: [
                  { legacyWorkItemId: wu.workItemId },
                  { _id: mongoose.Types.ObjectId.isValid(wu.workItemId) ? wu.workItemId : null }
                ]
              },
              {
                $set: {
                  percentComplete: wu.newProgress,
                  ...(wu.actualCost !== undefined && { actualCost: wu.actualCost })
                }
              }
            );
          } catch (taskErr) {
            console.error('Error syncing workItem to ProjectTask:', taskErr);
          }
        }
      }

      // Build DailyReport supplyUpdates with previous status
      const reportSupplyUpdates = [];
      for (const su of supplyUpdates) {
        const supply = await Supply.findById(su.supplyId);
        const previousStatus = supply ? (supply.status || 'Pending') : 'Pending';
        reportSupplyUpdates.push({
          supplyId: su.supplyId,
          item: supply ? supply.item : '',
          previousStatus,
          newStatus: su.newStatus,
          actualCost: su.actualCost || 0,
        });

        // Update the supply document
        if (supply) {
          supply.status = su.newStatus;
          if (su.actualCost !== undefined) supply.actualCost = su.actualCost;
          await supply.save();

          // Sync to unified ProjectTask
          try {
            const pct = STATUS_PROGRESS[su.newStatus] || 0;
            await ProjectTask.updateOne(
              {
                projectId: project._id,
                $or: [
                  { legacySupplyId: su.supplyId },
                  { _id: mongoose.Types.ObjectId.isValid(su.supplyId) ? su.supplyId : null }
                ]
              },
              {
                $set: {
                  supplyStatus: su.newStatus,
                  percentComplete: pct,
                  ...(su.actualCost !== undefined && { actualCost: su.actualCost })
                }
              }
            );
          } catch (taskErr) {
            console.error('Error syncing supply to ProjectTask:', taskErr);
          }
        }
      }

      // Calculate canonical overall progress (Single Source of Truth)
      const latestTasks = await ProjectTask.find({ projectId: project._id }).lean();
      const canonical = calculateProjectProgress(project, latestTasks);
      const computedProgress = canonical.progress;

      // Update project progress
      project.progress = computedProgress;
      project.updatedAt = nowWIB();
      await project.save();

      // Save the DailyReport document
      const dailyReport = new DailyReport({
        projectId: project._id,
        date: parseWIBDate(date) || new Date(),
        progressPercent: computedProgress,
        workItemUpdates: reportWorkItems,
        supplyUpdates: reportSupplyUpdates,
        weather: weather || 'Cerah',
        materials,
        workforce,
        notes,
        photos: photoEntries,
        createdBy: req.user._id,
      });

      await dailyReport.save();

      res.status(201).json({
        msg: 'Daily report submitted',
        progress: computedProgress,
        dailyReport,
      });

      // Notify managers about new daily report (fire-and-forget)
      notifyByRole(
        ['owner', 'director'],
        {
          type: 'daily_report',
          title: 'Daily Report Submitted',
          message: `New daily report for "${project.nama}" — ${computedProgress}% progress`,
          data: { projectId: project._id },
        },
        req.user._id.toString()
      ).catch(console.error);
    } catch (error) {
      console.error('Submit daily report error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// DELETE /api/projects/:id/daily-reports/:reportId - Delete a daily report
router.delete('/:id/daily-reports/:reportId', auth, authorize('supervisor', 'director', 'owner'), async (req, res) => {
  try {
    const report = await DailyReport.findOne({ _id: req.params.reportId, projectId: req.params.id });
    if (!report) {
      return res.status(404).json({ msg: 'Daily report not found' });
    }

    // Remove photo files from disk
    for (const photo of (report.photos || [])) {
      const filePath = typeof photo === 'string' ? photo : photo.path;
      if (filePath) {
        try { fs.unlinkSync(filePath); } catch { /* file may not exist */ }
      }
    }

    await DailyReport.findByIdAndDelete(req.params.reportId);
    res.json({ msg: 'Daily report deleted' });
  } catch (error) {
    console.error('Delete daily report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/projects/:id/daily-reports/:reportId - Revise (edit-in-place) a daily report
router.patch('/:id/daily-reports/:reportId', auth, authorize('supervisor', 'director', 'owner'),
  uploadLimiter, upload.array('newPhotos', 5),
  async (req, res) => {
    try {
      const report = await DailyReport.findOne({ _id: req.params.reportId, projectId: req.params.id });
      if (!report) {
        return res.status(404).json({ msg: 'Daily report not found' });
      }

      const { weather, materials, workforce, notes } = req.body;

      // Update basic fields if provided
      if (weather !== undefined) report.weather = weather;
      if (materials !== undefined) report.materials = materials;
      if (workforce !== undefined) report.workforce = workforce;
      if (notes !== undefined) report.notes = notes;

      // Handle photo removals (array of indices to remove)
      const removePhotoIndices = JSON.parse(req.body.removePhotoIndices || '[]');
      if (removePhotoIndices.length > 0) {
        // Delete files from disk
        for (const idx of removePhotoIndices) {
          const photo = report.photos[idx];
          if (photo) {
            const filePath = typeof photo === 'string' ? photo : photo.path;
            if (filePath) {
              try { fs.unlinkSync(filePath); } catch { /* ok */ }
            }
          }
        }
        // Remove from array (filter by index)
        report.photos = report.photos.filter((_, i) => !removePhotoIndices.includes(i));
      }

      // Handle existing photo alt text updates
      const existingAltTexts = JSON.parse(req.body.existingAltTexts || '[]');
      for (let i = 0; i < existingAltTexts.length && i < report.photos.length; i++) {
        if (existingAltTexts[i] !== undefined && existingAltTexts[i] !== null) {
          report.photos[i].altText = existingAltTexts[i];
        }
      }

      // Handle new photo uploads
      const newPhotoAltTexts = JSON.parse(req.body.newPhotoAltTexts || '[]');
      const newFiles = req.files || [];
      for (let i = 0; i < newFiles.length; i++) {
        const webpPath = await convertToWebP(newFiles[i].path);
        report.photos.push({
          path: webpPath,
          altText: newPhotoAltTexts[i] || '',
        });
      }

      await report.save();
      res.json({ msg: 'Daily report updated', dailyReport: report });
    } catch (error) {
      console.error('Revise daily report error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// === PROJECT REPORT ROUTES ===

// GET /api/projects/:id/reports - List submitted reports for a project
router.get('/:id/reports', auth, async (req, res) => {
  try {
    const reports = await ProjectReport.find({ projectId: req.params.id })
      .populate('submittedBy', 'fullName role')
      .populate('authorization.directorId', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
    res.json(reports);
  } catch (error) {
    console.error('Get project reports error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/reports - Submit a new report
router.post('/:id/reports', auth, authorize('supervisor', 'asset_admin', 'owner', 'director'), async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.body;
    if (!reportType || !startDate || !endDate) {
      return res.status(400).json({ msg: 'reportType, startDate, and endDate are required' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Find matching daily reports in the date range
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dailyReports = await DailyReport.find({
      projectId: req.params.id,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    const report = new ProjectReport({
      projectId: req.params.id,
      reportType,
      startDate: start,
      endDate: end,
      dailyReportIds: dailyReports.map(dr => dr._id),
      submittedBy: req.user._id,
    });

    await report.save();
    res.status(201).json(report);
  } catch (error) {
    console.error('Submit project report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/projects/reports/:reportId/approve - Director approves a report
router.put('/reports/:reportId/approve', auth, authorize('director', 'owner'), async (req, res) => {
  try {
    const { passphrase } = req.body;
    if (!passphrase || passphrase.length < 4) {
      return res.status(400).json({ msg: 'Passphrase is required (min 4 characters)' });
    }

    // Verify passphrase against user's login password
    const { User } = require('../models');
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    const isMatch = await bcrypt.compare(passphrase, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Incorrect passphrase' });
    }

    const report = await ProjectReport.findById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }
    if (report.status === 'approved') {
      return res.status(400).json({ msg: 'Report already approved' });
    }

    const hashedPassphrase = await bcrypt.hash(passphrase, 10);

    report.status = 'approved';
    report.authorization = {
      directorId: req.user._id,
      directorName: req.user.fullName,
      directorPassphrase: hashedPassphrase,
      directorSignedAt: new Date(),
    };

    await report.save();

    const populated = await ProjectReport.findById(report._id)
      .populate('submittedBy', 'fullName role')
      .populate('authorization.directorId', 'fullName');

    res.json(populated);

    // Notify the report submitter about approval (fire-and-forget)
    if (report.submittedBy) {
      notify({
        recipient: report.submittedBy,
        type: 'report_approved',
        title: 'Report Approved',
        message: `Your project report has been approved and signed`,
        data: { reportId: report._id, projectId: report.projectId },
      }).catch(console.error);
    }
  } catch (error) {
    console.error('Approve project report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/reports/:reportId - Get single report with populated data
router.get('/reports/:reportId', auth, async (req, res) => {
  try {
    const report = await ProjectReport.findById(req.params.reportId)
      .populate('projectId', 'nama lokasi progress startDate endDate workItems')
      .populate('submittedBy', 'fullName role')
      .populate('authorization.directorId', 'fullName')
      .populate({
        path: 'dailyReportIds',
        populate: { path: 'createdBy', select: 'fullName' },
      });

    if (!report) {
      return res.status(404).json({ msg: 'Report not found' });
    }

    res.json(report);
  } catch (error) {
    console.error('Get project report error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// === PROJECT DOCUMENT ROUTES ===

// Helper: category labels for legacy migration
const LEGACY_DOC_LABELS = {
  shopDrawing: 'shopDrawing',
  hse: 'hse',
  manPowerList: 'manPowerList',
  materialList: 'materialList',
};

// GET /api/projects/:id/documents - List all documents (migrates legacy on first access)
router.get('/:id/documents', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('documentFiles.uploadedBy', 'fullName')
      .lean();

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    let docs = project.documentFiles || [];

    // Migrate legacy flat documents → documentFiles array (one-time)
    if (project.documents && Object.keys(project.documents).length > 0 && docs.length === 0) {
      const legacyDocs = [];
      for (const [key, filePath] of Object.entries(project.documents)) {
        if (filePath && LEGACY_DOC_LABELS[key]) {
          const path = require('path');
          const fs = require('fs');
          let fileSize = 0;
          try {
            if (fs.existsSync(filePath)) {
              fileSize = fs.statSync(filePath).size;
            }
          } catch (_) { /* ignore */ }

          legacyDocs.push({
            name: path.basename(filePath),
            category: LEGACY_DOC_LABELS[key],
            filePath,
            fileSize,
            mimeType: filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
            uploadedBy: project.createdBy,
            uploadedAt: project.createdAt,
          });
        }
      }

      if (legacyDocs.length > 0) {
        await Project.findByIdAndUpdate(req.params.id, {
          $push: { documentFiles: { $each: legacyDocs } },
        });
        // Re-fetch with populated data
        const updated = await Project.findById(req.params.id)
          .populate('documentFiles.uploadedBy', 'fullName')
          .lean();
        docs = updated.documentFiles || [];
      }
    }

    res.json(docs);
  } catch (error) {
    console.error('Get project documents error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/:id/documents - Upload documents
router.post('/:id/documents', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), uploadLimiter,
  upload.array('files', 10),
  async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ msg: 'Project not found' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ msg: 'No files uploaded' });
      }

      const category = req.body.category || 'other';
      const validCategories = ['shopDrawing', 'hse', 'manPowerList', 'materialList', 'contract', 'permit', 'asBuilt', 'other'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ msg: 'Invalid category' });
      }

      const newDocs = req.files.map(file => ({
        name: file.originalname,
        category,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user._id,
        uploadedAt: nowWIB(),
      }));

      project.documentFiles.push(...newDocs);
      project.updatedAt = nowWIB();
      await project.save();

      // Return populated docs
      const updated = await Project.findById(req.params.id)
        .populate('documentFiles.uploadedBy', 'fullName')
        .lean();

      res.status(201).json(updated.documentFiles || []);
    } catch (error) {
      console.error('Upload project documents error:', error);
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

// DELETE /api/projects/:id/documents/:docId - Remove a document
router.delete('/:id/documents/:docId', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const doc = project.documentFiles.id(req.params.docId);
    if (!doc) {
      return res.status(404).json({ msg: 'Document not found' });
    }

    // Delete file from disk
    const fs = require('fs');
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    doc.deleteOne();
    project.updatedAt = nowWIB();
    await project.save();

    res.json({ msg: 'Document deleted' });
  } catch (error) {
    console.error('Delete project document error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
