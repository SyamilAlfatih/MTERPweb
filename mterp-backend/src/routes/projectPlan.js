const express = require('express');
const router = express.Router({ mergeParams: true });
const ExcelJS = require('exceljs');
const multer = require('multer');
const { Project, ProjectTask, ProjectCalendar, ProjectResource, User } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const {
  recalculateProjectSchedule,
  detectCycle,
  recalculateWBSCodes,
  countWorkingDays,
  calculateFinishDate,
  getStandardIndonesianHolidays,
  detectResourceOverallocations,
  levelProjectResources,
  normalizeDate,
} = require('../utils/scheduling');
const {
  calculateProjectEV,
  generateSCurveData,
  calculateTaskEV,
} = require('../utils/earnedValue');
const {
  ensureProjectTasksFromLegacy,
  syncProjectTasksToProjectEntities,
} = require('../utils/projectSync');

// Memory storage for Excel and XML imports
const planUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * Helper to get or initialize default ProjectCalendar
 */
async function getOrCreateProjectCalendar(projectId) {
  let calendar = await ProjectCalendar.findOne({ projectId, isDefault: true }).lean();
  if (!calendar) {
    const currentYear = new Date().getFullYear();
    const defaultExceptions = getStandardIndonesianHolidays(currentYear);
    calendar = await ProjectCalendar.create({
      projectId,
      name: 'Standard Construction (Mon-Sat)',
      isDefault: true,
      workingDays: [1, 2, 3, 4, 5, 6],
      hoursPerDay: 8,
      exceptions: defaultExceptions,
    });
    calendar = calendar.toObject ? calendar.toObject() : calendar;
  }
  return calendar;
}

/**
 * Helper to bulk save an array of ProjectTasks after recalculation
 */
async function bulkSaveTasks(tasks) {
  const operations = tasks.map(task => ({
    updateOne: {
      filter: { _id: task._id },
      update: {
        $set: {
          wbsCode: task.wbsCode,
          outlineLevel: task.outlineLevel,
          parentTaskId: task.parentTaskId,
          sortOrder: task.sortOrder,
          isSummary: task.isSummary,
          isMilestone: task.isMilestone,
          startDate: task.startDate,
          finishDate: task.finishDate,
          duration: task.duration,
          percentComplete: task.percentComplete,
          plannedCost: task.plannedCost,
          actualCost: task.actualCost,
          plannedWork: task.plannedWork,
          actualWork: task.actualWork,
          remainingWork: task.remainingWork || 0,
          taskType: task.taskType || 'FixedUnits',
          isEffortDriven: task.isEffortDriven !== undefined ? task.isEffortDriven : true,
          levelingDelay: task.levelingDelay || 0,
          constraintType: task.constraintType || 'ASAP',
          constraintDate: task.constraintDate || null,
          deadlineDate: task.deadlineDate || null,
        },
      },
    },
  }));

  if (operations.length > 0) {
    await ProjectTask.bulkWrite(operations);
  }
}

/**
 * Helper to load all tasks for a project, run schedule recalculation, and persist
 */
async function loadAndRecalculateSchedule(projectId) {
  const project = await Project.findById(projectId).lean();
  const calendar = await getOrCreateProjectCalendar(projectId);
  const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });

  if (tasks.length === 0) return [];

  const plainTasks = tasks.map(t => (t.toObject ? t.toObject() : t));
  recalculateProjectSchedule(plainTasks, project ? project.startDate : null, calendar);
  await bulkSaveTasks(plainTasks);

  // Synchronize to Project.workItems and Supply collection
  await syncProjectTasksToProjectEntities(projectId);

  // Return fresh populated tasks
  return await ProjectTask.find({ projectId })
    .sort({ sortOrder: 1 })
    .populate('assignedResources.userId', 'name role')
    .lean();
}

// ==========================================
// 1. GET /tasks - Get all tasks for project
// ==========================================
router.get('/tasks', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Auto-migrate legacy work items & supplies if not yet present
    await ensureProjectTasksFromLegacy(projectId);

    const tasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    if (tasks.length > 0) {
      // Run in-memory CPM calculation so isCritical, totalFloat and freeFloat are computed
      try {
        const calendar = await getOrCreateProjectCalendar(projectId);
        recalculateProjectSchedule(tasks, project.startDate, calendar);
      } catch (scheduleErr) {
        console.warn('Warning: CPM calculation on fetch encountered error:', scheduleErr.message);
      }
    }

    res.json({ success: true, count: tasks.length, tasks });
  } catch (err) {
    console.error('Error fetching project plan tasks:', err);
    res.status(500).json({ msg: 'Failed to fetch tasks', error: err.message });
  }
});

// ==========================================
// 2. POST /tasks - Create a new task
// ==========================================
router.post('/tasks', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const {
      name,
      duration = 1,
      durationUnit = 'days',
      startDate,
      outlineLevel = 1,
      sortOrder,
      isMilestone = false,
      predecessors = [],
      assignedResources = [],
      barColor,
      notes,
      priority = 500,
      constraintType = 'ASAP',
      constraintDate,
      deadlineDate,
      plannedCost = 0,
      actualCost = 0,
      plannedWork = 0,
      itemType = 'work',
      category = 'general',
      quantity = 1,
      unit = 'ls',
      unitRate = 0,
      supplyStatus = 'Pending',
      deliveryDate,
      physicalWeight = 0,
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ msg: 'Task name is required' });
    }

    // Determine sortOrder position
    let targetOrder = typeof sortOrder === 'number' ? sortOrder : -1;
    if (targetOrder === -1) {
      const lastTask = await ProjectTask.findOne({ projectId }).sort({ sortOrder: -1 }).lean();
      targetOrder = lastTask ? lastTask.sortOrder + 1 : 0;
    } else {
      // Shift subsequent tasks down
      await ProjectTask.updateMany(
        { projectId, sortOrder: { $gte: targetOrder } },
        { $inc: { sortOrder: 1 } }
      );
    }

    const initialStart = startDate ? new Date(startDate) : (project.startDate || new Date());
    const dur = isMilestone ? 0 : Math.max(0, Number(duration) || 1);
    const finish = calculateFinishDate(initialStart, dur);

    const computedPlannedCost = Number(plannedCost) || (Number(quantity || 1) * Number(unitRate || 0));

    const newTask = new ProjectTask({
      projectId,
      name: name.trim(),
      duration: dur,
      durationUnit,
      startDate: initialStart,
      finishDate: finish,
      outlineLevel: Math.max(1, Number(outlineLevel) || 1),
      sortOrder: targetOrder,
      isMilestone: Boolean(isMilestone),
      predecessors,
      assignedResources,
      barColor,
      notes,
      priority,
      constraintType,
      constraintDate: constraintDate ? new Date(constraintDate) : null,
      deadlineDate: deadlineDate ? new Date(deadlineDate) : null,
      plannedCost: computedPlannedCost,
      actualCost: Number(actualCost) || 0,
      plannedWork: Number(plannedWork) || 0,
      itemType,
      category,
      quantity: Number(quantity) || 1,
      unit: unit || 'ls',
      unitRate: Number(unitRate) || 0,
      totalBudget: computedPlannedCost,
      supplyStatus,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      physicalWeight: Number(physicalWeight) || 0,
      createdBy: req.user._id,
    });

    await newTask.save();

    // Recalculate full project schedule
    const updatedTasks = await loadAndRecalculateSchedule(projectId);

    res.status(201).json({
      success: true,
      task: newTask,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error creating project task:', err);
    res.status(500).json({ msg: 'Failed to create task', error: err.message });
  }
});

// ==========================================
// 3. PUT /tasks/:taskId - Update a task
// ==========================================
router.put('/tasks/:taskId', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const task = await ProjectTask.findOne({ _id: taskId, projectId });
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    const updatable = [
      'name',
      'duration',
      'durationUnit',
      'startDate',
      'finishDate',
      'percentComplete',
      'outlineLevel',
      'sortOrder',
      'isMilestone',
      'predecessors',
      'assignedResources',
      'constraintType',
      'constraintDate',
      'deadlineDate',
      'plannedCost',
      'actualCost',
      'plannedWork',
      'actualWork',
      'remainingWork',
      'barColor',
      'notes',
      'priority',
      'taskType',
      'isEffortDriven',
      'levelingDelay',
      'calendarId',
      'itemType',
      'category',
      'quantity',
      'unit',
      'unitRate',
      'supplyStatus',
      'deliveryDate',
      'realizedQuantity',
      'realizedAmount',
      'physicalWeight',
    ];

    updatable.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'startDate' || field === 'finishDate' || field === 'constraintDate' || field === 'deadlineDate' || field === 'deliveryDate') {
          task[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'isMilestone') {
          task.isMilestone = Boolean(req.body.isMilestone);
          if (task.isMilestone) task.duration = 0;
        } else {
          task[field] = req.body[field];
        }
      }
    });

    if (req.body.quantity !== undefined || req.body.unitRate !== undefined) {
      if (req.body.plannedCost === undefined) {
        task.plannedCost = (Number(task.quantity) || 1) * (Number(task.unitRate) || 0);
      }
      task.totalBudget = task.plannedCost;
    }

    await task.save();

    // Recalculate schedule
    const updatedTasks = await loadAndRecalculateSchedule(projectId);

    res.json({
      success: true,
      task,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error updating project task:', err);
    res.status(500).json({ msg: 'Failed to update task', error: err.message });
  }
});

// ==========================================
// 4. DELETE /tasks/:taskId - Delete a task
// ==========================================
router.delete('/tasks/:taskId', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const task = await ProjectTask.findOne({ _id: taskId, projectId });
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    // Find if this task has children (subtasks)
    const allTasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
    const taskIdx = allTasks.findIndex(t => t._id.toString() === taskId);

    const idsToDelete = [task._id];

    // If it is a summary task, find all subordinate tasks that belong to its block
    if (task.isSummary && taskIdx !== -1) {
      const parentLevel = task.outlineLevel;
      for (let i = taskIdx + 1; i < allTasks.length; i++) {
        if (allTasks[i].outlineLevel > parentLevel) {
          idsToDelete.push(allTasks[i]._id);
        } else {
          break;
        }
      }
    }

    // Delete tasks
    await ProjectTask.deleteMany({ _id: { $in: idsToDelete } });

    // Clean up predecessors referencing deleted tasks
    await ProjectTask.updateMany(
      { projectId },
      { $pull: { predecessors: { taskId: { $in: idsToDelete } } } }
    );

    // Re-index sortOrder for remaining tasks
    const remaining = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].sortOrder = i;
      await remaining[i].save();
    }

    // Recalculate schedule
    const updatedTasks = await loadAndRecalculateSchedule(projectId);

    res.json({
      success: true,
      deletedCount: idsToDelete.length,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ msg: 'Failed to delete task', error: err.message });
  }
});

// ==========================================
// 5. PUT /tasks/:taskId/indent - Indent a task
// ==========================================
router.put('/tasks/:taskId/indent', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
    const idx = tasks.findIndex(t => t._id.toString() === taskId);

    if (idx <= 0) {
      return res.status(400).json({ msg: 'Cannot indent the first task in the project.' });
    }

    const task = tasks[idx];
    const prevTask = tasks[idx - 1];

    // Max outlineLevel can only be prevTask.outlineLevel + 1
    if (task.outlineLevel > prevTask.outlineLevel) {
      return res.status(400).json({ msg: 'Task is already indented under the task above.' });
    }

    const oldLevel = task.outlineLevel;
    task.outlineLevel += 1;
    await task.save();

    // Also indent descendants if any
    for (let i = idx + 1; i < tasks.length; i++) {
      if (tasks[i].outlineLevel > oldLevel) {
        tasks[i].outlineLevel += 1;
        await tasks[i].save();
      } else {
        break;
      }
    }

    const updatedTasks = await loadAndRecalculateSchedule(projectId);
    res.json({ success: true, tasks: updatedTasks });
  } catch (err) {
    console.error('Error indenting task:', err);
    res.status(500).json({ msg: 'Failed to indent task', error: err.message });
  }
});

// ==========================================
// 6. PUT /tasks/:taskId/outdent - Outdent a task
// ==========================================
router.put('/tasks/:taskId/outdent', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
    const idx = tasks.findIndex(t => t._id.toString() === taskId);

    if (idx === -1) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    const task = tasks[idx];
    if (task.outlineLevel <= 1) {
      return res.status(400).json({ msg: 'Task is already at top outline level.' });
    }

    const oldLevel = task.outlineLevel;
    task.outlineLevel -= 1;
    await task.save();

    // Also outdent descendants
    for (let i = idx + 1; i < tasks.length; i++) {
      if (tasks[i].outlineLevel > oldLevel) {
        tasks[i].outlineLevel -= 1;
        await tasks[i].save();
      } else {
        break;
      }
    }

    const updatedTasks = await loadAndRecalculateSchedule(projectId);
    res.json({ success: true, tasks: updatedTasks });
  } catch (err) {
    console.error('Error outdenting task:', err);
    res.status(500).json({ msg: 'Failed to outdent task', error: err.message });
  }
});

// ==========================================
// 7. PUT /tasks/:taskId/move - Move task to new sortOrder
// ==========================================
router.put('/tasks/:taskId/move', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const { newSortOrder } = req.body;

    if (typeof newSortOrder !== 'number' || newSortOrder < 0) {
      return res.status(400).json({ msg: 'Valid newSortOrder is required' });
    }

    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });
    const currentIdx = tasks.findIndex(t => t._id.toString() === taskId);

    if (currentIdx === -1) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    const [movedTask] = tasks.splice(currentIdx, 1);
    const clampedIndex = Math.min(newSortOrder, tasks.length);
    tasks.splice(clampedIndex, 0, movedTask);

    for (let i = 0; i < tasks.length; i++) {
      tasks[i].sortOrder = i;
      await tasks[i].save();
    }

    const updatedTasks = await loadAndRecalculateSchedule(projectId);
    res.json({ success: true, tasks: updatedTasks });
  } catch (err) {
    console.error('Error moving task:', err);
    res.status(500).json({ msg: 'Failed to move task', error: err.message });
  }
});

// ==========================================
// 8. PUT /tasks/:taskId/predecessors - Set predecessors
// ==========================================
router.put('/tasks/:taskId/predecessors', auth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const { predecessors = [] } = req.body;

    const task = await ProjectTask.findOne({ _id: taskId, projectId });
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    // Validate self-reference
    for (const pred of predecessors) {
      const pId = (pred.taskId ? (pred.taskId._id || pred.taskId).toString() : null);
      if (pId === taskId) {
        return res.status(400).json({ msg: 'A task cannot depend on itself.' });
      }
    }

    // Check cycle with candidate predecessors
    const allTasks = await ProjectTask.find({ projectId }).lean();
    const candidateTasks = allTasks.map(t => {
      if (t._id.toString() === taskId) {
        return { ...t, predecessors };
      }
      return t;
    });

    if (detectCycle(candidateTasks)) {
      return res.status(400).json({ msg: 'Circular dependency detected. Predecessor cannot be added.' });
    }

    task.predecessors = predecessors;
    await task.save();

    const updatedTasks = await loadAndRecalculateSchedule(projectId);
    res.json({ success: true, task, tasks: updatedTasks });
  } catch (err) {
    console.error('Error setting predecessors:', err);
    res.status(500).json({ msg: 'Failed to update predecessors', error: err.message });
  }
});

// ==========================================
// 9. POST /baseline/:baselineIndex? - Set baseline snapshot (0-10)
// ==========================================
router.post('/baseline/:baselineIndex?', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const rawIdx = req.params.baselineIndex;
    const baselineIndex = rawIdx !== undefined && rawIdx !== '' ? parseInt(rawIdx, 10) : 0;
    const baselineName = req.body.name || (baselineIndex === 0 ? 'Baseline' : `Baseline ${baselineIndex}`);

    const tasks = await ProjectTask.find({ projectId });
    if (tasks.length === 0) {
      return res.status(400).json({ msg: 'No tasks found to set baseline.' });
    }

    const operations = tasks.map(t => {
      const existingBaselines = Array.isArray(t.baselines) ? t.baselines.filter(b => b.baselineIndex !== baselineIndex) : [];
      const newBaseline = {
        baselineIndex,
        name: baselineName,
        startDate: t.startDate,
        finishDate: t.finishDate,
        duration: t.duration,
        cost: t.plannedCost || 0,
        work: t.plannedWork || 0,
        savedAt: new Date(),
      };
      existingBaselines.push(newBaseline);
      existingBaselines.sort((a, b) => a.baselineIndex - b.baselineIndex);

      const setObj = {
        baselines: existingBaselines,
      };

      if (baselineIndex === 0) {
        setObj.baselineStart = t.startDate;
        setObj.baselineFinish = t.finishDate;
        setObj.baselineDuration = t.duration;
        setObj.baselineCost = t.plannedCost || 0;
      }

      return {
        updateOne: {
          filter: { _id: t._id },
          update: { $set: setObj },
        },
      };
    });

    await ProjectTask.bulkWrite(operations);

    const updatedTasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    res.json({
      success: true,
      msg: `${baselineName} saved successfully for all tasks.`,
      baselineIndex,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error setting baseline:', err);
    res.status(500).json({ msg: 'Failed to set baseline', error: err.message });
  }
});

// ==========================================
// 10. DELETE /baseline/:baselineIndex? - Clear baseline
// ==========================================
router.delete('/baseline/:baselineIndex?', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const rawIdx = req.params.baselineIndex;
    const baselineIndex = rawIdx !== undefined && rawIdx !== '' ? parseInt(rawIdx, 10) : 0;

    const tasks = await ProjectTask.find({ projectId });
    const operations = tasks.map(t => {
      const remainingBaselines = Array.isArray(t.baselines) ? t.baselines.filter(b => b.baselineIndex !== baselineIndex) : [];
      const updateObj = {
        $set: { baselines: remainingBaselines },
      };
      if (baselineIndex === 0) {
        updateObj.$set.baselineStart = null;
        updateObj.$set.baselineFinish = null;
        updateObj.$set.baselineDuration = null;
        updateObj.$set.baselineCost = null;
      }
      return {
        updateOne: {
          filter: { _id: t._id },
          update: updateObj,
        },
      };
    });

    if (operations.length > 0) {
      await ProjectTask.bulkWrite(operations);
    }

    const updatedTasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    res.json({
      success: true,
      msg: `Baseline ${baselineIndex === 0 ? '' : baselineIndex} cleared successfully.`,
      baselineIndex,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error clearing baseline:', err);
    res.status(500).json({ msg: 'Failed to clear baseline', error: err.message });
  }
});

// ==========================================
// 10b. GET /calendar - Get project calendar
// ==========================================
router.get('/calendar', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const calendar = await getOrCreateProjectCalendar(projectId);
    res.json({ success: true, calendar });
  } catch (err) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ msg: 'Failed to fetch calendar', error: err.message });
  }
});

// ==========================================
// 10c. PUT /calendar - Update project calendar
// ==========================================
router.put('/calendar', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    let calendar = await ProjectCalendar.findOne({ projectId, isDefault: true });
    if (!calendar) {
      calendar = await getOrCreateProjectCalendar(projectId);
    }

    const { name, workingDays, hoursPerDay, exceptions } = req.body;
    if (name !== undefined) calendar.name = name;
    if (Array.isArray(workingDays)) calendar.workingDays = workingDays;
    if (hoursPerDay !== undefined) calendar.hoursPerDay = hoursPerDay;
    if (Array.isArray(exceptions)) {
      calendar.exceptions = exceptions.map(ex => ({
        name: ex.name,
        startDate: new Date(ex.startDate),
        finishDate: new Date(ex.finishDate || ex.startDate),
        isWorkingDay: Boolean(ex.isWorkingDay),
      }));
    }

    await calendar.save();

    // Recalculate schedule with new calendar
    const updatedTasks = await loadAndRecalculateSchedule(projectId);

    res.json({ success: true, calendar, tasks: updatedTasks });
  } catch (err) {
    console.error('Error updating calendar:', err);
    res.status(500).json({ msg: 'Failed to update calendar', error: err.message });
  }
});

// ==========================================
// 11. POST /recalculate - Force recalculate schedule
// ==========================================
router.post('/recalculate', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const updatedTasks = await loadAndRecalculateSchedule(projectId);
    res.json({ success: true, tasks: updatedTasks });
  } catch (err) {
    console.error('Error recalculating schedule:', err);
    res.status(500).json({ msg: 'Failed to recalculate schedule', error: err.message });
  }
});

// ==========================================
// 12. POST /import-workitems - Import from Project.workItems
// ==========================================
router.post('/import-workitems', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    if (!project.workItems || project.workItems.length === 0) {
      return res.status(400).json({ msg: 'No existing work items found in this project to import.' });
    }

    // Existing tasks to determine current sortOrder offset
    const existing = await ProjectTask.find({ projectId }).lean();
    const existingLegacyIds = new Set(existing.map(t => t.legacyWorkItemId).filter(Boolean));

    let sortOrderCounter = existing.length > 0
      ? Math.max(...existing.map(t => t.sortOrder || 0)) + 1
      : 0;

    const newTasks = [];
    const baseProjectStart = project.startDate || new Date();

    for (const wi of project.workItems) {
      const legacyId = wi._id ? wi._id.toString() : null;
      if (legacyId && existingLegacyIds.has(legacyId)) {
        continue; // Skip if already imported
      }

      const start = wi.startDate ? new Date(wi.startDate) : baseProjectStart;
      let dur = 5;
      let finish = null;

      if (wi.startDate && wi.endDate) {
        dur = Math.max(1, countWorkingDays(wi.startDate, wi.endDate));
        finish = new Date(wi.endDate);
      } else {
        finish = calculateFinishDate(start, dur);
      }

      newTasks.push({
        projectId,
        name: wi.name,
        duration: dur,
        durationUnit: 'days',
        startDate: start,
        finishDate: finish,
        percentComplete: wi.progress || 0,
        outlineLevel: 1,
        sortOrder: sortOrderCounter++,
        plannedCost: wi.cost || 0,
        actualCost: wi.actualCost || 0,
        notes: `Imported from Work Item: ${wi.volume || ''} ${wi.unit || ''} (Qty: ${wi.qty || 0})`,
        legacyWorkItemId: legacyId,
        createdBy: req.user._id,
      });
    }

    if (newTasks.length > 0) {
      await ProjectTask.insertMany(newTasks);
    }

    const updatedTasks = await loadAndRecalculateSchedule(projectId);

    res.json({
      success: true,
      importedCount: newTasks.length,
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error importing work items to project plan:', err);
    res.status(500).json({ msg: 'Failed to import work items', error: err.message });
  }
});

// ==========================================
// 13. GET /critical-path - Critical path tasks
// ==========================================
router.get('/critical-path', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    recalculateProjectSchedule(tasks, project.startDate);

    const criticalTasks = tasks.filter(t => t.isCritical);
    res.json({
      success: true,
      count: criticalTasks.length,
      criticalTaskIds: criticalTasks.map(t => t._id),
      criticalTasks,
    });
  } catch (err) {
    console.error('Error calculating critical path:', err);
    res.status(500).json({ msg: 'Failed to calculate critical path', error: err.message });
  }
});

// ==========================================
// 14. GET /summary - Project plan summary metrics
// ==========================================
router.get('/summary', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    if (tasks.length === 0) {
      return res.json({
        success: true,
        summary: {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          notStartedTasks: 0,
          milestonesCount: 0,
          totalDurationDays: 0,
          earliestStartDate: null,
          latestFinishDate: null,
          overallPercentComplete: 0,
          totalPlannedCost: 0,
          totalActualCost: 0,
          totalPlannedWork: 0,
          totalActualWork: 0,
          criticalTasksCount: 0,
          hasBaseline: false,
        },
      });
    }

    recalculateProjectSchedule(tasks, project.startDate);

    let completedTasks = 0;
    let inProgressTasks = 0;
    let notStartedTasks = 0;
    let milestonesCount = 0;
    let totalPlannedCost = 0;
    let totalActualCost = 0;
    let totalPlannedWork = 0;
    let totalActualWork = 0;
    let criticalTasksCount = 0;
    let hasBaseline = false;
    let earliestStart = null;
    let latestFinish = null;

    tasks.forEach(t => {
      if (t.isMilestone) milestonesCount++;
      if (t.isCritical) criticalTasksCount++;
      if (t.baselineStart) hasBaseline = true;

      // Count only non-summary tasks for statuses and metrics to avoid double counting
      if (!t.isSummary) {
        if (t.percentComplete === 100) completedTasks++;
        else if (t.percentComplete > 0) inProgressTasks++;
        else notStartedTasks++;

        totalPlannedCost += t.plannedCost || 0;
        totalActualCost += t.actualCost || 0;
        totalPlannedWork += t.plannedWork || 0;
        totalActualWork += t.actualWork || 0;
      }

      if (t.startDate) {
        const s = new Date(t.startDate);
        if (!earliestStart || s < earliestStart) earliestStart = s;
      }
      if (t.finishDate) {
        const f = new Date(t.finishDate);
        if (!latestFinish || f > latestFinish) latestFinish = f;
      }
    });

    const totalDuration = (earliestStart && latestFinish)
      ? countWorkingDays(earliestStart, latestFinish)
      : 0;

    // Overall progress weighted by leaf task duration
    const leafTasks = tasks.filter(t => !t.isSummary);
    let weightedProg = 0;
    let totalWeight = 0;
    leafTasks.forEach(t => {
      const w = t.duration || 1;
      weightedProg += (t.percentComplete || 0) * w;
      totalWeight += w;
    });
    const overallPercentComplete = totalWeight > 0 ? Math.round(weightedProg / totalWeight) : 0;

    res.json({
      success: true,
      summary: {
        totalTasks: tasks.length,
        completedTasks,
        inProgressTasks,
        notStartedTasks,
        milestonesCount,
        totalDurationDays: totalDuration,
        earliestStartDate: earliestStart,
        latestFinishDate: latestFinish,
        overallPercentComplete,
        totalPlannedCost,
        totalActualCost,
        totalPlannedWork,
        totalActualWork,
        criticalTasksCount,
        hasBaseline,
      },
    });
  } catch (err) {
    console.error('Error fetching project plan summary:', err);
    res.status(500).json({ msg: 'Failed to fetch summary', error: err.message });
  }
});

// ==========================================
// 15. GET /resources - Get all project resources (auto-seeds if empty)
// ==========================================
router.get('/resources', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    let resources = await ProjectResource.find({ projectId }).sort({ createdAt: 1 }).lean();

    if (resources.length === 0) {
      // Auto-populate default resources from project and users
      const users = await User.find({}).limit(10).lean();
      const defaultResources = users.map(u => ({
        projectId,
        userId: u._id,
        name: u.fullName || u.name,
        type: 'Work',
        initials: (u.fullName || u.name).split(' ').map(p => p[0]).join('').slice(0, 3).toUpperCase(),
        group: u.role === 'foreman' || u.role === 'tukang' ? 'Struktur' : 'Manajemen',
        maxUnits: 100,
        standardRate: u.role === 'foreman' ? 250000 : u.role === 'site_manager' ? 600000 : 350000,
        accrueAt: 'Prorated',
      }));

      // Add common construction material resources
      defaultResources.push({
        projectId,
        name: 'Semen Portland Komposit (PCC)',
        type: 'Material',
        materialLabel: 'sak',
        group: 'Material Utama',
        maxUnits: 1000,
        standardRate: 68000,
        accrueAt: 'Start',
      });
      defaultResources.push({
        projectId,
        name: 'Besi Beton Ulir BJTD-40',
        type: 'Material',
        materialLabel: 'kg',
        group: 'Material Utama',
        maxUnits: 50000,
        standardRate: 14500,
        accrueAt: 'Start',
      });
      defaultResources.push({
        projectId,
        name: 'Ready Mix Concrete K-350',
        type: 'Material',
        materialLabel: 'm3',
        group: 'Material Utama',
        maxUnits: 5000,
        standardRate: 880000,
        accrueAt: 'Start',
      });

      resources = await ProjectResource.insertMany(defaultResources);
    }

    res.json({ success: true, count: resources.length, resources });
  } catch (err) {
    console.error('Error fetching project resources:', err);
    res.status(500).json({ msg: 'Failed to fetch resources', error: err.message });
  }
});

// ==========================================
// 16. POST /resources - Create project resource
// ==========================================
router.post('/resources', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      name,
      type = 'Work',
      userId,
      materialLabel,
      initials,
      group,
      maxUnits = 100,
      standardRate = 0,
      overtimeRate = 0,
      costPerUse = 0,
      accrueAt = 'Prorated',
      baseCalendar = 'Standard',
      code,
      notes,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ msg: 'Resource name is required' });
    }

    const resource = await ProjectResource.create({
      projectId,
      name: name.trim(),
      type,
      userId: userId || null,
      materialLabel: materialLabel || '',
      initials: initials || name.slice(0, 3).toUpperCase(),
      group: group || '',
      maxUnits: Number(maxUnits) || 100,
      standardRate: Number(standardRate) || 0,
      overtimeRate: Number(overtimeRate) || 0,
      costPerUse: Number(costPerUse) || 0,
      accrueAt,
      baseCalendar,
      code: code || '',
      notes: notes || '',
    });

    res.status(201).json({ success: true, resource });
  } catch (err) {
    console.error('Error creating project resource:', err);
    res.status(500).json({ msg: 'Failed to create resource', error: err.message });
  }
});

// ==========================================
// 17. PUT /resources/:resourceId - Update resource
// ==========================================
router.put('/resources/:resourceId', auth, async (req, res) => {
  try {
    const { projectId, resourceId } = req.params;
    const resource = await ProjectResource.findOne({ _id: resourceId, projectId });
    if (!resource) {
      return res.status(404).json({ msg: 'Resource not found' });
    }

    const allowed = [
      'name',
      'type',
      'userId',
      'materialLabel',
      'initials',
      'group',
      'maxUnits',
      'standardRate',
      'overtimeRate',
      'costPerUse',
      'accrueAt',
      'baseCalendar',
      'code',
      'notes',
    ];

    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        resource[k] = req.body[k];
      }
    });

    await resource.save();
    res.json({ success: true, resource });
  } catch (err) {
    console.error('Error updating project resource:', err);
    res.status(500).json({ msg: 'Failed to update resource', error: err.message });
  }
});

// ==========================================
// 18. DELETE /resources/:resourceId - Delete resource
// ==========================================
router.delete('/resources/:resourceId', auth, async (req, res) => {
  try {
    const { projectId, resourceId } = req.params;
    await ProjectResource.deleteOne({ _id: resourceId, projectId });
    res.json({ success: true, msg: 'Resource deleted successfully' });
  } catch (err) {
    console.error('Error deleting project resource:', err);
    res.status(500).json({ msg: 'Failed to delete resource', error: err.message });
  }
});

// ==========================================
// 19. POST /level-resources - Run Resource Leveling
// ==========================================
router.post('/level-resources', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    const calendar = await getOrCreateProjectCalendar(projectId);
    const resources = await ProjectResource.find({ projectId }).lean();
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 });

    if (tasks.length === 0) {
      return res.status(400).json({ msg: 'No tasks found to level' });
    }

    const plainTasks = tasks.map(t => (t.toObject ? t.toObject() : t));
    levelProjectResources(plainTasks, resources, project ? project.startDate : null, calendar);
    await bulkSaveTasks(plainTasks);

    const updatedTasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    res.json({
      success: true,
      msg: 'Resource leveling completed successfully. Task delays adjusted.',
      tasks: updatedTasks,
    });
  } catch (err) {
    console.error('Error leveling resources:', err);
    res.status(500).json({ msg: 'Failed to level resources', error: err.message });
  }
});

// Helper for escaping XML
function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// ==========================================
// 20. GET /earned-value - Project-level EVM metrics
// ==========================================
router.get('/earned-value', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { statusDate } = req.query;

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();

    if (tasks.length > 0) {
      try {
        recalculateProjectSchedule(tasks, project.startDate, calendar);
      } catch (e) {
        console.warn('Warning during schedule recalc for EV:', e.message);
      }
    }

    const earnedValue = calculateProjectEV(
      tasks,
      statusDate || new Date(),
      project.startDate,
      project.endDate,
      calendar
    );

    res.json({ success: true, earnedValue });
  } catch (err) {
    console.error('Error calculating project earned value:', err);
    res.status(500).json({ msg: 'Failed to calculate earned value', error: err.message });
  }
});

// ==========================================
// 21. GET /s-curve - S-Curve (Kurva S) Time-phased Data
// ==========================================
router.get('/s-curve', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { mode = 'cost', statusDate } = req.query;

    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();

    if (tasks.length > 0) {
      try {
        recalculateProjectSchedule(tasks, project.startDate, calendar);
      } catch (e) {
        console.warn('Warning during schedule recalc for S-curve:', e.message);
      }
    }

    const scurve = generateSCurveData(
      tasks,
      project.startDate,
      project.endDate,
      calendar,
      mode === 'progress' ? 'progress' : 'cost',
      statusDate
    );

    res.json({ success: true, scurve });
  } catch (err) {
    console.error('Error generating S-curve data:', err);
    res.status(500).json({ msg: 'Failed to generate S-curve data', error: err.message });
  }
});

// ==========================================
// 22. GET /export-excel - Export Tasks & Plan to formatted Excel (.xlsx)
// ==========================================
router.get('/export-excel', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const tasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name email role')
      .lean();
    const resources = await ProjectResource.find({ projectId }).lean();

    if (tasks.length > 0) {
      try {
        recalculateProjectSchedule(tasks, project.startDate, calendar);
      } catch (e) {
        console.warn('Schedule recalc warning during export:', e.message);
      }
    }

    const evMetrics = calculateProjectEV(tasks, new Date(), project.startDate, project.endDate, calendar);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MTERP Construction ERP';
    wb.created = new Date();

    const idToRowIndex = new Map();
    tasks.forEach((t, idx) => {
      idToRowIndex.set(t._id.toString(), idx + 1);
    });

    // Sheet 1: Tasks
    const wsTasks = wb.addWorksheet('Task Schedule', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }]
    });

    wsTasks.columns = [
      { header: '#', key: 'rowNum', width: 6 },
      { header: 'WBS', key: 'wbsCode', width: 12 },
      { header: 'Task Name', key: 'name', width: 36 },
      { header: 'Duration (d)', key: 'duration', width: 12 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'Finish Date', key: 'finishDate', width: 14 },
      { header: '% Complete', key: 'percentComplete', width: 12 },
      { header: 'Predecessors', key: 'predecessors', width: 18 },
      { header: 'Resources', key: 'resources', width: 24 },
      { header: 'Planned Cost (Rp)', key: 'plannedCost', width: 18 },
      { header: 'Actual Cost (Rp)', key: 'actualCost', width: 18 },
      { header: 'Baseline Start', key: 'baselineStart', width: 14 },
      { header: 'Baseline Finish', key: 'baselineFinish', width: 14 },
      { header: 'Baseline Cost (Rp)', key: 'baselineCost', width: 18 },
      { header: 'Total Float (d)', key: 'totalFloat', width: 12 },
      { header: 'Critical?', key: 'isCritical', width: 10 },
      { header: 'Constraint', key: 'constraint', width: 14 },
      { header: 'Deadline', key: 'deadline', width: 14 },
    ];

    const headerRow = wsTasks.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Dark Navy
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 26;

    tasks.forEach((t, idx) => {
      const predStr = (t.predecessors || []).map(p => {
        const predRow = idToRowIndex.get((p.taskId || '').toString()) || '?';
        const type = p.type || 'FS';
        const lag = p.lagDays ? `${p.lagDays > 0 ? '+' : ''}${p.lagDays}d` : '';
        return `${predRow}${type}${lag}`;
      }).join(', ');

      const resStr = (t.assignedResources || []).map(r => {
        const name = r.userId?.name || 'Resource';
        return `${name} [${r.units || 100}%]`;
      }).join(', ');

      const sDateStr = t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : '';
      const fDateStr = t.finishDate ? new Date(t.finishDate).toISOString().split('T')[0] : '';
      const bsDateStr = t.baselineStart ? new Date(t.baselineStart).toISOString().split('T')[0] : '';
      const bfDateStr = t.baselineFinish ? new Date(t.baselineFinish).toISOString().split('T')[0] : '';
      const deadDateStr = t.deadlineDate ? new Date(t.deadlineDate).toISOString().split('T')[0] : '';

      const row = wsTasks.addRow({
        rowNum: idx + 1,
        wbsCode: t.wbsCode || '',
        name: `${'  '.repeat(Math.max(0, (t.outlineLevel || 1) - 1))}${t.name}`,
        duration: t.isMilestone ? 0 : (t.duration || 0),
        startDate: sDateStr,
        finishDate: fDateStr,
        percentComplete: `${t.percentComplete || 0}%`,
        predecessors: predStr,
        resources: resStr,
        plannedCost: t.plannedCost || 0,
        actualCost: t.actualCost || 0,
        baselineStart: bsDateStr,
        baselineFinish: bfDateStr,
        baselineCost: t.baselineCost != null ? t.baselineCost : '',
        totalFloat: t.totalFloat != null ? t.totalFloat : 0,
        isCritical: t.isCritical ? 'YES' : 'NO',
        constraint: t.constraintType && t.constraintType !== 'ASAP' ? `${t.constraintType}` : 'ASAP',
        deadline: deadDateStr,
      });

      if (t.isSummary) {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' } // Light gray
        };
      } else if (t.isCritical) {
        const critCell = row.getCell('isCritical');
        critCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      if (t.isMilestone) {
        row.font = { italic: true };
      }
    });

    // Sheet 2: Resources
    const wsRes = wb.addWorksheet('Resources');
    wsRes.columns = [
      { header: 'Resource Name', key: 'name', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Max Units (%)', key: 'maxUnits', width: 14 },
      { header: 'Standard Rate (Rp/day)', key: 'standardRate', width: 22 },
      { header: 'Overtime Rate (Rp/day)', key: 'overtimeRate', width: 22 },
      { header: 'Cost Per Use (Rp)', key: 'costPerUse', width: 18 },
    ];
    const resHeaderRow = wsRes.getRow(1);
    resHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    resHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    resHeaderRow.height = 26;

    resources.forEach(r => {
      wsRes.addRow({
        name: r.name,
        type: r.type || 'Work',
        maxUnits: `${r.maxUnits || 100}%`,
        standardRate: r.standardRate || 0,
        overtimeRate: r.overtimeRate || 0,
        costPerUse: r.costPerUse || 0,
      });
    });

    // Sheet 3: EVM & Summary
    const wsSummary = wb.addWorksheet('EVM & Summary');
    wsSummary.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 24 },
      { header: 'Description / Formula', key: 'desc', width: 45 },
    ];
    const sumHeader = wsSummary.getRow(1);
    sumHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sumHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    sumHeader.height = 26;

    const summaryItems = [
      { metric: 'Project Name', value: project.name, desc: 'Project Title' },
      { metric: 'Evaluation Date', value: evMetrics.statusDate, desc: 'Status date of evaluation' },
      { metric: 'BAC (Budget At Completion)', value: `Rp ${evMetrics.bac.toLocaleString('id-ID')}`, desc: 'Total Planned Baseline Cost' },
      { metric: 'BCWS (Planned Value - PV)', value: `Rp ${evMetrics.bcws.toLocaleString('id-ID')}`, desc: 'Budgeted Cost of Work Scheduled' },
      { metric: 'BCWP (Earned Value - EV)', value: `Rp ${evMetrics.bcwp.toLocaleString('id-ID')}`, desc: 'Budgeted Cost of Work Performed' },
      { metric: 'ACWP (Actual Cost - AC)', value: `Rp ${evMetrics.acwp.toLocaleString('id-ID')}`, desc: 'Actual Cost of Work Performed' },
      { metric: 'SV (Schedule Variance)', value: `Rp ${evMetrics.sv.toLocaleString('id-ID')}`, desc: 'EV - PV (Positive = Ahead of Schedule)' },
      { metric: 'CV (Cost Variance)', value: `Rp ${evMetrics.cv.toLocaleString('id-ID')}`, desc: 'EV - AC (Positive = Under Budget)' },
      { metric: 'SPI (Schedule Performance Index)', value: evMetrics.spi, desc: 'EV / PV (>= 1.0 is favorable)' },
      { metric: 'CPI (Cost Performance Index)', value: evMetrics.cpi, desc: 'EV / AC (>= 1.0 is favorable)' },
      { metric: 'EAC (Estimate At Completion)', value: `Rp ${evMetrics.eac.toLocaleString('id-ID')}`, desc: 'BAC / CPI' },
      { metric: 'ETC (Estimate To Complete)', value: `Rp ${evMetrics.etc.toLocaleString('id-ID')}`, desc: 'EAC - AC' },
      { metric: 'VAC (Variance At Completion)', value: `Rp ${evMetrics.vac.toLocaleString('id-ID')}`, desc: 'BAC - EAC' },
      { metric: 'TCPI', value: evMetrics.tcpi, desc: '(BAC - EV) / (BAC - AC)' },
      { metric: 'Overall Physical Progress', value: `${evMetrics.overallProgress}%`, desc: 'Bobot Fisik Kumulatif' },
    ];

    summaryItems.forEach(item => {
      const r = wsSummary.addRow(item);
      r.height = 20;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = (project.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_ProjectPlan_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Error exporting project plan to Excel:', err);
    res.status(500).json({ msg: 'Failed to export to Excel', error: err.message });
  }
});

// ==========================================
// 23. GET /export-xml - Export to MS Project XML format
// ==========================================
router.get('/export-xml', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    const resources = await ProjectResource.find({ projectId }).lean();

    if (tasks.length > 0) {
      try {
        recalculateProjectSchedule(tasks, project.startDate, calendar);
      } catch (e) {
        console.warn('Schedule recalc warning during XML export:', e.message);
      }
    }

    const idToRowIndex = new Map();
    tasks.forEach((t, idx) => {
      idToRowIndex.set(t._id.toString(), idx + 1);
    });

    const isoStart = project.startDate ? new Date(project.startDate).toISOString() : new Date().toISOString();
    const isoFinish = project.endDate ? new Date(project.endDate).toISOString() : new Date().toISOString();

    const taskXmlNodes = tasks.map((t, idx) => {
      const uid = idx + 1;
      const sDate = t.startDate ? new Date(t.startDate).toISOString().replace('.000Z', '') : '';
      const fDate = t.finishDate ? new Date(t.finishDate).toISOString().replace('.000Z', '') : '';
      const durationHours = (t.duration || 0) * (calendar.hoursPerDay || 8);

      const predecessorXml = (t.predecessors || []).map(p => {
        const predUID = idToRowIndex.get((p.taskId || '').toString());
        if (!predUID) return '';
        const typeMap = { 'FF': 0, 'FS': 1, 'SS': 2, 'SF': 3 };
        const pType = typeMap[p.type] !== undefined ? typeMap[p.type] : 1;
        const lagTenths = (p.lagDays || 0) * (calendar.hoursPerDay || 8) * 60 * 10;
        return `
        <PredecessorLink>
          <PredecessorUID>${predUID}</PredecessorUID>
          <Type>${pType}</Type>
          <LinkLag>${lagTenths}</LinkLag>
          <LagFormat>7</LagFormat>
        </PredecessorLink>`;
      }).join('');

      return `
    <Task>
      <UID>${uid}</UID>
      <ID>${uid}</ID>
      <Name>${escapeXml(t.name)}</Name>
      <Active>1</Active>
      <Manual>0</Manual>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <OutlineNumber>${escapeXml(t.wbsCode || uid.toString())}</OutlineNumber>
      <OutlineLevel>${t.outlineLevel || 1}</OutlineLevel>
      <Priority>${t.priority || 500}</Priority>
      ${sDate ? `<Start>${sDate}</Start>` : ''}
      ${fDate ? `<Finish>${fDate}</Finish>` : ''}
      <Duration>PT${durationHours}H0M0S</Duration>
      <PercentComplete>${t.percentComplete || 0}</PercentComplete>
      <Summary>${t.isSummary ? 1 : 0}</Summary>
      <Milestone>${t.isMilestone ? 1 : 0}</Milestone>
      <Critical>${t.isCritical ? 1 : 0}</Critical>
      <RemainingDuration>PT${Math.round(durationHours * (1 - (t.percentComplete || 0) / 100))}H0M0S</RemainingDuration>
      ${t.plannedCost ? `<Cost>${t.plannedCost}</Cost>` : ''}
      ${t.actualCost ? `<ActualCost>${t.actualCost}</ActualCost>` : ''}
      ${predecessorXml}
    </Task>`;
    }).join('\n');

    const resourceXmlNodes = resources.map((r, idx) => {
      const uid = idx + 1;
      return `
    <Resource>
      <UID>${uid}</UID>
      <ID>${uid}</ID>
      <Name>${escapeXml(r.name)}</Name>
      <Type>${r.type === 'Material' ? 0 : (r.type === 'Cost' ? 2 : 1)}</Type>
      <MaxUnits>${(r.maxUnits || 100) / 100}</MaxUnits>
      <StandardRate>${r.standardRate || 0}</StandardRate>
      <OvertimeRate>${r.overtimeRate || 0}</OvertimeRate>
      <CostPerUse>${r.costPerUse || 0}</CostPerUse>
    </Resource>`;
    }).join('\n');

    const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${escapeXml(project.name || 'Project Plan')}</Name>
  <StartDate>${isoStart}</StartDate>
  <FinishDate>${isoFinish}</FinishDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>${(calendar.hoursPerDay || 8) * 60}</MinutesPerDay>
  <MinutesPerWeek>${(calendar.hoursPerDay || 8) * 60 * (calendar.workingDays?.length || 6)}</MinutesPerWeek>
  <DaysPerMonth>25</DaysPerMonth>
  <DefaultTaskType>0</DefaultTaskType>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
    </Calendar>
  </Calendars>
  <Tasks>
${taskXmlNodes}
  </Tasks>
  <Resources>
${resourceXmlNodes}
  </Resources>
</Project>`;

    const safeName = (project.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_ProjectPlan_${new Date().toISOString().split('T')[0]}.xml`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xmlContent);
  } catch (err) {
    console.error('Error exporting project plan to XML:', err);
    res.status(500).json({ msg: 'Failed to export to XML', error: err.message });
  }
});

// ==========================================
// 24. POST /import-excel - Import Tasks from Excel (.xlsx/.xls)
// ==========================================
router.post('/import-excel', auth, planUpload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { mode = 'preview', replace = 'false' } = req.query;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ msg: 'Please upload an Excel (.xlsx or .xls) file' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    // Find the task sheet
    const ws = wb.worksheets.find(s => /task|jadwal|pekerjaan|schedule|plan/i.test(s.name)) || wb.worksheets[0];
    if (!ws) {
      return res.status(400).json({ msg: 'No worksheets found in the Excel workbook' });
    }

    // Determine header mapping from row 1
    const headers = [];
    const firstRow = ws.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      headers.push({
        colNumber,
        text: String(cell.value || '').trim().toLowerCase(),
      });
    });

    const findCol = (patterns) => {
      const match = headers.find(h => patterns.some(p => h.text.includes(p)));
      return match ? match.colNumber : null;
    };

    const colMap = {
      rowNum: findCol(['#', 'no', 'row']),
      wbsCode: findCol(['wbs']),
      name: findCol(['task name', 'nama', 'pekerjaan', 'item', 'name', 'uraian']),
      duration: findCol(['duration', 'durasi', 'hari', 'days']),
      startDate: findCol(['start', 'mulai', 'tgl mulai']),
      finishDate: findCol(['finish', 'selesai', 'tgl selesai']),
      percentComplete: findCol(['% complete', 'percent', '%', 'progress', 'kemajuan']),
      predecessors: findCol(['predecessor', 'pendahulu']),
      plannedCost: findCol(['planned cost', 'anggaran', 'budget', 'biaya']),
      actualCost: findCol(['actual cost', 'realisasi', 'aktual']),
      isSummary: findCol(['summary']),
      isMilestone: findCol(['milestone']),
    };

    if (!colMap.name) {
      return res.status(400).json({
        msg: 'Could not find "Task Name" column in Excel header. Please ensure row 1 contains headers like "Task Name", "Start Date", "Duration", etc.',
      });
    }

    // Parse data rows
    const parsedTasks = [];
    const warnings = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rawName = row.getCell(colMap.name).value;
      if (!rawName) return; // Skip empty rows

      const nameStr = String(typeof rawName === 'object' && rawName.text ? rawName.text : rawName).trim();
      if (!nameStr) return;

      // Leading spaces indicate outline level
      const leadingSpaces = (String(rawName).match(/^(\s+)/) || [''])[0].length;
      const inferredLevel = Math.max(1, Math.floor(leadingSpaces / 2) + 1);

      // Duration
      let durationVal = 1;
      if (colMap.duration) {
        const dVal = row.getCell(colMap.duration).value;
        if (dVal != null && !isNaN(Number(dVal))) {
          durationVal = Math.max(0, Number(dVal));
        }
      }

      // Dates
      let sDate = null;
      let fDate = null;
      if (colMap.startDate) {
        const val = row.getCell(colMap.startDate).value;
        if (val instanceof Date) sDate = val;
        else if (val) sDate = normalizeDate(val);
      }
      if (colMap.finishDate) {
        const val = row.getCell(colMap.finishDate).value;
        if (val instanceof Date) fDate = val;
        else if (val) fDate = normalizeDate(val);
      }

      // Percent
      let pct = 0;
      if (colMap.percentComplete) {
        const pVal = row.getCell(colMap.percentComplete).value;
        if (typeof pVal === 'number') {
          pct = pVal <= 1 ? Math.round(pVal * 100) : Math.round(pVal);
        } else if (pVal) {
          pct = parseInt(String(pVal).replace('%', '').trim(), 10) || 0;
        }
      }

      // Costs
      let pCost = 0;
      let aCost = 0;
      if (colMap.plannedCost) {
        const val = row.getCell(colMap.plannedCost).value;
        if (!isNaN(Number(val))) pCost = Math.max(0, Number(val));
      }
      if (colMap.actualCost) {
        const val = row.getCell(colMap.actualCost).value;
        if (!isNaN(Number(val))) aCost = Math.max(0, Number(val));
      }

      // WBS
      let wbs = '';
      if (colMap.wbsCode) {
        wbs = String(row.getCell(colMap.wbsCode).value || '').trim();
      }

      // Predecessors string
      let predRaw = '';
      if (colMap.predecessors) {
        predRaw = String(row.getCell(colMap.predecessors).value || '').trim();
      }

      parsedTasks.push({
        excelRow: rowNumber,
        wbsCode: wbs,
        name: nameStr,
        duration: durationVal,
        startDate: sDate,
        finishDate: fDate,
        percentComplete: Math.min(100, Math.max(0, pct)),
        plannedCost: pCost,
        actualCost: aCost,
        outlineLevel: inferredLevel,
        isMilestone: durationVal === 0,
        predecessorRaw: predRaw,
      });
    });

    if (parsedTasks.length === 0) {
      return res.status(400).json({ msg: 'No task rows found in the sheet.' });
    }

    if (mode === 'preview') {
      return res.json({
        success: true,
        preview: true,
        sheetName: ws.name,
        totalTasks: parsedTasks.length,
        columnMapping: {
          name: ws.getRow(1).getCell(colMap.name).value,
          duration: colMap.duration ? ws.getRow(1).getCell(colMap.duration).value : null,
          startDate: colMap.startDate ? ws.getRow(1).getCell(colMap.startDate).value : null,
          finishDate: colMap.finishDate ? ws.getRow(1).getCell(colMap.finishDate).value : null,
          percentComplete: colMap.percentComplete ? ws.getRow(1).getCell(colMap.percentComplete).value : null,
          predecessors: colMap.predecessors ? ws.getRow(1).getCell(colMap.predecessors).value : null,
        },
        sampleTasks: parsedTasks.slice(0, 15),
        warnings,
      });
    }

    // Commit mode:
    if (replace === 'true') {
      await ProjectTask.deleteMany({ projectId });
    }

    // Generate tasks in order
    const rowToNewIdMap = new Map();
    const createdDocs = [];

    for (let i = 0; i < parsedTasks.length; i++) {
      const pt = parsedTasks[i];
      const newId = new (require('mongoose').Types.ObjectId)();
      rowToNewIdMap.set(pt.excelRow - 1, newId); // 1-based index (row 2 -> task index 1)
      rowToNewIdMap.set(i + 1, newId);

      const taskDoc = {
        _id: newId,
        projectId,
        name: pt.name,
        duration: pt.duration,
        startDate: pt.startDate || project.startDate || new Date(),
        finishDate: pt.finishDate || null,
        percentComplete: pt.percentComplete,
        plannedCost: pt.plannedCost,
        actualCost: pt.actualCost,
        outlineLevel: pt.outlineLevel,
        isMilestone: pt.duration === 0,
        sortOrder: i,
        predecessors: [],
        createdBy: req.user.id,
      };
      createdDocs.push(taskDoc);
    }

    // Resolve predecessor references (e.g. "1", "2FS+2d", "1, 2")
    parsedTasks.forEach((pt, idx) => {
      if (!pt.predecessorRaw) return;
      const parts = pt.predecessorRaw.split(/[,;]/);
      const predecessors = [];

      parts.forEach(part => {
        const match = part.trim().match(/^(\d+)(FS|FF|SS|SF)?([+-]?\d+)?d?$/i);
        if (match) {
          const targetIndex = parseInt(match[1], 10);
          const targetId = rowToNewIdMap.get(targetIndex);
          if (targetId && targetId.toString() !== createdDocs[idx]._id.toString()) {
            predecessors.push({
              taskId: targetId,
              type: (match[2] || 'FS').toUpperCase(),
              lagDays: match[3] ? parseInt(match[3], 10) : 0,
            });
          }
        }
      });
      createdDocs[idx].predecessors = predecessors;
    });

    // Run schedule engine to compute hierarchy and dates
    recalculateWBSCodes(createdDocs);
    recalculateProjectSchedule(createdDocs, project.startDate, calendar);

    // Save tasks to database
    await ProjectTask.insertMany(createdDocs);

    const savedTasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    res.json({
      success: true,
      msg: `Successfully imported ${savedTasks.length} tasks from Excel`,
      count: savedTasks.length,
      tasks: savedTasks,
    });
  } catch (err) {
    console.error('Error importing tasks from Excel:', err);
    res.status(500).json({ msg: 'Failed to import Excel file', error: err.message });
  }
});

// ==========================================
// 25. POST /import-xml - Import Tasks from MS Project XML
// ==========================================
router.post('/import-xml', auth, planUpload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { mode = 'preview', replace = 'false' } = req.query;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ msg: 'Please upload an MS Project XML file' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const calendar = await getOrCreateProjectCalendar(projectId);
    const xmlText = req.file.buffer.toString('utf8');

    // Extract tasks with regex
    const taskRegex = /<Task>([\s\S]*?)<\/Task>/gi;
    const taskBlocks = [];
    let match;
    while ((match = taskRegex.exec(xmlText)) !== null) {
      taskBlocks.push(match[1]);
    }

    if (taskBlocks.length === 0) {
      return res.status(400).json({ msg: 'No <Task> elements found in XML.' });
    }

    const getTag = (block, tag) => {
      const m = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i').exec(block);
      return m ? m[1].trim() : '';
    };

    const parsedTasks = [];
    taskBlocks.forEach((block, idx) => {
      const name = getTag(block, 'Name');
      if (!name) return; // Skip project root or empty task

      const uid = parseInt(getTag(block, 'UID') || (idx + 1).toString(), 10);
      const outlineLevel = parseInt(getTag(block, 'OutlineLevel') || '1', 10);
      const wbsCode = getTag(block, 'OutlineNumber') || '';
      const percentComplete = parseInt(getTag(block, 'PercentComplete') || '0', 10);
      const isSummary = getTag(block, 'Summary') === '1';
      const isMilestone = getTag(block, 'Milestone') === '1';

      // Parse Duration (e.g. PT40H0M0S)
      let durationDays = 1;
      const durRaw = getTag(block, 'Duration');
      const durMatch = durRaw.match(/PT(\d+(\.\d+)?)H/i);
      if (durMatch) {
        const hours = parseFloat(durMatch[1]);
        durationDays = Math.round(hours / (calendar.hoursPerDay || 8));
      }
      if (isMilestone) durationDays = 0;

      const sRaw = getTag(block, 'Start');
      const fRaw = getTag(block, 'Finish');
      const startDate = sRaw ? new Date(sRaw) : null;
      const finishDate = fRaw ? new Date(fRaw) : null;

      const costRaw = getTag(block, 'Cost');
      const plannedCost = costRaw ? parseFloat(costRaw) : 0;
      const actCostRaw = getTag(block, 'ActualCost');
      const actualCost = actCostRaw ? parseFloat(actCostRaw) : 0;

      // Extract PredecessorLink elements
      const predRegex = /<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/gi;
      const predecessors = [];
      let pMatch;
      while ((pMatch = predRegex.exec(block)) !== null) {
        const pBlock = pMatch[1];
        const predUID = parseInt(getTag(pBlock, 'PredecessorUID'), 10);
        const pTypeVal = parseInt(getTag(pBlock, 'Type') || '1', 10);
        const typeMap = { 0: 'FF', 1: 'FS', 2: 'SS', 3: 'SF' };
        const lagRaw = parseInt(getTag(pBlock, 'LinkLag') || '0', 10);
        const lagDays = Math.round(lagRaw / ((calendar.hoursPerDay || 8) * 60 * 10));

        if (!isNaN(predUID)) {
          predecessors.push({
            predUID,
            type: typeMap[pTypeVal] || 'FS',
            lagDays,
          });
        }
      }

      parsedTasks.push({
        uid,
        name,
        outlineLevel,
        wbsCode,
        duration: durationDays,
        startDate,
        finishDate,
        percentComplete,
        isSummary,
        isMilestone,
        plannedCost,
        actualCost,
        rawPredecessors: predecessors,
      });
    });

    if (parsedTasks.length === 0) {
      return res.status(400).json({ msg: 'No valid tasks parsed from MS Project XML.' });
    }

    if (mode === 'preview') {
      return res.json({
        success: true,
        preview: true,
        totalTasks: parsedTasks.length,
        sampleTasks: parsedTasks.slice(0, 15),
      });
    }

    // Commit mode:
    if (replace === 'true') {
      await ProjectTask.deleteMany({ projectId });
    }

    const uidToNewId = new Map();
    const createdDocs = [];

    parsedTasks.forEach((pt, idx) => {
      const newId = new (require('mongoose').Types.ObjectId)();
      uidToNewId.set(pt.uid, newId);

      createdDocs.push({
        _id: newId,
        projectId,
        name: pt.name,
        duration: pt.duration,
        startDate: pt.startDate || project.startDate || new Date(),
        finishDate: pt.finishDate || null,
        percentComplete: pt.percentComplete,
        plannedCost: pt.plannedCost,
        actualCost: pt.actualCost,
        outlineLevel: pt.outlineLevel,
        isSummary: pt.isSummary,
        isMilestone: pt.isMilestone,
        sortOrder: idx,
        predecessors: [],
        createdBy: req.user.id,
      });
    });

    // Link predecessors
    parsedTasks.forEach((pt, idx) => {
      const preds = [];
      pt.rawPredecessors.forEach(rp => {
        const targetId = uidToNewId.get(rp.predUID);
        if (targetId && targetId.toString() !== createdDocs[idx]._id.toString()) {
          preds.push({
            taskId: targetId,
            type: rp.type,
            lagDays: rp.lagDays,
          });
        }
      });
      createdDocs[idx].predecessors = preds;
    });

    recalculateWBSCodes(createdDocs);
    recalculateProjectSchedule(createdDocs, project.startDate, calendar);

    await ProjectTask.insertMany(createdDocs);

    const savedTasks = await ProjectTask.find({ projectId })
      .sort({ sortOrder: 1 })
      .populate('assignedResources.userId', 'name role')
      .lean();

    res.json({
      success: true,
      msg: `Successfully imported ${savedTasks.length} tasks from MS Project XML`,
      count: savedTasks.length,
      tasks: savedTasks,
    });
  } catch (err) {
    console.error('Error importing tasks from XML:', err);
    res.status(500).json({ msg: 'Failed to import XML file', error: err.message });
  }
});

module.exports = router;
