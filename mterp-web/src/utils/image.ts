const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const BASE_URL = API_URL.replace('/api', '');

/**
 * Normalizes image paths to ensure they work correctly with the backend.
 * Handles:
 * 1. Absolute Windows/Linux paths saved by multer
 * 2. Incomplete URLs
 * 3. Already valid HTTP URLs
 */
export const getImageUrl = (imagePath?: string | null): string => {
  if (!imagePath) return '';
  
  // If it's already a full URL, blob, or base64 data URI, return it
  if (
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://') ||
    imagePath.startsWith('blob:') ||
    imagePath.startsWith('data:')
  ) {
    return imagePath;
  }
  
  // Fix Windows absolute paths (e.g. C:\Users\... \uploads\photos\...)
  // By extracting only the 'uploads/...' part
  let normalizedPath = imagePath.replace(/\\/g, '/');
  
  const uploadIndex = normalizedPath.indexOf('uploads/');
  if (uploadIndex !== -1) {
    normalizedPath = normalizedPath.substring(uploadIndex);
  } else if (normalizedPath.startsWith('/')) {
    // If it starts with / but doesn't have uploads/, assume it's relative to root
    normalizedPath = normalizedPath.substring(1);
  }
  
  // Also strip 'undefined/' if it accidentally got prepended in DB or frontend
  if (normalizedPath.startsWith('undefined/')) {
    normalizedPath = normalizedPath.replace('undefined/', '');
  }
  
  return `${BASE_URL}/${normalizedPath}`;
};

/**
 * Resolves an image path:
 * - Returns data:, blob:, and http(s) URLs as-is
 * - For backend uploads (containing 'uploads/'), resolves to full backend URL via getImageUrl
 * - For frontend public assets (e.g. '/Kop Surat Aplikasi.webp'), returns as-is
 */
export const resolveImageUrl = (imagePath?: string | null): string => {
  if (!imagePath) return '';
  if (
    imagePath.startsWith('data:') ||
    imagePath.startsWith('blob:') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://')
  ) {
    return imagePath;
  }
  const normalized = imagePath.replace(/\\/g, '/');
  if (normalized.includes('uploads/')) {
    return getImageUrl(normalized);
  }
  return imagePath;
};
