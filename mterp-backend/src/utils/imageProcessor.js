const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Convert an uploaded image file to WebP format using sharp.
 * Replaces the original file on disk and returns the new path.
 * Accepts all common image formats (JPEG, PNG, TIFF, GIF, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the image file
 * @param {object} [options] - Optional settings (e.g., quality, maxWidth)
 * @returns {Promise<string>} - Resolves to the path of the webp file (or original on fallback)
 */
async function convertToWebP(filePath, options = {}) {
  try {
    const parsed = path.parse(filePath);
    // If already webp, skip conversion
    if (parsed.ext.toLowerCase() === '.webp') return filePath;

    const quality = options.quality || 80;
    const webpPath = path.join(parsed.dir, parsed.name + '.webp');

    let pipeline = sharp(filePath);
    if (options.maxWidth) {
      pipeline = pipeline.resize({ width: options.maxWidth, withoutEnlargement: true });
    }

    await pipeline
      .webp({ quality })
      .toFile(webpPath);

    // Remove original file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* ignore cleanup error */
    }

    return webpPath;
  } catch (err) {
    console.warn('WebP conversion failed for', filePath, err.message);
    // Return original path if conversion fails (e.g. non-image file)
    return filePath;
  }
}

/**
 * Compress an uploaded image file to JPEG/WebP with optional max width and custom output folder.
 *
 * @param {string} filePath - Source image path
 * @param {string} outputDir - Directory where compressed image should be saved
 * @param {object} [options] - Compression options
 * @returns {Promise<{ filename: string, outputPath: string }>}
 */
async function compressImage(filePath, outputDir, options = {}) {
  const quality = options.quality || 80;
  const maxWidth = options.maxWidth || 1920;
  const format = options.format || 'jpeg';
  const prefix = options.prefix || 'img';
  const extension = format === 'webp' ? 'webp' : 'jpg';
  const filename = `${prefix}-${Date.now()}-compressed.${extension}`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, filename);

  let pipeline = sharp(filePath).resize({ width: maxWidth, withoutEnlargement: true });
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.jpeg({ quality });
  }

  await pipeline.toFile(outputPath);

  // Remove original file
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    /* ignore cleanup error */
  }

  return { filename, outputPath };
}

/**
 * Helper to safely delete file from disk given URL or path.
 *
 * @param {string} fileUrl - URL or path containing 'uploads/' or direct file path
 */
function deleteLocalFile(fileUrl) {
  if (!fileUrl) return;
  try {
    const cleanPath = fileUrl.replace(/\\/g, '/');
    const uploadIndex = cleanPath.indexOf('uploads/');
    let fullPath;
    if (uploadIndex !== -1) {
      const relativePath = cleanPath.substring(uploadIndex);
      fullPath = path.join(__dirname, '../../', relativePath);
    } else {
      fullPath = fileUrl;
    }
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error('Error deleting local file:', err.message);
  }
}

module.exports = {
  convertToWebP,
  compressImage,
  deleteLocalFile,
};
