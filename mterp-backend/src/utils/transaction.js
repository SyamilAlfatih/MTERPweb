const mongoose = require('mongoose');

// Cache whether the connected MongoDB instance supports transactions
let supportsTransactions = null;

function isStandalone() {
  if (supportsTransactions === false) return true;
  try {
    const client = mongoose.connection?.getClient?.();
    const topology = client?.topology;
    const type = topology?.description?.type;
    // 'Single' indicates standalone mongod (no replica set)
    if (type === 'Single') {
      supportsTransactions = false;
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Runs the given workFn inside a Mongoose transaction session.
 * Automatically commits if successful, aborts on error, and closes the session.
 * Gracefully falls back to running without a session if the MongoDB instance is standalone.
 *
 * @param {Function} workFn - async function(session) that performs database operations
 * @returns {Promise<*>} - The return value of workFn
 */
async function withTransaction(workFn) {
  if (isStandalone()) {
    return await workFn(null);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (err) {
    // If starting a session or transaction fails immediately
    supportsTransactions = false;
    return await workFn(null);
  }

  try {
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}

    // Check if error is due to standalone MongoDB not supporting transactions
    const isReplicaSetError =
      error.message?.includes('replica set') ||
      error.message?.includes('Transaction numbers are only allowed') ||
      error.code === 20 ||
      error.codeName === 'IllegalOperation';

    if (isReplicaSetError) {
      supportsTransactions = false;
      console.warn('[Transaction] Standalone MongoDB detected (no replica set). Falling back to non-transactional execution...');
      try {
        session.endSession();
      } catch (_) {}
      return await workFn(null);
    }

    throw error;
  } finally {
    try {
      session.endSession();
    } catch (_) {}
  }
}

module.exports = { withTransaction };
