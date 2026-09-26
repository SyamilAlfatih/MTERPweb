const mongoose = require('mongoose');
const { Project, ProjectTask, Supply, ProjectCalendar, RABItem } = require('../models');
const {
  recalculateProjectSchedule,
  recalculateWBSCodes,
  rollUpSummaryTasks,
} = require('./scheduling');

/**
 * Ensures legacy projects with flat workItems and supplies have a unified WBS ProjectTask hierarchy.
 */
async function ensureProjectTasksFromLegacy(projectId) {
  try {
    const existingCount = await ProjectTask.countDocuments({ projectId });
    if (existingCount > 0) {
      return; // Already initialized
    }

    const project = await Project.findById(projectId).lean();
    if (!project) return;

    const legacyWorkItems = project.workItems || [];
    const legacySupplies = await Supply.find({ projectId }).lean();

    if (legacyWorkItems.length === 0 && legacySupplies.length === 0) {
      return;
    }

    console.log(`[ProjectSync] Migrating legacy work items & supplies to unified WBS for project ${projectId}...`);

    let sortOrder = 0;
    const tasksToInsert = [];
    const defaultStart = project.startDate || new Date();
    const defaultEnd = project.endDate || new Date(Date.now() + 30 * 86400000);

    // 1. Create Summary Task for Work Items (Pekerjaan Lapangan)
    if (legacyWorkItems.length > 0) {
      const workSummaryId = new mongoose.Types.ObjectId();
      tasksToInsert.push({
        _id: workSummaryId,
        projectId,
        wbsCode: '1',
        outlineLevel: 1,
        parentTaskId: null,
        sortOrder: sortOrder++,
        isSummary: true,
        isMilestone: false,
        name: 'Pekerjaan Konstruksi / Lapangan',
        itemType: 'summary',
        category: 'labor',
        duration: 1,
        startDate: defaultStart,
        finishDate: defaultEnd,
        percentComplete: 0,
        plannedCost: 0,
        actualCost: 0,
      });

      legacyWorkItems.forEach((wi, i) => {
        const qty = Number(wi.qty) || 1;
        const totalCost = Number(wi.cost) || 0;
        const unitRate = qty > 0 ? totalCost / qty : totalCost;

        tasksToInsert.push({
          _id: new mongoose.Types.ObjectId(),
          projectId,
          wbsCode: `1.${i + 1}`,
          outlineLevel: 2,
          parentTaskId: workSummaryId,
          sortOrder: sortOrder++,
          isSummary: false,
          isMilestone: false,
          name: wi.name || `Pekerjaan ${i + 1}`,
          itemType: 'work',
          category: 'labor',
          duration: Math.max(1, Math.round((new Date(wi.endDate || defaultEnd) - new Date(wi.startDate || defaultStart)) / 86400000) || 1),
          startDate: wi.startDate || defaultStart,
          finishDate: wi.endDate || defaultEnd,
          quantity: qty,
          unit: wi.unit || wi.volume || 'm2',
          unitRate: Math.round(unitRate),
          totalBudget: totalCost,
          plannedCost: totalCost,
          actualCost: Number(wi.actualCost) || 0,
          percentComplete: Number(wi.progress) || 0,
          physicalWeight: Number(wi.physicalWeight) || 0,
          legacyWorkItemId: wi._id ? wi._id.toString() : null,
        });
      });
    }

    // 2. Create Summary Task for Supply Items (Pengadaan Material)
    if (legacySupplies.length > 0) {
      const supplySummaryId = new mongoose.Types.ObjectId();
      const summaryWbs = tasksToInsert.length > 0 ? '2' : '1';

      tasksToInsert.push({
        _id: supplySummaryId,
        projectId,
        wbsCode: summaryWbs,
        outlineLevel: 1,
        parentTaskId: null,
        sortOrder: sortOrder++,
        isSummary: true,
        isMilestone: false,
        name: 'Pengadaan & Material Proyek',
        itemType: 'summary',
        category: 'material',
        duration: 1,
        startDate: defaultStart,
        finishDate: defaultEnd,
        percentComplete: 0,
        plannedCost: 0,
        actualCost: 0,
      });

      legacySupplies.forEach((sup, i) => {
        const qty = Number(sup.qty) || 1;
        const totalCost = Number(sup.cost) || 0;
        const unitRate = qty > 0 ? totalCost / qty : totalCost;

        tasksToInsert.push({
          _id: new mongoose.Types.ObjectId(),
          projectId,
          wbsCode: `${summaryWbs}.${i + 1}`,
          outlineLevel: 2,
          parentTaskId: supplySummaryId,
          sortOrder: sortOrder++,
          isSummary: false,
          isMilestone: false,
          name: sup.item || `Material ${i + 1}`,
          itemType: 'supply',
          category: 'material',
          duration: Math.max(1, Math.round((new Date(sup.endDate || defaultEnd) - new Date(sup.startDate || defaultStart)) / 86400000) || 1),
          startDate: sup.startDate || defaultStart,
          finishDate: sup.endDate || defaultEnd,
          deliveryDate: sup.deliveryDate || null,
          quantity: qty,
          unit: sup.unit || 'pcs',
          unitRate: Math.round(unitRate),
          totalBudget: totalCost,
          plannedCost: totalCost,
          actualCost: Number(sup.actualCost) || 0,
          realizedQuantity: Number(sup.totalQtyUsed) || 0,
          supplyStatus: sup.status || 'Pending',
          percentComplete: sup.status === 'Delivered' ? 100 : sup.status === 'Ordered' ? 50 : 0,
          legacySupplyId: sup._id ? sup._id.toString() : null,
        });
      });
    }

    if (tasksToInsert.length > 0) {
      // 1. Ensure Calendar
      let calendar = await ProjectCalendar.findOne({ projectId, isDefault: true });
      if (!calendar) {
        calendar = await ProjectCalendar.create({
          projectId,
          name: 'Standard Construction Indonesia (Mon-Sat)',
          isDefault: true,
          workingDays: [1, 2, 3, 4, 5, 6],
          hoursPerDay: 8,
          workingHours: [{ start: '08:00', end: '17:00' }],
          exceptions: [],
        });
      }

      await ProjectTask.insertMany(tasksToInsert);
      console.log(`[ProjectSync] Successfully migrated ${tasksToInsert.length} unified tasks for project ${projectId}.`);

      // 2. Recalculate schedule and persist CPM fields
      try {
        const calObj = calendar.toObject ? calendar.toObject() : calendar;
        recalculateProjectSchedule(tasksToInsert, project.startDate, calObj);
        for (const t of tasksToInsert) {
          await ProjectTask.findByIdAndUpdate(t._id, {
            wbsCode: t.wbsCode,
            startDate: t.startDate,
            finishDate: t.finishDate,
            duration: t.duration,
            earlyStart: t.earlyStart,
            earlyFinish: t.earlyFinish,
            lateStart: t.lateStart,
            lateFinish: t.lateFinish,
            totalFloat: t.totalFloat,
            freeFloat: t.freeFloat,
            isCritical: t.isCritical,
            baselineStart: t.startDate,
            baselineFinish: t.finishDate,
            baselineDuration: t.duration,
            baselineCost: t.plannedCost,
          });
        }
      } catch (schedErr) {
        console.warn(`[ProjectSync] CPM schedule warning for project ${projectId}:`, schedErr.message);
      }

      // 3. Populate matching RABItem records if none exist
      try {
        const existingRab = await RABItem.countDocuments({ projectId });
        if (existingRab === 0) {
          const rabDocs = tasksToInsert.map(t => ({
            _id: t._id,
            projectId,
            wbsCode: t.wbsCode,
            description: t.name,
            category: t.itemType === 'supply' ? 'Material' : (t.category === 'labor' ? 'Upah' : 'Subkon'),
            unitOfMeasure: ['M3', 'CUM'].includes((t.unit || '').toUpperCase()) ? 'CUM' : (['M2', 'SQM'].includes((t.unit || '').toUpperCase()) ? 'SQM' : (['TON', 'MT'].includes((t.unit || '').toUpperCase()) ? 'MT' : (['SAK', 'ZAK'].includes((t.unit || '').toUpperCase()) ? 'ZAK' : 'PCS'))),
            budgetedQuantity: t.quantity || 1,
            unitRate: t.unitRate || 0,
            totalBudget: t.plannedCost || 0,
            committedQuantity: 0,
            realizedQuantity: t.realizedQuantity || 0,
            realizedAmount: t.actualCost || 0,
          }));
          await RABItem.insertMany(rabDocs);
        }
      } catch (rabErr) {
        console.warn(`[ProjectSync] RAB sync warning for project ${projectId}:`, rabErr.message);
      }

      // 4. Synchronize Project.workItems and Supply collection
      await syncProjectTasksToProjectEntities(projectId);
    }
  } catch (err) {
    console.error(`[ProjectSync] Error in ensureProjectTasksFromLegacy for project ${projectId}:`, err);
  }
}

/**
 * Synchronizes ProjectTasks to Project.workItems and Supply collection for bidirectional compatibility.
 */
async function syncProjectTasksToProjectEntities(projectId) {
  try {
    const tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    if (!tasks || tasks.length === 0) return;

    const project = await Project.findById(projectId);
    if (!project) return;

    // Filter work tasks and map to workItems schema
    const workTasks = tasks.filter(t => t.itemType === 'work');
    const updatedWorkItems = workTasks.map(t => ({
      _id: t.legacyWorkItemId && mongoose.Types.ObjectId.isValid(t.legacyWorkItemId)
        ? new mongoose.Types.ObjectId(t.legacyWorkItemId)
        : t._id,
      name: t.name,
      qty: t.quantity || 1,
      volume: t.unit || 'M2',
      unit: t.unit || 'M2',
      cost: t.plannedCost || (t.quantity || 1) * (t.unitRate || 0),
      actualCost: t.actualCost || 0,
      progress: t.percentComplete || 0,
      physicalWeight: t.physicalWeight || 0,
      startDate: t.startDate,
      endDate: t.finishDate,
    }));

    project.workItems = updatedWorkItems;

    // Calculate rolled-up budget and progress
    const rootTasks = tasks.filter(t => t.outlineLevel === 1);
    let totalBudget = 0;
    if (rootTasks.length > 0) {
      totalBudget = rootTasks.reduce((sum, t) => sum + (t.plannedCost || 0), 0);
    } else {
      totalBudget = tasks.reduce((sum, t) => sum + (t.plannedCost || 0), 0);
    }

    if (totalBudget > 0) {
      project.totalBudget = totalBudget;
    }

    // Overall progress: weighted by duration or plannedCost
    const leafTasks = tasks.filter(t => !t.isSummary);
    if (leafTasks.length > 0) {
      const totalWeight = leafTasks.reduce((s, t) => s + (t.plannedCost || t.duration || 1), 0);
      const weightedProgress = leafTasks.reduce(
        (s, t) => s + (t.percentComplete || 0) * (t.plannedCost || t.duration || 1),
        0
      );
      project.progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
    }

    await project.save();

    // Synchronize supply tasks to Supply collection
    const supplyTasks = tasks.filter(t => t.itemType === 'supply');
    for (const st of supplyTasks) {
      const supplyFilter = st.legacySupplyId && mongoose.Types.ObjectId.isValid(st.legacySupplyId)
        ? { _id: st.legacySupplyId }
        : { projectId, item: st.name };

      const cost = st.plannedCost || (st.quantity || 1) * (st.unitRate || 0);

      await Supply.findOneAndUpdate(
        supplyFilter,
        {
          $set: {
            projectId,
            item: st.name,
            qty: st.quantity || 1,
            unit: st.unit || 'pcs',
            cost,
            actualCost: st.actualCost || 0,
            totalQtyUsed: st.realizedQuantity || 0,
            status: st.supplyStatus || (st.percentComplete === 100 ? 'Delivered' : st.percentComplete > 0 ? 'Ordered' : 'Pending'),
            startDate: st.startDate,
            endDate: st.finishDate,
            deliveryDate: st.deliveryDate,
          },
        },
        { upsert: true, new: true }
      );
    }

    // Clean up any supplies in Supply collection that were deleted from WBS tasks
    const activeSupplyIds = supplyTasks.map(st => st.legacySupplyId).filter(Boolean);
    const activeNames = supplyTasks.map(st => st.name);
    await Supply.deleteMany({
      projectId,
      _id: { $nin: activeSupplyIds },
      item: { $nin: activeNames },
    });

    console.log(`[ProjectSync] Successfully synchronized unified WBS to Project & Supplies for project ${projectId}.`);
  } catch (err) {
    console.error(`[ProjectSync] Error in syncProjectTasksToProjectEntities for project ${projectId}:`, err);
  }
}

module.exports = {
  ensureProjectTasksFromLegacy,
  syncProjectTasksToProjectEntities,
};
