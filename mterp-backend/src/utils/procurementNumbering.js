const { Project, User, Request } = require('../models');

/**
 * Extracts first capital/leading letters of significant words from project name.
 * e.g., "Pembangunan Gedung Graha Medika" -> "PGGM"
 */
function extractProjectCapitals(projectName) {
  if (!projectName || typeof projectName !== 'string') return 'PRJ';
  const clean = projectName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PRJ';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0].toUpperCase()).join('').slice(0, 5);
}

/**
 * Extracts initials from requester's full name.
 * e.g., "Syamil Alfatih" -> "SA"
 */
function extractRequesterInitials(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'REQ';
  const words = fullName.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'REQ';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0].toUpperCase()).join('').slice(0, 4);
}

/**
 * Extracts supplier code from supplier name.
 * e.g., "PT Sumber Bangunan" -> "SB"
 */
function extractSupplierCode(supplierName) {
  if (!supplierName || typeof supplierName !== 'string') return 'VND';
  const clean = supplierName
    .replace(/^PT\.?\s+|^CV\.?\s+|^UD\.?\s+|^TOKO\s+/i, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'VND';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0].toUpperCase()).join('').slice(0, 4);
}

/**
 * Generates an official PR Number: PR/[PROJECT_CAPS]/[REQUESTER_INITIALS]/[YYYYMM]/[SEQ]
 */
async function generatePrNumber(projectId, requesterId) {
  let projectCapitals = 'GEN';
  if (projectId) {
    const project = await Project.findById(projectId).select('nama');
    if (project && project.nama) {
      projectCapitals = extractProjectCapitals(project.nama);
    }
  }

  let requesterInitials = 'STF';
  if (requesterId) {
    const user = await User.findById(requesterId).select('fullName');
    if (user && user.fullName) {
      requesterInitials = extractRequesterInitials(user.fullName);
    }
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyymm = `${yyyy}${mm}`;

  const prefix = `PR/${projectCapitals}/${requesterInitials}/${yyyymm}`;

  // Count existing PRs with this prefix in current month
  const count = await Request.countDocuments({
    prNumber: new RegExp(`^PR/${projectCapitals}/`),
    createdAt: {
      $gte: new Date(yyyy, now.getMonth(), 1),
      $lt: new Date(yyyy, now.getMonth() + 1, 1),
    },
  });

  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}/${seq}`;
}

/**
 * Generates an official PO Number: PO/[PROJECT_CAPS]/[SUPPLIER_CODE]/[YYYYMM]/[SEQ]
 */
async function generatePoNumber(projectId, supplierName) {
  let projectCapitals = 'GEN';
  if (projectId) {
    const project = await Project.findById(projectId).select('nama');
    if (project && project.nama) {
      projectCapitals = extractProjectCapitals(project.nama);
    }
  }

  const supplierCode = extractSupplierCode(supplierName);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyymm = `${yyyy}${mm}`;

  const prefix = `PO/${projectCapitals}/${supplierCode}/${yyyymm}`;

  // Count existing POs in current month
  const count = await Request.countDocuments({
    poNumber: { $exists: true, $ne: null },
    'financeApprovedBy.approvedAt': {
      $gte: new Date(yyyy, now.getMonth(), 1),
      $lt: new Date(yyyy, now.getMonth() + 1, 1),
    },
  });

  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}/${seq}`;
}

module.exports = {
  extractProjectCapitals,
  extractRequesterInitials,
  extractSupplierCode,
  generatePrNumber,
  generatePoNumber,
};
