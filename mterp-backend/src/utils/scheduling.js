/**
 * MS Project-like Scheduling Engine for MTERP (Phase 2 Enhanced)
 * Handles:
 * 1. Calendar Contexts with working days and holiday/site exceptions
 * 2. Topological dependency resolution & cycle detection (FS, FF, SS, SF with lag)
 * 3. All 8 MS Project Constraint types (ASAP, ALAP, SNET, SNLT, FNET, FNLT, MSO, MFO)
 * 4. Deadline date verification and indicator flags
 * 5. Forward pass, backward pass, Total Float, and Free Float calculation
 * 6. Resource leveling delay offsets
 * 7. Effort-driven scheduling (FixedUnits, FixedDuration, FixedWork)
 * 8. Summary task hierarchy rollups and WBS code generation
 */

const { parseWIBDate } = require('./date');

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Mon - Sat (Indonesian construction standard)

/**
 * Normalizes a date to midnight UTC (00:00:00.000)
 */
function normalizeDate(d) {
  if (!d) return null;
  const date = typeof d === 'string' ? parseWIBDate(d) || new Date(d) : new Date(d);
  if (isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Creates a Calendar Context that evaluates working days and holiday/site exceptions
 */
function createCalendarContext(calendarConfig = {}) {
  const workingDays = Array.isArray(calendarConfig.workingDays) && calendarConfig.workingDays.length > 0
    ? calendarConfig.workingDays
    : DEFAULT_WORKING_DAYS;

  const hoursPerDay = calendarConfig.hoursPerDay || 8;
  const rawExceptions = Array.isArray(calendarConfig.exceptions) ? calendarConfig.exceptions : [];

  const exceptions = rawExceptions.map(ex => ({
    name: ex.name || 'Exception',
    start: normalizeDate(ex.startDate),
    finish: normalizeDate(ex.finishDate || ex.startDate),
    isWorkingDay: Boolean(ex.isWorkingDay),
  })).filter(ex => ex.start && ex.finish);

  function isWorkingDay(d) {
    if (!d) return false;
    const norm = normalizeDate(d);
    const time = norm.getTime();

    // Check exceptions first
    for (const ex of exceptions) {
      if (time >= ex.start.getTime() && time <= ex.finish.getTime()) {
        return ex.isWorkingDay;
      }
    }

    // Default to working days of week (0 = Sun, 1 = Mon, ..., 6 = Sat)
    return workingDays.includes(norm.getUTCDay());
  }

  function snapToWorkingDay(d) {
    let curr = normalizeDate(d);
    if (!curr) return null;
    let safety = 365;
    while (!isWorkingDay(curr) && safety > 0) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      safety--;
    }
    return curr;
  }

  function snapBackwardToWorkingDay(d) {
    let curr = normalizeDate(d);
    if (!curr) return null;
    let safety = 365;
    while (!isWorkingDay(curr) && safety > 0) {
      curr.setUTCDate(curr.getUTCDate() - 1);
      safety--;
    }
    return curr;
  }

  function calculateFinishDate(startDate, durationDays) {
    if (!startDate) return null;
    let curr = snapToWorkingDay(startDate);
    const duration = Math.max(0, durationDays || 0);
    if (duration <= 0) return curr; // Milestone finishes on same day

    let remaining = duration - 1;
    let safety = 10000;
    while (remaining > 0 && safety > 0) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      if (isWorkingDay(curr)) {
        remaining--;
      }
      safety--;
    }
    return curr;
  }

  function calculateStartDate(finishDate, durationDays) {
    if (!finishDate) return null;
    let curr = snapBackwardToWorkingDay(finishDate);
    const duration = Math.max(0, durationDays || 0);
    if (duration <= 0) return curr;

    let remaining = duration - 1;
    let safety = 10000;
    while (remaining > 0 && safety > 0) {
      curr.setUTCDate(curr.getUTCDate() - 1);
      if (isWorkingDay(curr)) {
        remaining--;
      }
      safety--;
    }
    return curr;
  }

  function countWorkingDays(startDate, finishDate) {
    if (!startDate || !finishDate) return 0;
    let start = normalizeDate(startDate);
    let finish = normalizeDate(finishDate);
    if (start > finish) return 0;

    let count = 0;
    let curr = new Date(start);
    while (curr <= finish) {
      if (isWorkingDay(curr)) {
        count++;
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return count;
  }

  function getNextWorkingDay(d) {
    let curr = normalizeDate(d);
    curr.setUTCDate(curr.getUTCDate() + 1);
    return snapToWorkingDay(curr);
  }

  function getPreviousWorkingDay(d) {
    let curr = normalizeDate(d);
    curr.setUTCDate(curr.getUTCDate() - 1);
    return snapBackwardToWorkingDay(curr);
  }

  function offsetWorkingDays(d, lagDays) {
    if (!d || lagDays === 0) return d ? normalizeDate(d) : null;
    let curr = normalizeDate(d);
    let step = lagDays > 0 ? 1 : -1;
    let remaining = Math.abs(lagDays);
    let safety = 10000;

    while (remaining > 0 && safety > 0) {
      curr.setUTCDate(curr.getUTCDate() + step);
      if (isWorkingDay(curr)) {
        remaining--;
      }
      safety--;
    }
    return curr;
  }

  return {
    workingDays,
    hoursPerDay,
    exceptions,
    isWorkingDay,
    snapToWorkingDay,
    snapBackwardToWorkingDay,
    calculateFinishDate,
    calculateStartDate,
    countWorkingDays,
    getNextWorkingDay,
    getPreviousWorkingDay,
    offsetWorkingDays,
  };
}

// Default static context for backward compatibility
const defaultCalendarContext = createCalendarContext({ workingDays: DEFAULT_WORKING_DAYS });

/**
 * Standard Indonesian National Holidays generator for seed & default calendar setup
 */
function getStandardIndonesianHolidays(year = 2026) {
  return [
    { name: 'Tahun Baru Masehi', startDate: new Date(`${year}-01-01`), finishDate: new Date(`${year}-01-01`), isWorkingDay: false },
    { name: 'Hari Buruh Internasional', startDate: new Date(`${year}-05-01`), finishDate: new Date(`${year}-05-01`), isWorkingDay: false },
    { name: 'Hari Lahir Pancasila', startDate: new Date(`${year}-06-01`), finishDate: new Date(`${year}-06-01`), isWorkingDay: false },
    { name: 'Hari Kemerdekaan RI', startDate: new Date(`${year}-08-17`), finishDate: new Date(`${year}-08-17`), isWorkingDay: false },
    { name: 'Hari Raya Natal', startDate: new Date(`${year}-12-25`), finishDate: new Date(`${year}-12-25`), isWorkingDay: false },
  ];
}

/**
 * Re-generates WBS codes for tasks sorted by sortOrder.
 */
function recalculateWBSCodes(tasks) {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const counters = [];
  const parentStack = [];

  for (const task of sorted) {
    const level = Math.max(1, task.outlineLevel || 1);
    const levelIdx = level - 1;

    counters[levelIdx] = (counters[levelIdx] || 0) + 1;
    counters.length = level;

    parentStack[levelIdx] = task._id || task.id;
    parentStack.length = level;

    task.wbsCode = counters.slice(0, level).join('.');
    task.parentTaskId = levelIdx > 0 ? parentStack[levelIdx - 1] : null;
  }

  // Update isSummary flag: any task that is a parent of another task is a summary task
  const parentIdSet = new Set(
    sorted.map(t => (t.parentTaskId ? (t.parentTaskId._id || t.parentTaskId).toString() : null)).filter(Boolean)
  );

  for (const task of sorted) {
    const taskIdStr = (task._id || task.id).toString();
    task.isSummary = parentIdSet.has(taskIdStr);
    if (task.isSummary) {
      task.isMilestone = false;
    }
  }

  return tasks;
}

/**
 * Cycle detection in predecessor graph
 */
function detectCycle(tasks) {
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set((t._id || t.id).toString(), t));

  const visited = new Set();
  const recStack = new Set();

  function dfs(taskIdStr) {
    visited.add(taskIdStr);
    recStack.add(taskIdStr);

    const task = taskMap.get(taskIdStr);
    if (task && Array.isArray(task.predecessors)) {
      for (const pred of task.predecessors) {
        const predId = (pred.taskId ? (pred.taskId._id || pred.taskId).toString() : null);
        if (!predId || !taskMap.has(predId)) continue;

        if (!visited.has(predId)) {
          if (dfs(predId)) return true;
        } else if (recStack.has(predId)) {
          return true; // Cycle detected
        }
      }
    }

    recStack.delete(taskIdStr);
    return false;
  }

  for (const task of tasks) {
    const taskIdStr = (task._id || task.id).toString();
    if (!visited.has(taskIdStr)) {
      if (dfs(taskIdStr)) return true;
    }
  }

  return false;
}

/**
 * Topologically sorts tasks based on predecessor dependencies
 */
function topologicalSort(tasks) {
  const taskMap = new Map();
  const inDegree = new Map();
  const adj = new Map();

  tasks.forEach(t => {
    const id = (t._id || t.id).toString();
    taskMap.set(id, t);
    inDegree.set(id, 0);
    adj.set(id, []);
  });

  tasks.forEach(t => {
    const succId = (t._id || t.id).toString();
    if (Array.isArray(t.predecessors)) {
      t.predecessors.forEach(p => {
        const predId = (p.taskId ? (p.taskId._id || p.taskId).toString() : null);
        if (predId && adj.has(predId)) {
          adj.get(predId).push({ succId, type: p.type || 'FS', lagDays: p.lagDays || 0 });
          inDegree.set(succId, (inDegree.get(succId) || 0) + 1);
        }
      });
    }
  });

  const queue = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted = [];
  while (queue.length > 0) {
    const u = queue.shift();
    sorted.push(taskMap.get(u));

    const neighbors = adj.get(u) || [];
    for (const edge of neighbors) {
      inDegree.set(edge.succId, inDegree.get(edge.succId) - 1);
      if (inDegree.get(edge.succId) === 0) {
        queue.push(edge.succId);
      }
    }
  }

  if (sorted.length < tasks.length) {
    const included = new Set(sorted.map(t => (t._id || t.id).toString()));
    for (const t of tasks) {
      const id = (t._id || t.id).toString();
      if (!included.has(id)) sorted.push(t);
    }
  }

  return sorted;
}

/**
 * Forward Pass: Calculates Early Start (ES) and Early Finish (EF)
 * Handles:
 * - Predecessor dependencies (FS, FF, SS, SF) and lag
 * - Resource Leveling Delays
 * - MS Project Constraints: ASAP, MSO, SNET, FNET, MFO
 */
function forwardPass(tasks, projectStartDate, calCtx = defaultCalendarContext) {
  const baseStart = projectStartDate
    ? calCtx.snapToWorkingDay(normalizeDate(projectStartDate))
    : calCtx.snapToWorkingDay(new Date());

  const taskMap = new Map();
  tasks.forEach(t => {
    const id = (t._id || t.id).toString();
    taskMap.set(id, t);
  });

  const topoTasks = topologicalSort(tasks.filter(t => !t.isSummary));

  for (const task of topoTasks) {
    const duration = task.isMilestone ? 0 : Math.max(0, task.duration || 1);
    let earlyStart = null;

    if (task.predecessors && task.predecessors.length > 0) {
      for (const pred of task.predecessors) {
        const predId = (pred.taskId ? (pred.taskId._id || pred.taskId).toString() : null);
        const predTask = taskMap.get(predId);
        if (!predTask || !predTask.startDate || !predTask.finishDate) continue;

        const pStart = normalizeDate(predTask.startDate);
        const pFinish = normalizeDate(predTask.finishDate);
        const lag = pred.lagDays || 0;
        let candidateStart = null;

        switch (pred.type) {
          case 'SS': // Start-to-Start
            candidateStart = calCtx.offsetWorkingDays(pStart, lag);
            break;
          case 'FF': // Finish-to-Finish
            {
              const candFinish = calCtx.offsetWorkingDays(pFinish, lag);
              candidateStart = calCtx.calculateStartDate(candFinish, duration);
            }
            break;
          case 'SF': // Start-to-Finish
            {
              const candFinish = calCtx.offsetWorkingDays(pStart, -1 + lag);
              candidateStart = calCtx.calculateStartDate(candFinish, duration);
            }
            break;
          case 'FS': // Finish-to-Start
          default:
            {
              const nextWorkDay = calCtx.getNextWorkingDay(pFinish);
              candidateStart = calCtx.offsetWorkingDays(nextWorkDay, lag);
            }
            break;
        }

        if (candidateStart) {
          candidateStart = calCtx.snapToWorkingDay(candidateStart);
          if (!earlyStart || candidateStart > earlyStart) {
            earlyStart = candidateStart;
          }
        }
      }
    }

    if (!earlyStart) {
      if (task.startDate) {
        earlyStart = calCtx.snapToWorkingDay(normalizeDate(task.startDate));
      } else {
        earlyStart = baseStart;
      }
    }

    // Apply Resource Leveling Delay if specified
    if (task.levelingDelay && task.levelingDelay > 0) {
      earlyStart = calCtx.offsetWorkingDays(earlyStart, task.levelingDelay);
    }

    // MS Project Constraints Forward Pass Evaluation
    if (task.constraintType && task.constraintDate) {
      const cDate = calCtx.snapToWorkingDay(normalizeDate(task.constraintDate));
      if (cDate) {
        switch (task.constraintType) {
          case 'MSO': // Must Start On
            earlyStart = cDate;
            break;
          case 'SNET': // Start No Earlier Than
            if (earlyStart < cDate) {
              earlyStart = cDate;
            }
            break;
          case 'MFO': // Must Finish On
            earlyStart = calCtx.calculateStartDate(cDate, duration);
            break;
          case 'FNET': // Finish No Earlier Than
            {
              const tentativeFinish = calCtx.calculateFinishDate(earlyStart, duration);
              if (tentativeFinish < cDate) {
                earlyStart = calCtx.calculateStartDate(cDate, duration);
              }
            }
            break;
          default:
            break;
        }
      }
    }

    task.startDate = earlyStart;
    task.finishDate = calCtx.calculateFinishDate(earlyStart, duration);
    task.earlyStart = task.startDate;
    task.earlyFinish = task.finishDate;

    // Check soft deadline constraint
    if (task.deadlineDate && task.finishDate) {
      task.isDeadlineMissed = normalizeDate(task.finishDate) > normalizeDate(task.deadlineDate);
    } else {
      task.isDeadlineMissed = false;
    }
  }

  return tasks;
}

/**
 * Backward Pass: Calculates Late Start (LS), Late Finish (LF), Total Float & Free Float
 * Handles:
 * - MS Project Constraints: ALAP, SNLT, FNLT, MSO, MFO
 * - Float and critical path determination
 */
function backwardPass(tasks, projectFinishDate = null, calCtx = defaultCalendarContext) {
  const taskMap = new Map();
  tasks.forEach(t => {
    const id = (t._id || t.id).toString();
    taskMap.set(id, t);
  });

  let maxFinish = projectFinishDate ? normalizeDate(projectFinishDate) : null;
  if (!maxFinish) {
    for (const t of tasks) {
      if (t.finishDate) {
        const f = normalizeDate(t.finishDate);
        if (!maxFinish || f > maxFinish) {
          maxFinish = f;
        }
      }
    }
  }

  const succMap = new Map();
  tasks.forEach(t => succMap.set((t._id || t.id).toString(), []));

  tasks.forEach(t => {
    const succId = (t._id || t.id).toString();
    if (t.predecessors) {
      t.predecessors.forEach(p => {
        const predId = (p.taskId ? (p.taskId._id || p.taskId).toString() : null);
        if (predId && succMap.has(predId)) {
          succMap.get(predId).push({
            succId,
            type: p.type || 'FS',
            lagDays: p.lagDays || 0,
          });
        }
      });
    }
  });

  const nonSummary = tasks.filter(t => !t.isSummary);
  const revTopo = topologicalSort(nonSummary).reverse();

  for (const task of revTopo) {
    const taskIdStr = (task._id || task.id).toString();
    const duration = task.isMilestone ? 0 : Math.max(0, task.duration || 1);
    const successors = succMap.get(taskIdStr) || [];

    let lateFinish = null;

    if (successors.length > 0) {
      for (const succ of successors) {
        const sTask = taskMap.get(succ.succId);
        if (!sTask || !sTask.lateStart || !sTask.lateFinish) continue;

        const sLS = normalizeDate(sTask.lateStart);
        const sLF = normalizeDate(sTask.lateFinish);
        const lag = succ.lagDays || 0;
        let candFinish = null;

        switch (succ.type) {
          case 'SS':
            {
              const candStart = calCtx.offsetWorkingDays(sLS, -lag);
              candFinish = calCtx.calculateFinishDate(candStart, duration);
            }
            break;
          case 'FF':
            candFinish = calCtx.offsetWorkingDays(sLF, -lag);
            break;
          case 'SF':
            {
              const candStart = calCtx.offsetWorkingDays(sLF, 1 - lag);
              candFinish = calCtx.calculateFinishDate(candStart, duration);
            }
            break;
          case 'FS':
          default:
            {
              const prevWorkDay = calCtx.getPreviousWorkingDay(sLS);
              candFinish = calCtx.offsetWorkingDays(prevWorkDay, -lag);
            }
            break;
        }

        if (candFinish) {
          candFinish = calCtx.snapBackwardToWorkingDay(candFinish);
          if (!lateFinish || candFinish < lateFinish) {
            lateFinish = candFinish;
          }
        }
      }
    }

    if (!lateFinish) {
      lateFinish = task.deadlineDate
        ? calCtx.snapBackwardToWorkingDay(normalizeDate(task.deadlineDate))
        : (task.finishDate || maxFinish);
    }

    // MS Project Constraints Backward Pass Evaluation
    if (task.constraintType && task.constraintDate) {
      const cDate = calCtx.snapBackwardToWorkingDay(normalizeDate(task.constraintDate));
      if (cDate) {
        switch (task.constraintType) {
          case 'MSO': // Must Start On
            {
              const msoLateStart = calCtx.snapToWorkingDay(cDate);
              lateFinish = calCtx.calculateFinishDate(msoLateStart, duration);
            }
            break;
          case 'MFO': // Must Finish On
            lateFinish = cDate;
            break;
          case 'FNLT': // Finish No Later Than
            if (lateFinish > cDate) {
              lateFinish = cDate;
            }
            break;
          case 'SNLT': // Start No Later Than
            {
              const candFinish = calCtx.calculateFinishDate(cDate, duration);
              if (lateFinish > candFinish) {
                lateFinish = candFinish;
              }
            }
            break;
          case 'ALAP': // As Late As Possible
            // In MS Project, ALAP schedules the task directly at its late dates
            task.startDate = calCtx.calculateStartDate(lateFinish, duration);
            task.finishDate = lateFinish;
            break;
          default:
            break;
        }
      }
    }

    task.lateFinish = lateFinish;
    task.lateStart = calCtx.calculateStartDate(lateFinish, duration);

    // Total Float = Late Finish - Early Finish (in working days)
    if (task.earlyFinish && task.lateFinish) {
      const ef = normalizeDate(task.earlyFinish);
      const lf = normalizeDate(task.lateFinish);
      if (lf >= ef) {
        task.totalFloat = Math.max(0, calCtx.countWorkingDays(ef, lf) - 1);
      } else {
        task.totalFloat = -(calCtx.countWorkingDays(lf, ef) - 1);
      }
    } else {
      task.totalFloat = 0;
    }

    // Free Float Calculation: slack without delaying any successor's early start
    let minFreeSlack = task.totalFloat;
    if (successors.length > 0) {
      for (const succ of successors) {
        const sTask = taskMap.get(succ.succId);
        if (!sTask || !sTask.earlyStart) continue;

        const sES = normalizeDate(sTask.earlyStart);
        const tEF = normalizeDate(task.earlyFinish);
        const tES = normalizeDate(task.earlyStart);
        const lag = succ.lagDays || 0;
        let slack = 0;

        if (succ.type === 'FS') {
          // Free slack = working days between this EF and succ ES minus lag minus 1
          const daysBetween = calCtx.countWorkingDays(tEF, sES);
          slack = Math.max(0, daysBetween - 2 - lag);
        } else if (succ.type === 'SS') {
          const daysBetween = calCtx.countWorkingDays(tES, sES);
          slack = Math.max(0, daysBetween - 1 - lag);
        }

        minFreeSlack = Math.min(minFreeSlack, slack);
      }
    }
    task.freeFloat = Math.max(0, minFreeSlack);
    task.isCritical = task.totalFloat <= 0;
  }

  return tasks;
}

/**
 * Rolls up summary task dates, durations, progress, and costs from their descendants
 */
function rollUpSummaryTasks(tasks, calCtx = defaultCalendarContext) {
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set((t._id || t.id).toString(), t));

  const maxLevel = tasks.reduce((max, t) => Math.max(max, t.outlineLevel || 1), 1);

  for (let lvl = maxLevel; lvl >= 1; lvl--) {
    const summaryTasksAtLevel = tasks.filter(t => t.isSummary && (t.outlineLevel || 1) === lvl);

    for (const summary of summaryTasksAtLevel) {
      const summaryIdStr = (summary._id || summary.id).toString();
      const children = tasks.filter(t => {
        const pId = t.parentTaskId ? (t.parentTaskId._id || t.parentTaskId).toString() : null;
        return pId === summaryIdStr;
      });

      if (children.length === 0) continue;

      let minStart = null;
      let maxFinish = null;
      let totalPlannedCost = 0;
      let totalActualCost = 0;
      let totalPlannedWork = 0;
      let totalActualWork = 0;
      let weightedProgressNumerator = 0;
      let totalWeight = 0;
      let hasCriticalChild = false;

      for (const child of children) {
        if (child.startDate) {
          const cStart = normalizeDate(child.startDate);
          if (!minStart || cStart < minStart) minStart = cStart;
        }
        if (child.finishDate) {
          const cFinish = normalizeDate(child.finishDate);
          if (!maxFinish || cFinish > maxFinish) maxFinish = cFinish;
        }

        totalPlannedCost += child.plannedCost || 0;
        totalActualCost += child.actualCost || 0;
        totalPlannedWork += child.plannedWork || 0;
        totalActualWork += child.actualWork || 0;

        const weight = child.duration || 1;
        weightedProgressNumerator += (child.percentComplete || 0) * weight;
        totalWeight += weight;

        if (child.isCritical) hasCriticalChild = true;
      }

      summary.startDate = minStart;
      summary.finishDate = maxFinish;
      summary.duration = calCtx.countWorkingDays(minStart, maxFinish);
      summary.percentComplete = totalWeight > 0 ? Math.round(weightedProgressNumerator / totalWeight) : 0;
      summary.plannedCost = totalPlannedCost;
      summary.actualCost = totalActualCost;
      summary.plannedWork = totalPlannedWork;
      summary.actualWork = totalActualWork;
      summary.isCritical = hasCriticalChild;
      summary.totalFloat = children.reduce(
        (min, c) => Math.min(min, c.totalFloat !== undefined ? c.totalFloat : 999),
        999
      );
      if (summary.totalFloat === 999) summary.totalFloat = 0;
      summary.freeFloat = children.reduce(
        (min, c) => Math.min(min, c.freeFloat !== undefined ? c.freeFloat : 999),
        999
      );
      if (summary.freeFloat === 999) summary.freeFloat = 0;
    }
  }

  return tasks;
}

/**
 * Effort-driven & Task Type calculation (MS Project Golden Triangle: Work = Duration * Units)
 */
function recalculateTaskWork(task, hoursPerDay = 8) {
  const duration = task.isMilestone ? 0 : Math.max(0, task.duration || 0);
  const totalUnits = (Array.isArray(task.assignedResources) && task.assignedResources.length > 0)
    ? task.assignedResources.reduce((sum, r) => sum + (r.units || 100), 0)
    : 100;
  const factor = totalUnits / 100;

  if (task.taskType === 'FixedWork') {
    if (factor > 0) {
      task.duration = Math.max(1, Math.round((task.plannedWork || hoursPerDay) / (hoursPerDay * factor)));
    }
  } else {
    // FixedUnits (default) or FixedDuration
    task.plannedWork = Math.round(duration * hoursPerDay * factor * 10) / 10;
  }

  task.remainingWork = Math.max(0, Math.round(task.plannedWork * (1 - (task.percentComplete || 0) / 100) * 10) / 10);
  return task;
}

/**
 * Master Schedule Recalculation Engine
 * 1. Resolves Calendar Context
 * 2. Re-generates WBS codes and isSummary flags
 * 3. Runs forward pass to compute early start/finish with constraints
 * 4. Rolls up summary tasks
 * 5. Runs backward pass to compute late start/finish, total float, and free float
 * 6. Computes effort-driven work
 * 7. Final rollup of summary tasks
 */
function recalculateProjectSchedule(tasks, projectStartDate = null, calendarConfigOrWorkingDays = null) {
  if (!tasks || tasks.length === 0) return [];

  if (detectCycle(tasks)) {
    throw new Error('Circular dependency detected in project tasks.');
  }

  let calCtx;
  if (calendarConfigOrWorkingDays && typeof calendarConfigOrWorkingDays === 'object' && !Array.isArray(calendarConfigOrWorkingDays)) {
    calCtx = createCalendarContext(calendarConfigOrWorkingDays);
  } else if (Array.isArray(calendarConfigOrWorkingDays)) {
    calCtx = createCalendarContext({ workingDays: calendarConfigOrWorkingDays });
  } else {
    calCtx = defaultCalendarContext;
  }

  // 1. Structure: recalculate WBS codes and summary flags
  recalculateWBSCodes(tasks);

  // 2. Forward pass: compute start and finish dates for leaf tasks
  forwardPass(tasks, projectStartDate, calCtx);

  // 3. Roll up summary tasks
  rollUpSummaryTasks(tasks, calCtx);

  // 4. Backward pass: compute float and critical path
  backwardPass(tasks, null, calCtx);

  // 5. Compute effort-driven work for leaf tasks
  for (const t of tasks) {
    if (!t.isSummary) {
      recalculateTaskWork(t, calCtx.hoursPerDay);
    }
  }

  // 6. Final rollup of summary tasks
  rollUpSummaryTasks(tasks, calCtx);

  return tasks;
}

/**
 * Detects resource overallocations across tasks for working days.
 * An overallocation occurs when the sum of resource units on any day exceeds maxUnits (default 100%).
 */
function detectResourceOverallocations(tasks, resources = [], calCtx = defaultCalendarContext) {
  const resourceLimits = new Map();
  resources.forEach(r => {
    const id = (r._id || r.userId?._id || r.userId || r.name).toString();
    resourceLimits.set(id, r.maxUnits || 100);
  });

  const dailyAlloc = new Map();

  tasks.forEach(t => {
    t.isOverallocated = false;
  });

  const leafTasks = tasks.filter(t => !t.isSummary && t.startDate && t.finishDate && Array.isArray(t.assignedResources));

  for (const task of leafTasks) {
    const start = normalizeDate(task.startDate);
    const finish = normalizeDate(task.finishDate);
    if (!start || !finish || start > finish) continue;

    for (const res of task.assignedResources) {
      const resId = (res.userId?._id || res.userId || 'unknown').toString();
      const units = res.units || 100;

      if (!dailyAlloc.has(resId)) {
        dailyAlloc.set(resId, new Map());
      }
      const resMap = dailyAlloc.get(resId);

      let curr = new Date(start);
      while (curr <= finish) {
        if (calCtx.isWorkingDay(curr)) {
          const time = curr.getTime();
          if (!resMap.has(time)) {
            resMap.set(time, { totalUnits: 0, taskIds: [] });
          }
          const dayData = resMap.get(time);
          dayData.totalUnits += units;
          dayData.taskIds.push((task._id || task.id).toString());
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }
  }

  const overallocatedTaskIds = new Set();
  dailyAlloc.forEach((resMap, resId) => {
    const maxLimit = resourceLimits.get(resId) || 100;
    resMap.forEach(dayData => {
      if (dayData.totalUnits > maxLimit) {
        dayData.taskIds.forEach(id => overallocatedTaskIds.add(id));
      }
    });
  });

  tasks.forEach(t => {
    const id = (t._id || t.id).toString();
    if (overallocatedTaskIds.has(id)) {
      t.isOverallocated = true;
    }
  });

  return tasks;
}

/**
 * CPM-based Resource Leveling Engine:
 * Resolves overallocations by delaying non-critical tasks with available Total Float.
 */
function levelProjectResources(tasks, resources = [], projectStartDate = null, calCtx = defaultCalendarContext) {
  recalculateProjectSchedule(tasks, projectStartDate, calCtx);
  detectResourceOverallocations(tasks, resources, calCtx);

  const overallocatedTasks = tasks.filter(t => !t.isSummary && t.isOverallocated);
  if (overallocatedTasks.length <= 1) return tasks;

  overallocatedTasks.sort((a, b) => {
    if ((b.priority || 500) !== (a.priority || 500)) {
      return (b.priority || 500) - (a.priority || 500);
    }
    if (a.isCritical !== b.isCritical) {
      return a.isCritical ? -1 : 1;
    }
    return (b.totalFloat || 0) - (a.totalFloat || 0);
  });

  for (let i = 1; i < overallocatedTasks.length; i++) {
    const taskToDelay = overallocatedTasks[i];
    const prevTask = overallocatedTasks[i - 1];

    if (prevTask.finishDate && taskToDelay.startDate) {
      const pFinish = normalizeDate(prevTask.finishDate);
      const tStart = normalizeDate(taskToDelay.startDate);
      if (tStart <= pFinish) {
        const overlapDays = calCtx.countWorkingDays(tStart, pFinish);
        taskToDelay.levelingDelay = (taskToDelay.levelingDelay || 0) + overlapDays;
      }
    }
  }

  recalculateProjectSchedule(tasks, projectStartDate, calCtx);
  detectResourceOverallocations(tasks, resources, calCtx);

  return tasks;
}

module.exports = {
  DEFAULT_WORKING_DAYS,
  normalizeDate,
  createCalendarContext,
  defaultCalendarContext,
  getStandardIndonesianHolidays,
  isWorkingDay: defaultCalendarContext.isWorkingDay,
  snapToWorkingDay: defaultCalendarContext.snapToWorkingDay,
  snapBackwardToWorkingDay: defaultCalendarContext.snapBackwardToWorkingDay,
  calculateFinishDate: defaultCalendarContext.calculateFinishDate,
  calculateStartDate: defaultCalendarContext.calculateStartDate,
  countWorkingDays: defaultCalendarContext.countWorkingDays,
  getNextWorkingDay: defaultCalendarContext.getNextWorkingDay,
  getPreviousWorkingDay: defaultCalendarContext.getPreviousWorkingDay,
  offsetWorkingDays: defaultCalendarContext.offsetWorkingDays,
  recalculateWBSCodes,
  detectCycle,
  topologicalSort,
  forwardPass,
  backwardPass,
  rollUpSummaryTasks,
  recalculateTaskWork,
  recalculateProjectSchedule,
  detectResourceOverallocations,
  levelProjectResources,
};
