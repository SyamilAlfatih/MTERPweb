const express = require('express');
const ExcelJS = require('exceljs');
const { AuditLog } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { parseWIBDate, wibDayRange } = require('../utils/date');

const router = express.Router();

const EXECUTIVE_ROLES = ['owner', 'director', 'president_director', 'operational_director'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a MongoDB filter object from query parameters.
 */
function buildAuditFilter(query) {
  const filter = {};
  const { search, module: mod, action, actorId, success, startDate, endDate } = query;

  if (mod && mod !== 'ALL') {
    filter.module = mod;
  }

  if (action && action !== 'ALL') {
    filter.action = action;
  }

  if (actorId && actorId !== 'ALL') {
    filter.actorId = actorId;
  }

  if (success === 'true') {
    filter.success = true;
  } else if (success === 'false') {
    filter.success = false;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const start = parseWIBDate(startDate);
      if (start) filter.createdAt.$gte = start;
    }
    if (endDate) {
      const endRange = wibDayRange(endDate);
      if (endRange) filter.createdAt.$lte = endRange.end;
    }
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [
      { actorName: regex },
      { actorUsername: regex },
      { summary: regex },
      { endpoint: regex },
      { entityId: regex },
      { ipAddress: regex },
    ];
  }

  return filter;
}

// GET /api/audit-logs/stats - Executive KPI summary
router.get('/stats', auth, authorize(...EXECUTIVE_ROLES), async (req, res) => {
  try {
    const todayRange = wibDayRange();
    const todayFilter = todayRange
      ? { createdAt: { $gte: todayRange.start, $lte: todayRange.end } }
      : {};

    const [totalLogs, todayLogs, failedEvents, loginFailedEvents, topModules, topActors] =
      await Promise.all([
        AuditLog.countDocuments(),
        AuditLog.countDocuments(todayFilter),
        AuditLog.countDocuments({ success: false }),
        AuditLog.countDocuments({ action: 'LOGIN_FAILED' }),
        AuditLog.aggregate([
          { $group: { _id: '$module', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
        AuditLog.aggregate([
          { $match: { actorId: { $ne: null } } },
          {
            $group: {
              _id: '$actorId',
              actorName: { $first: '$actorName' },
              actorRole: { $first: '$actorRole' },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

    res.json({
      totalLogs,
      todayLogs,
      failedEvents,
      loginFailedEvents,
      topModules: topModules.map((m) => ({ module: m._id, count: m.count })),
      topActors: topActors.map((a) => ({
        actorId: a._id,
        actorName: a.actorName,
        actorRole: a.actorRole,
        count: a.count,
      })),
    });
  } catch (error) {
    console.error('Error fetching audit log stats:', error);
    res.status(500).json({ msg: 'Gagal mengambil statistik audit logs' });
  }
});

// GET /api/audit-logs/export/excel - Export filtered audit logs to Excel
router.get('/export/excel', auth, authorize(...EXECUTIVE_ROLES), async (req, res) => {
  try {
    const filter = buildAuditFilter(req.query);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MTERP Audit System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Audit Logs');
    sheet.columns = [
      { header: 'Waktu (WIB)', key: 'timestamp', width: 22 },
      { header: 'Aktor', key: 'actorName', width: 24 },
      { header: 'Username', key: 'actorUsername', width: 18 },
      { header: 'Role', key: 'actorRole', width: 18 },
      { header: 'Aksi', key: 'action', width: 15 },
      { header: 'Modul', key: 'module', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'HTTP', key: 'statusCode', width: 8 },
      { header: 'Ringkasan Aktivitas', key: 'summary', width: 45 },
      { header: 'Method', key: 'method', width: 10 },
      { header: 'Endpoint', key: 'endpoint', width: 35 },
      { header: 'Entity ID', key: 'entityId', width: 26 },
      { header: 'IP Address', key: 'ipAddress', width: 18 },
      { header: 'Durasi (ms)', key: 'durationMs', width: 12 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };

    logs.forEach((log) => {
      const wibTime = new Date(log.createdAt).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      sheet.addRow({
        timestamp: wibTime,
        actorName: log.actorName || '-',
        actorUsername: log.actorUsername || '-',
        actorRole: log.actorRole || '-',
        action: log.action,
        module: log.module,
        status: log.success ? 'Berhasil' : 'Gagal',
        statusCode: log.statusCode,
        summary: log.summary,
        method: log.method,
        endpoint: log.endpoint,
        entityId: log.entityId || '-',
        ipAddress: log.ipAddress || '-',
        durationMs: log.durationMs ?? 0,
      });
    });

    res.locals.auditSummary = `Export Excel Audit Logs (${logs.length} baris)`;

    const dateTag = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="MTERP-Audit-Logs-${dateTag}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ msg: 'Gagal mengekspor audit logs' });
  }
});

// GET /api/audit-logs - Paginated & filtered list of audit logs
router.get('/', auth, authorize(...EXECUTIVE_ROLES), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const filter = buildAuditFilter(req.query);

    const [logs, total, distinctModules, distinctActions] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('module'),
      AuditLog.distinct('action'),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filterOptions: {
        modules: distinctModules.sort(),
        actions: distinctActions.sort(),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ msg: 'Gagal mengambil data audit logs' });
  }
});

module.exports = router;

