const express = require('express');
const { LocalPurchase, RABItem, Project, User, ProjectTask, Supply } = require('../models');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { withTransaction } = require('../utils/transaction');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/local-purchases - List local purchases
router.get('/', auth, async (req, res) => {
  try {
    const projectId = req.params.projectId || req.query.projectId;
    const { status, rabItemId } = req.query;

    const query = {};
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    if (rabItemId) query.rabItemId = rabItemId;

    const purchases = await LocalPurchase.find(query)
      .populate('verifiedBy', 'fullName role')
      .populate('createdBy', 'fullName role')
      .sort({ createdAt: -1 })
      .lean();

    // Populate rabItemId from either RABItem or ProjectTask
    const rabItemIds = purchases.map(p => p.rabItemId).filter(Boolean);
    const [rabItems, tasks] = await Promise.all([
      RABItem.find({ _id: { $in: rabItemIds } }).select('wbsCode description unitOfMeasure unitRate').lean(),
      ProjectTask.find({ _id: { $in: rabItemIds } }).select('wbsCode name unit unitRate').lean(),
    ]);

    const rabMap = new Map();
    rabItems.forEach(r => rabMap.set(r._id.toString(), r));
    tasks.forEach(t => rabMap.set(t._id.toString(), {
      _id: t._id,
      wbsCode: t.wbsCode,
      description: t.name,
      unitOfMeasure: t.unit || 'pcs',
      unitRate: t.unitRate || 0,
    }));

    purchases.forEach(p => {
      if (p.rabItemId) {
        p.rabItemId = rabMap.get(p.rabItemId.toString()) || null;
      }
    });

    const summary = purchases.reduce(
      (acc, p) => {
        acc.totalPurchases += p.totalPrice || 0;
        if (p.status === 'VERIFIED') acc.totalVerified += p.totalPrice || 0;
        if (p.status === 'SUBMITTED') acc.totalPendingVerification += p.totalPrice || 0;
        return acc;
      },
      { totalPurchases: 0, totalVerified: 0, totalPendingVerification: 0 }
    );

    res.json({
      purchases,
      summary,
    });
  } catch (error) {
    console.error('Get local purchases error:', error);
    res.status(500).json({ msg: 'Server error fetching purchases' });
  }
});

// POST /api/projects/:projectId/local-purchases - Record Direct Local Purchase with ACID Transaction
router.post(
  '/',
  auth,
  uploadLimiter,
  upload.single('receiptPhoto'),
  async (req, res) => {
    try {
      const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
      const {
        rabItemId,
        voucherNumber,
        purchaserName,
        supplierName,
        itemDescription,
        quantity,
        unitOfMeasure,
        unitPrice,
        lat,
        lng,
        addressText,
      } = req.body;

      if (!rabItemId || !voucherNumber || !purchaserName || !supplierName || !itemDescription || !quantity || !unitPrice) {
        return res.status(400).json({
          msg: 'Field rabItemId, voucherNumber, purchaserName, supplierName, itemDescription, quantity, dan unitPrice wajib diisi',
        });
      }

      const photoPath = req.file ? req.file.path : req.body.receiptPhotoUrl;
      if (!photoPath) {
        return res.status(400).json({ msg: 'Foto bukti kuitansi/nota pembelian lokal wajib diunggah' });
      }

      const numQuantity = Number(quantity);
      const numUnitPrice = Number(unitPrice);
      const calculatedTotal = numQuantity * numUnitPrice;
      let taskItem = null;

      const purchase = await withTransaction(async (session) => {
        // 1. Verify existence of RAB Line Item or ProjectTask and check remaining cap
        let rabItem = session
          ? await RABItem.findOne({ _id: rabItemId, projectId }).session(session)
          : await RABItem.findOne({ _id: rabItemId, projectId });

        taskItem = null;
        if (!rabItem) {
          taskItem = session
            ? await ProjectTask.findOne({ _id: rabItemId, projectId }).session(session)
            : await ProjectTask.findOne({ _id: rabItemId, projectId });

          if (taskItem) {
            rabItem = {
              _id: taskItem._id,
              wbsCode: taskItem.wbsCode,
              description: taskItem.name,
              unitOfMeasure: taskItem.unit || 'pcs',
              budgetedQuantity: taskItem.quantity || 1,
              realizedQuantity: taskItem.realizedQuantity || 0,
            };
          }
        }

        if (!rabItem) {
          const err = new Error('Mata anggaran RAB atau Task WBS tidak ditemukan pada proyek ini');
          err.statusCode = 404;
          throw err;
        }

        const remainingQuota = rabItem.budgetedQuantity - rabItem.realizedQuantity;
        if (numQuantity > remainingQuota) {
          const err = new Error(
            `Kuantitas melebihi batas anggaran! Sisa kuota mata anggaran ${rabItem.wbsCode} hanya ${remainingQuota} ${rabItem.unitOfMeasure}`
          );
          err.statusCode = 422;
          throw err;
        }

        // 2. Check for duplicate voucher number
        const existingVoucher = session
          ? await LocalPurchase.findOne({ voucherNumber }).session(session)
          : await LocalPurchase.findOne({ voucherNumber });

        if (existingVoucher) {
          const err = new Error(`Nomor kuitansi "${voucherNumber}" sudah pernah dicatat dalam sistem`);
          err.statusCode = 400;
          throw err;
        }

        // 3. Create the Local Purchase Voucher Record
        const newPurchase = new LocalPurchase({
          projectId,
          rabItemId,
          voucherNumber,
          purchaserName,
          supplierName,
          itemDescription,
          quantity: numQuantity,
          unitOfMeasure: unitOfMeasure || rabItem.unitOfMeasure,
          unitPrice: numUnitPrice,
          totalPrice: calculatedTotal,
          receiptPhotoUrl: photoPath,
          geotagLocation: {
            lat: lat ? Number(lat) : undefined,
            lng: lng ? Number(lng) : undefined,
            addressText: addressText || undefined,
          },
          status: 'SUBMITTED',
          createdBy: req.user._id,
        });

        if (session) {
          await newPurchase.save({ session });
        } else {
          await newPurchase.save();
        }

        // 4. Update RAB Realization Ledger & ProjectTask atomically
        const updateDoc = {
          $inc: {
            realizedQuantity: numQuantity,
            realizedAmount: calculatedTotal,
            actualCost: calculatedTotal,
          },
        };

        if (session) {
          await RABItem.updateOne({ _id: rabItemId }, updateDoc, { session });
          await ProjectTask.updateOne({ _id: rabItemId }, updateDoc, { session });
          if (taskItem && taskItem.itemType === 'supply') {
            await Supply.updateOne(
              { projectId, item: taskItem.name },
              { $inc: { totalQtyUsed: numQuantity, actualCost: calculatedTotal } },
              { session }
            );
          }
        } else {
          await RABItem.updateOne({ _id: rabItemId }, updateDoc);
          await ProjectTask.updateOne({ _id: rabItemId }, updateDoc);
          if (taskItem && taskItem.itemType === 'supply') {
            await Supply.updateOne(
              { projectId, item: taskItem.name },
              { $inc: { totalQtyUsed: numQuantity, actualCost: calculatedTotal } }
            );
          }
        }

        return newPurchase;
      });

      await purchase.populate('createdBy', 'fullName role');
      const purchaseObj = purchase.toObject();

      if (taskItem) {
        purchaseObj.rabItemId = {
          _id: taskItem._id,
          wbsCode: taskItem.wbsCode,
          description: taskItem.name,
          unitOfMeasure: taskItem.unit || 'pcs',
          unitRate: taskItem.unitRate || 0,
        };
      } else {
        await purchase.populate('rabItemId', 'wbsCode description unitOfMeasure unitRate');
        purchaseObj.rabItemId = purchase.rabItemId;
      }

      res.status(201).json(purchaseObj);
    } catch (error) {
      console.error('Create local purchase error:', error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({ msg: error.message });
      }
      res.status(500).json({ msg: error.message || 'Server error recording local purchase' });
    }
  }
);

// PUT / PATCH /api/projects/:projectId/local-purchases/:purchaseId/verify - Verify or Reject Voucher
const handleVerifyPurchase = async (req, res) => {
  try {
    const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
    const { purchaseId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ msg: 'Status harus bernilai VERIFIED atau REJECTED' });
    }

    const updated = await withTransaction(async (session) => {
      const purchaseFilter = projectId
        ? { _id: purchaseId, projectId }
        : { _id: purchaseId };

      const purchase = session
        ? await LocalPurchase.findOne(purchaseFilter).session(session)
        : await LocalPurchase.findOne(purchaseFilter);

        if (!purchase) {
          const err = new Error('Bukti pembelian lokal tidak ditemukan');
          err.statusCode = 404;
          throw err;
        }

        // If previously submitted/verified and now rejected, rollback the realized amount
        if (status === 'REJECTED' && purchase.status !== 'REJECTED') {
          const rollbackDoc = {
            $inc: {
              realizedQuantity: -purchase.quantity,
              realizedAmount: -purchase.totalPrice,
              actualCost: -purchase.totalPrice,
            },
          };

          if (session) {
            await RABItem.updateOne({ _id: purchase.rabItemId }, rollbackDoc, { session });
            await ProjectTask.updateOne({ _id: purchase.rabItemId }, rollbackDoc, { session });
          } else {
            await RABItem.updateOne({ _id: purchase.rabItemId }, rollbackDoc);
            await ProjectTask.updateOne({ _id: purchase.rabItemId }, rollbackDoc);
          }
          purchase.rejectionReason = rejectionReason || 'Ditolak oleh verifikator anggaran';
        }

        purchase.status = status;
        purchase.verifiedBy = req.user._id;
        purchase.verifiedAt = new Date();

        if (session) {
          await purchase.save({ session });
        } else {
          await purchase.save();
        }

        return purchase;
      });

      await updated.populate('rabItemId', 'wbsCode description unitOfMeasure');
      await updated.populate('verifiedBy', 'fullName role');

      res.json(updated);
    } catch (error) {
      console.error('Verify local purchase error:', error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({ msg: error.message });
      }
      res.status(500).json({ msg: 'Server error verifying purchase' });
    }
  };

router.put(
  '/:purchaseId/verify',
  auth,
  authorize('owner', 'director', 'project_manager', 'site_manager'),
  handleVerifyPurchase
);

router.patch(
  '/:purchaseId/verify',
  auth,
  authorize('owner', 'director', 'project_manager', 'site_manager'),
  handleVerifyPurchase
);

module.exports = router;
