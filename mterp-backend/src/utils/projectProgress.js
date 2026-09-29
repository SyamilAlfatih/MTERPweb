/**
 * Canonical Project Progress Calculator
 * 
 * Single Source of Truth for physical project progress across all views:
 * - Projects List & Cards (/projects)
 * - Project Detail Header & KPI Metrics (/project/:id)
 * - Project Plan / Gantt Top Bar & Summary (/project/:id/plan)
 * - S-Curve (Kurva S) & EVM Metrics
 * - Dashboard Overview (/dashboard)
 * - Daily Reports submission and previews (/projects/:id/daily-report)
 * - Project PDF Reports
 * 
 * Weighting Priority Hierarchy (Standard Indonesian Construction & EVM):
 * 1. Cost-weighted (Planned Cost / BAC):
 *    If any leaf deliverables have plannedCost > 0, weight_i = task_i.plannedCost.
 *    Progress = Sum(plannedCost_i * percentComplete_i) / Sum(plannedCost_i).
 * 2. Physical Weight (Contract Bobot Fisik %):
 *    If total plannedCost is 0 across all items, but sum(physicalWeight) > 0,
 *    weight_i = task_i.physicalWeight.
 * 3. Duration-weighted:
 *    If neither cost nor physical weight exists (pure timeline schedule),
 *    weight_i = max(1, task_i.duration).
 * 4. Equal-weighted:
 *    Fallback average across leaf items.
 */

function calculateProjectProgress(project, tasks = null) {
  let items = [];

  // 1. Prefer canonical ProjectTask collection if available
  if (Array.isArray(tasks) && tasks.length > 0) {
    const leafTasks = tasks.filter(t => !t.isSummary);
    items = (leafTasks.length > 0 ? leafTasks : tasks).map(t => ({
      name: t.name,
      percentComplete: Math.min(100, Math.max(0, Number(t.percentComplete || 0))),
      plannedCost: Number(t.plannedCost || ((Number(t.quantity) || 1) * (Number(t.unitRate) || 0)) || 0),
      physicalWeight: Number(t.physicalWeight || 0),
      duration: Math.max(0, Number(t.duration || 0)),
    }));
  } else if (project) {
    // 2. Fallback to Project embedded workItems and supplies
    const workItems = Array.isArray(project.workItems) ? project.workItems : [];
    const supplies = Array.isArray(project.supplies) ? project.supplies : [];
    const STATUS_PROGRESS = { 'Pending': 0, 'Ordered': 50, 'Delivered': 100 };

    workItems.forEach(w => {
      items.push({
        name: w.name,
        percentComplete: Math.min(100, Math.max(0, Number(w.percentComplete ?? w.progress ?? 0))),
        plannedCost: Number(w.plannedCost || w.cost || ((Number(w.qty) || 1) * (Number(w.unitRate) || 0)) || 0),
        physicalWeight: Number(w.physicalWeight || 0),
        duration: Math.max(0, Number(w.duration || 0)),
      });
    });

    supplies.forEach(s => {
      const supPct = s.percentComplete !== undefined
        ? Number(s.percentComplete)
        : (STATUS_PROGRESS[s.status] !== undefined ? STATUS_PROGRESS[s.status] : 0);
      items.push({
        name: s.item || s.name,
        percentComplete: Math.min(100, Math.max(0, supPct)),
        plannedCost: Number(s.plannedCost || s.cost || ((Number(s.qty) || 1) * (Number(s.unitRate) || 0)) || 0),
        physicalWeight: Number(s.physicalWeight || 0),
        duration: Math.max(0, Number(s.duration || 0)),
      });
    });
  }

  // If no items at all, return stored progress or 0
  if (items.length === 0) {
    const fallback = Math.min(100, Math.max(0, Number(project?.progress || 0)));
    return {
      progress: Math.round(fallback),
      progressExact: Number(fallback.toFixed(2)),
      totalWeight: 0,
      weightingMode: 'fallback',
    };
  }

  // 1. Cost-weighted (Planned Cost / BAC)
  const totalCost = items.reduce((sum, item) => sum + (item.plannedCost > 0 ? item.plannedCost : 0), 0);
  if (totalCost > 0) {
    const weightedSum = items.reduce((sum, item) => {
      const weight = item.plannedCost > 0 ? item.plannedCost : 0;
      return sum + (item.percentComplete * weight);
    }, 0);
    const progressExact = Number((weightedSum / totalCost).toFixed(2));
    return {
      progress: Math.round(progressExact),
      progressExact,
      totalWeight: totalCost,
      weightingMode: 'cost',
    };
  }

  // 2. Physical weight (contract weights % without cost)
  const totalPhysWeight = items.reduce((sum, item) => sum + (item.physicalWeight > 0 ? item.physicalWeight : 0), 0);
  if (totalPhysWeight > 0) {
    const weightedSum = items.reduce((sum, item) => {
      const weight = item.physicalWeight > 0 ? item.physicalWeight : 0;
      return sum + (item.percentComplete * weight);
    }, 0);
    const progressExact = Number((weightedSum / totalPhysWeight).toFixed(2));
    return {
      progress: Math.round(progressExact),
      progressExact,
      totalWeight: totalPhysWeight,
      weightingMode: 'weight',
    };
  }

  // 3. Duration-weighted (schedules without financial values)
  const totalDuration = items.reduce((sum, item) => sum + (item.duration > 0 ? item.duration : 0), 0);
  if (totalDuration > 0) {
    const weightedSum = items.reduce((sum, item) => {
      const weight = item.duration > 0 ? item.duration : 0;
      return sum + (item.percentComplete * weight);
    }, 0);
    const progressExact = Number((weightedSum / totalDuration).toFixed(2));
    return {
      progress: Math.round(progressExact),
      progressExact,
      totalWeight: totalDuration,
      weightingMode: 'duration',
    };
  }

  // 4. Equal-weighted fallback
  const sumProgress = items.reduce((sum, item) => sum + item.percentComplete, 0);
  const progressExact = Number((sumProgress / items.length).toFixed(2));
  return {
    progress: Math.round(progressExact),
    progressExact,
    totalWeight: items.length,
    weightingMode: 'equal',
  };
}

/**
 * Synchronize and persist canonical progress for a single project by ID.
 * Returns the computed progress object or null if project not found.
 */
async function syncProjectProgress(projectId) {
  const { Project, ProjectTask, Supply } = require('../models');
  const project = await Project.findById(projectId);
  if (!project) return null;

  let tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
  if (tasks.length === 0) {
    project.supplies = await Supply.find({ projectId }).lean();
  }

  const result = calculateProjectProgress(project, tasks);
  if (project.progress !== result.progress) {
    project.progress = result.progress;
    await Project.updateOne(
      { _id: project._id },
      { $set: { progress: result.progress, updatedAt: new Date() } }
    );
  }

  return result;
}

/**
 * Audit and synchronize canonical progress for all projects in the database.
 */
async function syncAllProjectsProgress() {
  const { Project } = require('../models');
  const projects = await Project.find().select('_id nama progress').lean();
  const results = [];
  for (const p of projects) {
    try {
      const res = await syncProjectProgress(p._id);
      if (res) results.push({ id: p._id, nama: p.nama, ...res });
    } catch (err) {
      console.error(`Failed to sync progress for project ${p.nama || p._id}:`, err.message);
    }
  }
  return results;
}

module.exports = {
  calculateProjectProgress,
  syncProjectProgress,
  syncAllProjectsProgress,
};
