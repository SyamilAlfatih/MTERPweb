import imageCompression from 'browser-image-compression';

/**
 * Custom hook for client-side image compression.
 * Compresses images to max 800KB and 1920px before upload.
 * Uses a Web Worker so the UI doesn't freeze during compression.
 */
export function useImageCompression() {
  const compress = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 0.8,           // Max 800KB
      maxWidthOrHeight: 1920,   // Max dimension in px
      useWebWorker: true,       // Non-blocking compression
      fileType: 'image/jpeg',
    };
    const compressed = await imageCompression(file, options);
    // Return as File (not Blob) to preserve filename
    return new File([compressed], file.name, { type: compressed.type });
  };

  return { compress };
}
