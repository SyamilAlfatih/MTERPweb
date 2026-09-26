const express = require('express');
const { RABItem, Project, ProjectTask } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const { withTransaction } = require('../utils/transaction');
const { ensureProjectTasksFromLegacy, syncProjectTasksToProjectEntities } = require('../utils/projectSync');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/rab - Get all RAB items for a project
router.get('/', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    await ensureProjectTasksFromLegacy(projectId);

    let tasks = await ProjectTask.find({ projectId }).sort({ sortOrder: 1 }).lean();
    let rabItems = [];

    if (tasks.length > 0) {
      rabItems = tasks.map(t => ({
        _id: t._id,
        projectId: t.projectId,
        wbsCode: t.wbsCode,
        description: t.name,
        category: t.category || (t.itemType === 'supply' ? 'material' : 'labor'),
        unitOfMeasure: (t.unit || 'PCS').toUpperCase(),
        budgetedQuantity: t.quantity || 1,
        unitRate: t.unitRate || 0,
        totalBudget: t.plannedCost || ((t.quantity || 1) * (t.unitRate || 0)),
        committedQuantity: 0,
        realizedQuantity: t.realizedQuantity || 0,
        realizedAmount: t.actualCost || t.realizedAmount || 0,
        isSummary: t.isSummary,
        outlineLevel: t.outlineLevel,
        itemType: t.itemType,
      }));
    } else {
      rabItems = await RABItem.find({ projectId }).sort({ wbsCode: 1 }).lean();
    }

    const leafItems = rabItems.filter(item => !item.isSummary);
    const summaryItems = leafItems.length > 0 ? leafItems : rabItems;

    const summary = summaryItems.reduce(
      (acc, item) => {
        acc.totalBudget += item.totalBudget || 0;
        acc.totalRealized += item.realizedAmount || 0;
        acc.totalCommitted += (item.committedQuantity || 0) * (item.unitRate || 0);
        return acc;
      },
      { totalBudget: 0, totalRealized: 0, totalCommitted: 0 }
    );

    const realizationPercent = summary.totalBudget > 0
      ? Number(((summary.totalRealized / summary.totalBudget) * 100).toFixed(2))
      : 0;

    res.json({
      rabItems,
      summary: {
        ...summary,
        realizationPercent,
        itemCount: rabItems.length,
      },
    });
  } catch (error) {
    console.error('Get RAB error:', error);
    res.status(500).json({ msg: 'Server error fetching RAB data' });
  }
});

// POST /api/projects/:projectId/rab - Create single or bulk RAB items
router.post('/', auth, authorize('owner', 'director', 'project_manager'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const { items, wbsCode, description, unitOfMeasure, budgetedQuantity, unitRate, category } = req.body;

    // Support bulk import (array of items) or single item
    if (Array.isArray(items) && items.length > 0) {
      const docsToInsert = items.map((it) => ({
        projectId,
        wbsCode: it.wbsCode,
        description: it.description,
        category: it.category || 'Material',
        unitOfMeasure: (it.unitOfMeasure || 'PCS').toUpperCase(),
        budgetedQuantity: Number(it.budgetedQuantity) || 0,
        unitRate: Number(it.unitRate) || 0,
        totalBudget: (Number(it.budgetedQuantity) || 0) * (Number(it.unitRate) || 0),
      }));

      const inserted = await RABItem.insertMany(docsToInsert);

      // Also create ProjectTask items
      let currentOrder = await ProjectTask.countDocuments({ projectId });
      const taskDocs = items.map((it) => ({
        projectId,
        wbsCode: it.wbsCode,
        name: it.description,
        itemType: (it.category || '').toLowerCase() === 'material' ? 'supply' : 'work',
        category: (it.category || '').toLowerCase() || 'general',
        unit: (it.unitOfMeasure || 'PCS').toUpperCase(),
        quantity: Number(it.budgetedQuantity) || 1,
        unitRate: Number(it.unitRate) || 0,
        plannedCost: (Number(it.budgetedQuantity) || 1) * (Number(it.unitRate) || 0),
        totalBudget: (Number(it.budgetedQuantity) || 1) * (Number(it.unitRate) || 0),
        outlineLevel: 2,
        sortOrder: currentOrder++,
        createdBy: req.user._id,
      }));
      await ProjectTask.insertMany(taskDocs);
      await syncProjectTasksToProjectEntities(projectId);

      return res.status(201).json(inserted);
    }

    // Single item creation
    if (!wbsCode || !description || !unitOfMeasure || budgetedQuantity === undefined || unitRate === undefined) {
      return res.status(400).json({ msg: 'wbsCode, description, unitOfMeasure, budgetedQuantity, and unitRate are required' });
    }

    const existing = await RABItem.findOne({ projectId, wbsCode });
    if (existing) {
      return res.status(400).json({ msg: `Mata anggaran WBS "${wbsCode}" sudah terdaftar pada proyek ini` });
    }

    const newItem = new RABItem({
      projectId,
      wbsCode,
      description,
      category: category || 'Material',
      unitOfMeasure: unitOfMeasure.toUpperCase(),
      budgetedQuantity: Number(budgetedQuantity),
      unitRate: Number(unitRate),
      totalBudget: Number(budgetedQuantity) * Number(unitRate),
    });

    await newItem.save();

    // Create unified ProjectTask
    const currentOrder = await ProjectTask.countDocuments({ projectId });
    const isMat = (category || '').toLowerCase() === 'material';
    const newTask = new ProjectTask({
      projectId,
      wbsCode,
      name: description,
      itemType: isMat ? 'supply' : 'work',
      category: (category || '').toLowerCase() || 'general',
      unit: unitOfMeasure.toUpperCase(),
      quantity: Number(budgetedQuantity) || 1,
      unitRate: Number(unitRate) || 0,
      plannedCost: Number(budgetedQuantity) * Number(unitRate),
      totalBudget: Number(budgetedQuantity) * Number(unitRate),
      outlineLevel: 2,
      sortOrder: currentOrder,
      createdBy: req.user._id,
    });
    await newTask.save();
    await syncProjectTasksToProjectEntities(projectId);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create RAB item error:', error);
    res.status(500).json({ msg: error.message || 'Server error creating RAB item' });
  }
});

// PUT /api/projects/:projectId/rab/:itemId - Update RAB item allocation
router.put('/:itemId', auth, authorize('owner', 'director', 'project_manager'), async (req, res) => {
  try {
    const { projectId, itemId } = req.params;
    const { description, budgetedQuantity, unitRate, category } = req.body;

    const item = await RABItem.findOne({ _id: itemId, projectId });
    if (!item) {
      return res.status(404).json({ msg: 'RAB line item not found' });
    }

    // Safety: Budgeted quantity cannot be reduced below already realized quantity
    if (budgetedQuantity !== undefined) {
      const newBudgetQty = Number(budgetedQuantity);
      if (newBudgetQty < item.realizedQuantity) {
        return res.status(400).json({
          msg: `Kuantitas anggaran (${newBudgetQty}) tidak boleh lebih kecil dari kuantitas yang telah terealisasi (${item.realizedQuantity})`,
        });
      }
      item.budgetedQuantity = newBudgetQty;
    }

    if (unitRate !== undefined) {
      item.unitRate = Number(unitRate);
    }
    if (description) {
      item.description = description;
    }
    if (category) {
      item.category = category;
    }

    item.totalBudget = item.budgetedQuantity * item.unitRate;
    await item.save();

    res.json(item);
  } catch (error) {
    console.error('Update RAB item error:', error);
    res.status(500).json({ msg: 'Server error updating RAB item' });
  }
});

// DELETE /api/projects/:projectId/rab/:itemId - Delete RAB item
router.delete('/:itemId', auth, authorize('owner', 'director'), async (req, res) => {
  try {
    const { projectId, itemId } = req.params;
    const item = await RABItem.findOne({ _id: itemId, projectId });
    if (!item) {
      return res.status(404).json({ msg: 'RAB item not found' });
    }

    if (item.realizedQuantity > 0 || item.committedQuantity > 0) {
      return res.status(400).json({
        msg: 'Mata anggaran yang telah memiliki realisasi atau komitmen tidak dapat dihapus',
      });
    }

    await item.deleteOne();
    res.json({ msg: 'RAB item deleted successfully' });
  } catch (error) {
    console.error('Delete RAB item error:', error);
    res.status(500).json({ msg: 'Server error deleting RAB item' });
  }
});

module.exports = router;
