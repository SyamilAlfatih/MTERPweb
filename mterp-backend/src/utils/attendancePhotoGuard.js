const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const DHASH_HAMMING_THRESHOLD = 5;

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup error
  }
}

/**
 * Rejects blank, solid-color, pitch-black, or washed-out selfie uploads using Sharp pixel stats.
 */
async function validateNonBlankImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { valid: true };
  try {
    const stats = await sharp(filePath).stats();
    const rgb = stats.channels.slice(0, 3);
    const maxStdev = Math.max(...rgb.map((c) => c.stdev || 0));
    const avgMean = rgb.reduce((sum, c) => sum + (c.mean || 0), 0) / Math.max(1, rgb.length);

    if (maxStdev < 8 || avgMean < 10 || avgMean > 250) {
      safeUnlink(filePath);
      return {
        valid: false,
        msg: 'Foto selfie kosong, terlalu gelap, atau polos. Silakan ambil foto selfie dengan wajah terlihat jelas.',
      };
    }
    return { valid: true };
  } catch (err) {
    console.warn('[AttendancePhotoGuard] Could not inspect image stats:', err.message);
    return { valid: true };
  }
}

/**
 * Computes SHA-256 (exact file hash) and 64-bit dHash (perceptual hash) for an image file.
 */
async function computePhotoFingerprints(filePath) {
  const fileBuffer = await fs.promises.readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 9x8 grayscale resize -> 8 rows x 8 horizontal comparisons = 64-bit perceptual hash
  const raw = await sharp(fileBuffer)
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = raw[row * 9 + col];
      const right = raw[row * 9 + col + 1];
      bits += left > right ? '1' : '0';
    }
  }

  let dHash = '';
  for (let i = 0; i < 64; i += 4) {
    dHash += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return { sha256, dHash };
}

/**
 * Computes Hamming distance between two 16-char hex 64-bit dHashes.
 */
function hammingDistanceHex(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    // Count set bits in 4-bit nibble
    dist += ((xor & 1) ? 1 : 0) + ((xor & 2) ? 1 : 0) + ((xor & 4) ? 1 : 0) + ((xor & 8) ? 1 : 0);
  }
  return dist;
}

/**
 * Ensures an uploaded attendance photo (check-in or check-out) is:
 * 1) Non-blank / non-solid
 * 2) Never previously uploaded (exact SHA-256 or near-identical dHash <= 5)
 */
async function verifyFreshUniqueAttendancePhoto(filePath, AttendanceModel, userId) {
  const nonBlank = await validateNonBlankImage(filePath);
  if (!nonBlank.valid) {
    return nonBlank;
  }

  let fingerprints;
  try {
    fingerprints = await computePhotoFingerprints(filePath);
  } catch (err) {
    console.warn('[AttendancePhotoGuard] Could not compute photo fingerprints:', err.message);
    return { valid: true, photoHash: undefined, photoDHash: undefined };
  }

  const { sha256, dHash } = fingerprints;

  // 1. Exact SHA-256 match across all historical check-ins and check-outs
  const exactDuplicate = await AttendanceModel.findOne({
    $or: [
      { 'checkIn.photoHash': sha256 },
      { 'checkOut.photoHash': sha256 },
    ],
  })
    .select('_id')
    .lean();

  if (exactDuplicate) {
    safeUnlink(filePath);
    return {
      valid: false,
      msg: 'Foto yang pernah diunggah sebelumnya tidak dapat digunakan untuk absensi. Silakan ambil foto selfie langsung yang baru.',
    };
  }

  // 2. Perceptual dHash match across user's historical photos + recent global photos
  const [userRecent, globalRecent] = await Promise.all([
    userId
      ? AttendanceModel.find({
          userId,
          $or: [
            { 'checkIn.photoDHash': { $exists: true, $ne: null } },
            { 'checkOut.photoDHash': { $exists: true, $ne: null } },
          ],
        })
          .sort({ date: -1 })
          .limit(120)
          .select('checkIn.photoDHash checkOut.photoDHash')
          .lean()
      : Promise.resolve([]),
    AttendanceModel.find({
      $or: [
        { 'checkIn.photoDHash': { $exists: true, $ne: null } },
        { 'checkOut.photoDHash': { $exists: true, $ne: null } },
      ],
    })
      .sort({ date: -1 })
      .limit(200)
      .select('checkIn.photoDHash checkOut.photoDHash')
      .lean(),
  ]);

  const candidates = [...userRecent, ...globalRecent];
  for (const rec of candidates) {
    if (
      (rec.checkIn?.photoDHash && hammingDistanceHex(dHash, rec.checkIn.photoDHash) <= DHASH_HAMMING_THRESHOLD) ||
      (rec.checkOut?.photoDHash && hammingDistanceHex(dHash, rec.checkOut.photoDHash) <= DHASH_HAMMING_THRESHOLD)
    ) {
      safeUnlink(filePath);
      return {
        valid: false,
        msg: 'Foto ini terdeteksi identik dengan foto absensi yang pernah digunakan sebelumnya. Harap ambil foto selfie baru secara langsung.',
      };
    }
  }

  return {
    valid: true,
    photoHash: sha256,
    photoDHash: dHash,
  };
}

module.exports = {
  validateNonBlankImage,
  computePhotoFingerprints,
  hammingDistanceHex,
  verifyFreshUniqueAttendancePhoto,
};
