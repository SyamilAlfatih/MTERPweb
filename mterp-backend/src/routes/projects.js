const express = require('express');
const { Project, Supply, DailyReport, MaterialLog, ProjectReport } = require('../models');
const bcrypt = require('bcryptjs');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const ExcelJS = require('exceljs');
const { parseWIBDate, nowWIB, wibDayRange } = require('../utils/date');

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
function addSheetData(ws, headers, rows, colWidth) {
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => { cell.alignment = { horizontal: 'center' }; });
  rows.forEach(r => ws.addRow(r));
  ws.columns = headers.map(() => ({ width: colWidth || 22 }));
}

// Helper: convert ExcelJS worksheet to array-of-objects using row 1 as headers
function sheetToJson(ws) {
  const rows = [];
  const headers = [];
  ws.eachRow((row, rowNum) => {
    const values = row.values; // 1-indexed
    if (rowNum === 1) {
      for (let i = 1; i < values.length; i++) headers.push(String(values[i] || ''));
    } else {
      const obj = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = values[i + 1] ?? '';
      rows.push(obj);
    }
  });
  return rows;
}

// GET /api/projects/import-template - Download a blank .xlsx template
router.get('/import-template', auth, authorize('owner', 'director'), async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();

    const wsProject = wb.addWorksheet('Project Info');
    addSheetData(wsProject,
      ['Nama Proyek', 'Lokasi', 'Deskripsi', 'Total Anggaran', 'Tanggal Mulai', 'Tanggal Selesai'],
      [['Proyek Jembatan Kali', 'Jakarta Selatan', 'Pembangunan jembatan penyeberangan', 500000000, '2026-04-01', '2026-12-31']],
      22
    );

    const wsSupply = wb.addWorksheet('Supplies');
    addSheetData(wsSupply,
      ['Nama Barang', 'Jumlah', 'Satuan', 'Biaya', 'Tanggal Mulai', 'Tanggal Selesai'],
      [['Semen Tiga Roda', 100, 'sak', 7500000, '2026-04-01', '2026-04-15']],
      18
    );

    const wsWork = wb.addWorksheet('Work Items');
    addSheetData(wsWork,
      ['Nama Pekerjaan', 'Jumlah', 'Satuan', 'Biaya', 'Tanggal Mulai', 'Tanggal Selesai'],
      [['Pekerjaan Pondasi', 50, 'M3', 25000000, '2026-04-01', '2026-06-30']],
      18
    );

    const buf = await wb.xlsx.writeBuffer();

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

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(fileData);

      // Helper to normalise header names for flexible matching
      const norm = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

      const parseDate = (v) => {
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().split('T')[0];
        const s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return s;
      };

      const sheets = wb.worksheets;

      // ---- Sheet 1: Project Info ----
      let projectData = { nama: '', lokasi: '', description: '', totalBudget: 0, startDate: '', endDate: '' };
      if (sheets.length > 0) {
        const projectRows = sheetToJson(sheets[0]);
        if (projectRows.length > 0) {
          const row = projectRows[0];
          const keys = Object.keys(row);
          const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

          projectData = {
            nama: String(row[find(['namaproyek', 'projectname', 'nama'])] || ''),
            lokasi: String(row[find(['lokasi', 'location'])] || ''),
            description: String(row[find(['deskripsi', 'description', 'desc'])] || ''),
            totalBudget: Number(row[find(['totalanggaran', 'totalbudget', 'anggaran', 'budget'])]) || 0,
            startDate: parseDate(row[find(['tanggalmulai', 'startdate', 'mulai', 'start'])]),
            endDate: parseDate(row[find(['tanggalselesai', 'enddate', 'selesai', 'end'])]),
          };
        }
      }

      // ---- Sheet 2: Supplies ----
      const supplies = [];
      if (sheets.length > 1) {
        const supplyRows = sheetToJson(sheets[1]);
        for (const row of supplyRows) {
          const keys = Object.keys(row);
          const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

          const item = String(row[find(['namabarang', 'itemname', 'item', 'nama'])] || '').trim();
          if (!item) continue;

          supplies.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            item,
            qty: Number(row[find(['jumlah', 'qty', 'quantity'])]) || 0,
            unit: String(row[find(['satuan', 'unit'])] || 'pcs'),
            cost: Number(row[find(['biaya', 'cost', 'harga'])]) || 0,
            status: 'Pending',
            startDate: parseDate(row[find(['tanggalmulai', 'startdate', 'mulai', 'start'])]),
            endDate: parseDate(row[find(['tanggalselesai', 'enddate', 'selesai', 'end'])]),
          });
        }
      }

      // ---- Sheet 3: Work Items ----
      const workItems = [];
      if (sheets.length > 2) {
        const workRows = sheetToJson(sheets[2]);
        for (const row of workRows) {
          const keys = Object.keys(row);
          const find = (targets) => keys.find(k => targets.includes(norm(k))) || '';

          const name = String(row[find(['namapekerjaan', 'workitemname', 'name', 'nama', 'pekerjaan'])] || '').trim();
          if (!name) continue;

          const unitVal = String(row[find(['satuan', 'unit'])] || 'M2');
          workItems.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            name,
            qty: Number(row[find(['jumlah', 'qty', 'quantity', 'volume'])]) || 0,
            unit: unitVal,
            volume: unitVal,
            cost: Number(row[find(['biaya', 'cost', 'harga'])]) || 0,
            startDate: parseDate(row[find(['tanggalmulai', 'startdate', 'mulai', 'start'])]),
            endDate: parseDate(row[find(['tanggalselesai', 'enddate', 'selesai', 'end'])]),
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
      .populate('assignedTo', 'fullName role')
      .lean();
    
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Fetch supplies from separate collection
    const supplies = await Supply.find({ projectId: project._id }).sort({ createdAt: 1 }).lean();
    
    // Merge supplies into response for backward compatibility
    project.supplies = supplies;
    
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/projects/:id/supplies - Get only supplies for a project
router.get('/:id/supplies', auth, async (req, res) => {
  try {
    const supplies = await Supply.find({ projectId: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json(supplies);
  } catch (error) {
    console.error('Get project supplies error:', error);
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
        startDate: parseWIBDate(startDate) || undefined,
        endDate: parseWIBDate(endDate) || undefined,
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
