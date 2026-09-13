/**
 * Earned Value Management (EVM) Engine & S-Curve (Kurva S) Generator
 * 
 * Provides:
 * 1. Task-level and Project-level EVM calculations (BCWS/PV, BCWP/EV, ACWP/AC, SPI, CPI, SV, CV, EAC, ETC, VAC, TCPI)
 * 2. Time-phased S-Curve data generation (Cost-based or Progress-weighted % bobot fisik)
 * 3. Spreadsheet EV column helpers
 */

const { normalizeDate, createCalendarContext, defaultCalendarContext } = require('./scheduling');

/**
 * Resolves calendar context whether caller passes a Calendar document/object,
 * an existing CalendarContext, or undefined.
 */
function resolveCalendarContext(calendarOrCtx) {
  if (calendarOrCtx && typeof calendarOrCtx.countWorkingDays === 'function') {
    return calendarOrCtx;
  }
  if (calendarOrCtx && typeof calendarOrCtx === 'object') {
    return createCalendarContext(calendarOrCtx);
  }
  return defaultCalendarContext;
}

/**
 * Calculates Earned Value metrics for a single task at a given status date.
 * 
 * @param {Object} task - ProjectTask document or plain object
 * @param {Date|string} statusDate - Effective evaluation date (defaults to today)
 * @param {Date|string} [projectStartDate]
 * @param {Date|string} [projectFinishDate]
 * @param {Object} [calendarOrCtx] - Calendar context or calendar configuration object
 * @returns {Object} EV metrics for task
 */
function calculateTaskEV(task, statusDate, projectStartDate, projectFinishDate, calendarOrCtx = defaultCalendarContext) {
  const calCtx = resolveCalendarContext(calendarOrCtx);
  const normStatus = normalizeDate(statusDate) || normalizeDate(new Date());

  // BAC (Budget At Completion)
  // Check baseline cost first (Baseline 0), otherwise fall back to plannedCost
  let bac = 0;
  if (task.baselineCost != null && !isNaN(task.baselineCost) && task.baselineCost > 0) {
    bac = Number(task.baselineCost);
  } else if (task.baselines && task.baselines[0] && task.baselines[0].cost > 0) {
    bac = Number(task.baselines[0].cost);
  } else {
    bac = Number(task.plannedCost || 0);
  }

  // Planned start & finish: prefer baseline dates if available
  const planStart = normalizeDate(task.baselineStart || (task.baselines && task.baselines[0]?.startDate) || task.startDate);
  const planFinish = normalizeDate(task.baselineFinish || (task.baselines && task.baselines[0]?.finishDate) || task.finishDate || planStart);

  // 1. BCWS (Budgeted Cost of Work Scheduled / Planned Value - PV)
  let bcws = 0;
  if (bac > 0 && planStart && planFinish) {
    if (normStatus.getTime() < planStart.getTime()) {
      bcws = 0;
    } else if (normStatus.getTime() >= planFinish.getTime()) {
      bcws = bac;
    } else {
      // Pro-rate by calendar working days
      const totalWorkingDays = Math.max(1, calCtx.countWorkingDays(planStart, planFinish));
      const elapsedWorkingDays = Math.max(0, calCtx.countWorkingDays(planStart, normStatus));
      const fraction = Math.min(1, Math.max(0, elapsedWorkingDays / totalWorkingDays));
      bcws = Math.round(bac * fraction);
    }
  }

  // 2. BCWP (Budgeted Cost of Work Performed / Earned Value - EV)
  const percentComplete = Math.min(100, Math.max(0, Number(task.percentComplete || 0)));
  const bcwp = Math.round(bac * (percentComplete / 100));

  // 3. ACWP (Actual Cost of Work Performed / Actual Cost - AC)
  const acwp = Number(task.actualCost || 0);

  // 4. Variances
  const sv = bcwp - bcws;
  const cv = bcwp - acwp;

  // 5. Indices
  const spi = bcws > 0 ? Number((bcwp / bcws).toFixed(2)) : (bcwp === 0 ? 1.0 : 0.0);
  const cpi = acwp > 0 ? Number((bcwp / acwp).toFixed(2)) : (bcwp === 0 ? 1.0 : 1.0);

  // 6. Forecasts (EAC, ETC, VAC, TCPI)
  let eac = bac;
  if (cpi > 0) {
    eac = Math.round(bac / cpi);
  } else if (acwp > 0) {
    eac = acwp + bac;
  }

  const etc = Math.max(0, eac - acwp);
  const vac = bac - eac;

  const tcpiDenom = bac - acwp;
  let tcpi = 1.0;
  if (tcpiDenom > 0) {
    tcpi = Number(((bac - bcwp) / tcpiDenom).toFixed(2));
  } else if (bac - bcwp <= 0) {
    tcpi = 0.0;
  }

  return {
    bac: Math.round(bac),
    bcws: Math.round(bcws),
    bcwp: Math.round(bcwp),
    acwp: Math.round(acwp),
    sv: Math.round(sv),
    cv: Math.round(cv),
    spi,
    cpi,
    eac: Math.round(eac),
    etc: Math.round(etc),
    vac: Math.round(vac),
    tcpi,
    plannedCost: Number(task.plannedCost || 0),
    actualCost: Number(task.actualCost || 0),
    percentComplete,
  };
}

/**
 * Calculates Project-level Earned Value metrics by rolling up non-summary (leaf) tasks.
 * 
 * @param {Array} tasks - Array of ProjectTask documents
 * @param {Date|string} statusDate - Status evaluation date
 * @param {Date|string} [projectStartDate]
 * @param {Date|string} [projectFinishDate]
 * @param {Object} [calCtx]
 * @returns {Object} Project EV summary
 */
function calculateProjectEV(tasks = [], statusDate, projectStartDate, projectFinishDate, calendarOrCtx = defaultCalendarContext) {
  const calCtx = resolveCalendarContext(calendarOrCtx);
  const normStatus = normalizeDate(statusDate) || normalizeDate(new Date());

  // Identify leaf tasks to avoid double-counting parent summaries
  const parentIdSet = new Set();
  tasks.forEach(t => {
    if (t.parentTaskId) {
      parentIdSet.add(t.parentTaskId.toString());
    }
  });

  const leafTasks = tasks.filter(t => {
    const idStr = (t._id || '').toString();
    return !t.isSummary && !parentIdSet.has(idStr);
  });

  const targetTasks = leafTasks.length > 0 ? leafTasks : tasks;

  let totalBAC = 0;
  let totalBCWS = 0;
  let totalBCWP = 0;
  let totalACWP = 0;
  let totalPlannedCost = 0;
  let totalActualCost = 0;
  let totalDuration = 0;
  let weightedProgressSum = 0;

  for (const task of targetTasks) {
    const ev = calculateTaskEV(task, normStatus, projectStartDate, projectFinishDate, calCtx);
    totalBAC += ev.bac;
    totalBCWS += ev.bcws;
    totalBCWP += ev.bcwp;
    totalACWP += ev.acwp;
    totalPlannedCost += Number(task.plannedCost || 0);
    totalActualCost += Number(task.actualCost || 0);

    const dur = Math.max(1, Number(task.duration || 1));
    totalDuration += dur;
    weightedProgressSum += dur * (Number(task.percentComplete || 0) / 100);
  }

  const sv = totalBCWP - totalBCWS;
  const cv = totalBCWP - totalACWP;
  const spi = totalBCWS > 0 ? Number((totalBCWP / totalBCWS).toFixed(2)) : (totalBCWP === 0 ? 1.0 : 0.0);
  const cpi = totalACWP > 0 ? Number((totalBCWP / totalACWP).toFixed(2)) : (totalBCWP === 0 ? 1.0 : 1.0);

  let eac = totalBAC;
  if (cpi > 0) {
    eac = Math.round(totalBAC / cpi);
  } else if (totalACWP > 0) {
    eac = totalACWP + totalBAC;
  }

  const etc = Math.max(0, eac - totalACWP);
  const vac = totalBAC - eac;

  const tcpiDenom = totalBAC - totalACWP;
  let tcpi = 1.0;
  if (tcpiDenom > 0) {
    tcpi = Number(((totalBAC - totalBCWP) / tcpiDenom).toFixed(2));
  } else if (totalBAC - totalBCWP <= 0) {
    tcpi = 0.0;
  }

  // Physical progress % (Bobot Fisik)
  let overallProgress = 0;
  if (totalBAC > 0) {
    overallProgress = Number(((totalBCWP / totalBAC) * 100).toFixed(2));
  } else if (totalDuration > 0) {
    overallProgress = Number(((weightedProgressSum / totalDuration) * 100).toFixed(2));
  }

  return {
    statusDate: normStatus.toISOString().split('T')[0],
    bac: Math.round(totalBAC),
    bcws: Math.round(totalBCWS),
    bcwp: Math.round(totalBCWP),
    acwp: Math.round(totalACWP),
    sv: Math.round(sv),
    cv: Math.round(cv),
    spi,
    cpi,
    eac: Math.round(eac),
    etc: Math.round(etc),
    vac: Math.round(vac),
    tcpi,
    totalPlannedCost: Math.round(totalPlannedCost),
    totalActualCost: Math.round(totalActualCost),
    overallProgress,
  };
}

/**
 * Generates S-Curve (Kurva S) time-phased data points.
 * 
 * In Indonesian construction practice, Kurva S plots cumulative planned progress vs actual progress.
 * Supports:
 * - 'cost' mode: Cumulative Rupiah amounts (BCWS, BCWP, ACWP)
 * - 'progress' mode: Cumulative percentage % bobot fisik (0% - 100%)
 * 
 * @param {Array} tasks - Project tasks
 * @param {Date|string} projectStartDate
 * @param {Date|string} projectFinishDate
 * @param {Object} calendarConfig
 * @param {'cost'|'progress'} [mode='cost']
 * @param {Date|string} [customStatusDate]
 * @returns {Object} { mode, statusDate, dataPoints, projectEV }
 */
function generateSCurveData(tasks = [], projectStartDate, projectFinishDate, calendarConfig = {}, mode = 'cost', customStatusDate = null) {
  const calCtx = resolveCalendarContext(calendarConfig);
  const normStatus = normalizeDate(customStatusDate) || normalizeDate(new Date());

  // Leaf tasks only
  const parentIdSet = new Set();
  tasks.forEach(t => {
    if (t.parentTaskId) parentIdSet.add(t.parentTaskId.toString());
  });
  const leafTasks = tasks.filter(t => !t.isSummary && !parentIdSet.has((t._id || '').toString()));
  const targetTasks = leafTasks.length > 0 ? leafTasks : tasks;

  // Determine project time boundaries
  let earliestDate = normalizeDate(projectStartDate);
  let latestDate = normalizeDate(projectFinishDate);

  for (const t of targetTasks) {
    const s = normalizeDate(t.startDate || t.baselineStart);
    const f = normalizeDate(t.finishDate || t.baselineFinish);
    if (s && (!earliestDate || s < earliestDate)) earliestDate = s;
    if (f && (!latestDate || f > latestDate)) latestDate = f;
  }

  if (!earliestDate) earliestDate = normStatus;
  if (!latestDate || latestDate < earliestDate) {
    latestDate = new Date(earliestDate.getTime() + 30 * 86400000);
  }

  // Generate sample date intervals
  // Daily if span <= 45 days, weekly if > 45 days
  const spanDays = Math.ceil((latestDate - earliestDate) / 86400000);
  const stepDays = spanDays > 60 ? 7 : (spanDays > 30 ? 3 : 1);

  const sampleDates = [];
  let curr = new Date(earliestDate.getTime());
  while (curr <= latestDate) {
    sampleDates.push(new Date(curr.getTime()));
    curr = new Date(curr.getTime() + stepDays * 86400000);
  }

  // Ensure latestDate and normStatus are in the series
  if (!sampleDates.some(d => d.getTime() === latestDate.getTime())) {
    sampleDates.push(latestDate);
  }
  if (normStatus >= earliestDate && normStatus <= latestDate) {
    if (!sampleDates.some(d => d.getTime() === normStatus.getTime())) {
      sampleDates.push(normStatus);
    }
  }
  sampleDates.sort((a, b) => a.getTime() - b.getTime());

  // Precompute project EV at status date
  const projectEV = calculateProjectEV(tasks, normStatus, earliestDate, latestDate, calCtx);
  const totalBAC = projectEV.bac > 0 ? projectEV.bac : (projectEV.totalPlannedCost > 0 ? projectEV.totalPlannedCost : 1);

  // Calculate cumulative curves at each sample date
  const dataPoints = [];

  for (const date of sampleDates) {
    const dateStr = date.toISOString().split('T')[0];
    const isPastOrCurrentStatus = date.getTime() <= normStatus.getTime();

    // Sum BCWS at this sample date across all tasks
    let cumulativeBCWS = 0;
    for (const t of targetTasks) {
      const evAtDate = calculateTaskEV(t, date, earliestDate, latestDate, calCtx);
      cumulativeBCWS += evAtDate.bcws;
    }

    let cumulativeBCWP = null;
    let cumulativeACWP = null;

    if (isPastOrCurrentStatus) {
      // Historical or current progress up to this date
      // If exactly at status date, use exact projectEV
      if (date.getTime() === normStatus.getTime()) {
        cumulativeBCWP = projectEV.bcwp;
        cumulativeACWP = projectEV.acwp;
      } else {
        // Interpolate progress up to sample date
        let earnedSum = 0;
        let actualSum = 0;
        for (const t of targetTasks) {
          const tStart = normalizeDate(t.startDate || t.baselineStart);
          const tFinish = normalizeDate(t.finishDate || t.baselineFinish || tStart);
          const taskEV = calculateTaskEV(t, normStatus, earliestDate, latestDate, calCtx);

          if (!tStart || date < tStart) {
            // Task has not started yet
            continue;
          }

          if (date >= tFinish || date >= normStatus) {
            // Full current progress of task attained
            earnedSum += taskEV.bcwp;
            actualSum += taskEV.acwp;
          } else {
            // Task in progress: interpolate between start and statusDate
            const totalWorkDays = Math.max(1, calCtx.countWorkingDays(tStart, normStatus));
            const elapsedWorkDays = Math.max(0, calCtx.countWorkingDays(tStart, date));
            const progressRatio = Math.min(1, elapsedWorkDays / totalWorkDays);
            earnedSum += Math.round(taskEV.bcwp * progressRatio);
            actualSum += Math.round(taskEV.acwp * progressRatio);
          }
        }
        cumulativeBCWP = earnedSum;
        cumulativeACWP = actualSum;
      }
    }

    if (mode === 'progress') {
      // Convert to percentage % (0 - 100%)
      const plannedPct = Number(((cumulativeBCWS / totalBAC) * 100).toFixed(2));
      const earnedPct = cumulativeBCWP !== null ? Number(((cumulativeBCWP / totalBAC) * 100).toFixed(2)) : null;
      const actualPct = cumulativeACWP !== null ? Number(((cumulativeACWP / totalBAC) * 100).toFixed(2)) : null;

      dataPoints.push({
        date: dateStr,
        plannedCumulative: Math.min(100, Math.max(0, plannedPct)),
        earnedCumulative: earnedPct !== null ? Math.min(100, Math.max(0, earnedPct)) : null,
        actualCumulative: actualPct !== null ? Math.max(0, actualPct) : null,
      });
    } else {
      // Currency mode (Rp)
      dataPoints.push({
        date: dateStr,
        plannedCumulative: Math.round(cumulativeBCWS),
        earnedCumulative: cumulativeBCWP !== null ? Math.round(cumulativeBCWP) : null,
        actualCumulative: cumulativeACWP !== null ? Math.round(cumulativeACWP) : null,
      });
    }
  }

  return {
    mode,
    statusDate: normStatus.toISOString().split('T')[0],
    dataPoints,
    projectEV,
  };
}

/**
 * Returns flat EV column values for spreadsheet table display.
 */
function getEVColumns(task, statusDate, projectStartDate, projectFinishDate, calCtx) {
  const ev = calculateTaskEV(task, statusDate, projectStartDate, projectFinishDate, calCtx);
  return {
    bcws: ev.bcws,
    bcwp: ev.bcwp,
    acwp: ev.acwp,
    sv: ev.sv,
    cv: ev.cv,
    spi: ev.spi,
    cpi: ev.cpi,
    eac: ev.eac,
    etc: ev.etc,
    vac: ev.vac,
    tcpi: ev.tcpi,
  };
}

module.exports = {
  calculateTaskEV,
  calculateProjectEV,
  generateSCurveData,
  getEVColumns,
};
