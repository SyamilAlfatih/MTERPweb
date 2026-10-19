const { RABItem, ProjectTask, Supply } = require('../models');

/**
 * Validates whether the requested quantity/amount is within the RAB item budget quota.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.rabItemId
 * @param {number} params.qty
 * @param {number} [params.amount]
 * @param {object} [params.session] - Optional Mongoose transaction session
 * @returns {Promise<{ rabItem: object, taskItem: object|null }>}
 */
async function validateAndReserveBudget({ projectId, rabItemId, qty, amount, session = null }) {
  const rabQuery = RABItem.findOne({ _id: rabItemId, projectId });
  if (session) rabQuery.session(session);
  const rabItem = await rabQuery;

  if (!rabItem) {
    const err = new Error('Mata Anggaran RAB tidak ditemukan untuk proyek ini');
    err.statusCode = 404;
    throw err;
  }

  // Also query ProjectTask if available
  const taskQuery = ProjectTask.findById(rabItemId);
  if (session) taskQuery.session(session);
  const taskItem = await taskQuery;

  const numQuantity = Number(qty) || 0;
  const remainingQuota = rabItem.budgetQuantity - (rabItem.realizedQuantity || 0);

  if (numQuantity > remainingQuota) {
    const err = new Error(
      `Kuantitas melebihi batas anggaran! Sisa kuota mata anggaran ${rabItem.wbsCode} hanya ${remainingQuota} ${rabItem.unitOfMeasure}`
    );
    err.statusCode = 422;
    throw err;
  }

  return { rabItem, taskItem };
}

/**
 * Commits purchase realization to RABItem, ProjectTask, and Supply atomically.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.rabItemId
 * @param {number} params.quantity
 * @param {number} params.totalPrice
 * @param {object} [params.taskItem]
 * @param {object} [params.session]
 */
async function commitPurchaseToRabAndSupply({ projectId, rabItemId, quantity, totalPrice, taskItem = null, session = null }) {
  const updateDoc = {
    $inc: {
      realizedQuantity: quantity,
      realizedAmount: totalPrice,
      actualCost: totalPrice,
    },
  };

  const options = session ? { session } : {};

  await RABItem.updateOne({ _id: rabItemId }, updateDoc, options);
  await ProjectTask.updateOne({ _id: rabItemId }, updateDoc, options);

  if (taskItem && taskItem.itemType === 'supply') {
    await Supply.updateOne(
      { projectId, item: taskItem.name },
      { $inc: { totalQtyUsed: quantity, actualCost: totalPrice } },
      options
    );
  }
}

/**
 * Rolls back purchase realization from RABItem and ProjectTask.
 *
 * @param {object} params
 * @param {string} params.rabItemId
 * @param {number} params.quantity
 * @param {number} params.totalPrice
 * @param {object} [params.session]
 */
async function rollbackPurchaseFromRabAndSupply({ rabItemId, quantity, totalPrice, session = null }) {
  const rollbackDoc = {
    $inc: {
      realizedQuantity: -quantity,
      realizedAmount: -totalPrice,
      actualCost: -totalPrice,
    },
  };

  const options = session ? { session } : {};

  await RABItem.updateOne({ _id: rabItemId }, rollbackDoc, options);
  await ProjectTask.updateOne({ _id: rabItemId }, rollbackDoc, options);
}

module.exports = {
  validateAndReserveBudget,
  commitPurchaseToRabAndSupply,
  rollbackPurchaseFromRabAndSupply,
};
