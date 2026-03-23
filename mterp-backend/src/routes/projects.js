const express = require('express');
const { Project, Supply, DailyReport, MaterialLog, ProjectReport } = require('../models');
const bcrypt = require('bcryptjs');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const XLSX = require('xlsx');

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

// === IMPORT FROM SPREADSHEET ===

// GET /api/projects/import-template - Download a blank .xlsx template
router.get('/import-template', auth, authorize('owner', 'director'), (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Project Info (single row)
    const projectHeaders = ['Nama Proyek', 'Lokasi', 'Deskripsi', 'Total Anggaran', 'Tanggal Mulai', 'Tanggal Selesai'];
    const projectExample = ['Proyek Jembatan Kali', 'Jakarta Selatan', 'Pembangunan jembatan penyeberangan', 500000000, '2026-04-01', '2026-12-31'];
    const wsProject = XLSX.utils.aoa_to_sheet([projectHeaders, projectExample]);
    wsProject['!cols'] = projectHeaders.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsProject, 'Project Info');

    // Sheet 2: Supplies
    const supplyHeaders = ['Nama Barang', 'Jumlah', 'Satuan', 'Biaya', 'Tanggal Mulai', 'Tanggal Selesai'];
    const supplyExample = ['Semen Tiga Roda', 100, 'sak', 7500000, '2026-04-01', '2026-04-15'];
    const wsSupply = XLSX.utils.aoa_to_sheet([supplyHeaders, supplyExample]);
    wsSupply['!cols'] = supplyHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, wsSupply, 'Supplies');

    // Sheet 3: Work Items
    const workHeaders = ['Nama Pekerjaan', 'Jumlah', 'Satuan', 'Biaya', 'Tanggal Mulai', 'Tanggal Selesai'];
    const workExample = ['Pekerjaan Pondasi', 50, 'M3', 25000000, '2026-04-01', '2026-06-30'];
    const wsWork = XLSX.utils.aoa_to_sheet([workHeaders, workExample]);
    wsWork['!cols'] = workHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, wsWork, 'Work Items');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MTERP_Project_Template.xlsx"');
    res.send(Buffer.from(buf));
  } catch (error) {
    console.error('Generate import template error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/projects/import - Parse uploaded .xlsx and return structured data
router.post('/import', auth, authorize('owner', 'director'), uploadLimiter,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: 'No file uploaded' });
      }

      const fs = require('fs');
      const fileData = req.file.buffer || fs.readFileSync(req.file.path);
      const wb = XLSX.read(fileData, { type: 'buffer', cellDates: true });

      // Helper to normalise header names for flexible matching
      const norm = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

      const parseDate = (v) => {
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().split('T')[0];
        const s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s;
      };

      // ---- Sheet 1: Project Info ----
      const projectSheet = wb.Sheets[wb.SheetNames[0]];
      const projectRows = XLSX.utils.sheet_to_json(projectSheet, { defval: '' });

      let projectData = { nama: '', lokasi: '', description: '', totalBudget: 0, startDate: '', endDate: '' };
      if (projectRows.length > 0) {
        const row = projectRows[0];
        const keys = Object.keys(row);
        const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

        const nameKey = find(['namaproyek', 'projectname', 'nama']);
        const locKey = find(['lokasi', 'location']);
        const descKey = find(['deskripsi', 'description', 'desc']);
        const budgetKey = find(['totalanggaran', 'totalbudget', 'anggaran', 'budget']);
        const startKey = find(['tanggalmulai', 'startdate', 'mulai', 'start']);
        const endKey = find(['tanggalselesai', 'enddate', 'selesai', 'end']);

        projectData = {
          nama: String(row[nameKey] || ''),
          lokasi: String(row[locKey] || ''),
          description: String(row[descKey] || ''),
          totalBudget: Number(row[budgetKey]) || 0,
          startDate: parseDate(row[startKey]),
          endDate: parseDate(row[endKey]),
        };
      }

      // ---- Sheet 2: Supplies ----
      const supplies = [];
      if (wb.SheetNames.length > 1) {
        const supplySheet = wb.Sheets[wb.SheetNames[1]];
        const supplyRows = XLSX.utils.sheet_to_json(supplySheet, { defval: '' });

        for (const row of supplyRows) {
          const keys = Object.keys(row);
          const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

          const itemKey = find(['namabarang', 'itemname', 'item', 'nama']);
          const qtyKey = find(['jumlah', 'qty', 'quantity']);
          const unitKey = find(['satuan', 'unit']);
          const costKey = find(['biaya', 'cost', 'harga']);
          const startKey = find(['tanggalmulai', 'startdate', 'mulai', 'start']);
          const endKey = find(['tanggalselesai', 'enddate', 'selesai', 'end']);

          const item = String(row[itemKey] || '').trim();
          if (!item) continue; // skip empty rows

          supplies.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            item,
            qty: Number(row[qtyKey]) || 0,
            unit: String(row[unitKey] || 'pcs'),
            cost: Number(row[costKey]) || 0,
            status: 'Pending',
            startDate: parseDate(row[startKey]),
            endDate: parseDate(row[endKey]),
          });
        }
      }

      // ---- Sheet 3: Work Items ----
      const workItems = [];
      if (wb.SheetNames.length > 2) {
        const workSheet = wb.Sheets[wb.SheetNames[2]];
        const workRows = XLSX.utils.sheet_to_json(workSheet, { defval: '' });

        for (const row of workRows) {
          const keys = Object.keys(row);
          const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

          const nameKey = find(['namapekerjaan', 'workitemname', 'name', 'nama', 'pekerjaan']);
          const qtyKey = find(['jumlah', 'qty', 'quantity', 'volume']);
          const unitKey = find(['satuan', 'unit']);
          const costKey = find(['biaya', 'cost', 'harga']);
          const startKey = find(['tanggalmulai', 'startdate', 'mulai', 'start']);
          const endKey = find(['tanggalselesai', 'enddate', 'selesai', 'end']);

          const name = String(row[nameKey] || '').trim();
          if (!name) continue;

          const unitVal = String(row[unitKey] || 'M2');
          workItems.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            name,
            qty: Number(row[qtyKey]) || 0,
            unit: unitVal,
            volume: unitVal,
            cost: Number(row[costKey]) || 0,
            startDate: parseDate(row[startKey]),
            endDate: parseDate(row[endKey]),
          });
        }
      }

      res.json({ projectData, supplies, workItems });
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
router.put('/:id', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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
router.put('/:id/progress', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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

// POST /api/projects/:id/daily-report - Add daily report with per-item progress (supports photo uploads)
router.post('/:id/daily-report', auth, authorize('supervisor', 'asset_admin', 'owner', 'director', 'foreman'), uploadLimiter,
  upload.array('photos', 5),
  async (req, res) => {
  try {
    // Parse JSON fields from multipart form data
    const weather = req.body.weather;
    const materials = req.body.materials;
    const workforce = req.body.workforce;
    const notes = req.body.notes;
    const date = req.body.date;
    const workItemUpdates = req.body.workItemUpdates ? JSON.parse(req.body.workItemUpdates) : [];
    const supplyUpdates = req.body.supplyUpdates ? JSON.parse(req.body.supplyUpdates) : [];
    
    // Collect uploaded photo paths
    const photoPaths = (req.files || []).map(f => f.path.replace(/\\/g, '/'));
    
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
      photos: photoPaths,
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
router.put('/:id/work-items/:itemId/progress', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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
router.post('/:id/supplies', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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
router.put('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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
router.delete('/:id/supplies/:supplyId', auth, authorize('owner', 'director', 'supervisor', 'asset_admin'), async (req, res) => {
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
// ===== Material Usage Logs =====

// POST /api/projects/:id/material-logs - Log material usage
router.post('/:id/material-logs', auth, authorize('supervisor', 'asset_admin', 'owner', 'director', 'admin'), async (req, res) => {
  try {
    const { supplyId, qtyUsed, notes, date } = req.body;

    if (!supplyId || !qtyUsed || qtyUsed <= 0) {
      return res.status(400).json({ msg: 'supplyId and a positive qtyUsed are required' });
    }

    const supply = await Supply.findOne({ _id: supplyId, projectId: req.params.id });
    if (!supply) {
      return res.status(404).json({ msg: 'Supply not found for this project' });
    }

    // Update running total on the supply
    supply.totalQtyUsed = (supply.totalQtyUsed || 0) + Number(qtyUsed);
    await supply.save();

    const qtyLeft = Math.max(0, supply.qty - supply.totalQtyUsed);

    const log = new MaterialLog({
      projectId: req.params.id,
      supplyId,
      date: date ? new Date(date) : new Date(),
      qtyUsed: Number(qtyUsed),
      qtyLeft,
      notes,
      recordedBy: req.user._id,
    });
    await log.save();

    // Populate for the response
    await log.populate('supplyId', 'item unit qty totalQtyUsed');
    await log.populate('recordedBy', 'fullName');

    res.status(201).json(log);
  } catch (error) {
    console.error('Create material log error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/:id/material-logs - Get material usage logs
router.get('/:id/material-logs', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const query = { projectId: req.params.id };

    if (date) {
      // Match logs for the entire day (timezone-safe using start/end of day)
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const logs = await MaterialLog.find(query)
      .populate('supplyId', 'item unit qty totalQtyUsed')
      .populate('recordedBy', 'fullName')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (error) {
    console.error('Get material logs error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// === PROJECT REPORT ROUTES ===

// GET /api/projects/:id/reports - List submitted reports for a project
router.get('/:id/reports', auth, async (req, res) => {
  try {
    const reports = await ProjectReport.find({ projectId: req.params.id })
      .populate('submittedBy', 'fullName role')
      .populate('authorization.directorId', 'fullName')
      .sort({ createdAt: -1 });
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

module.exports = router;
