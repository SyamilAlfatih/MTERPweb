import * as faceapi from '@vladmandic/face-api';

export interface FaceVerificationResult {
  valid: boolean;
  faceCount: number;
  confidence?: number;
  reason?: 'blank_image' | 'no_face' | 'invalid_file';
  message: string;
}

let modelLoadPromise: Promise<void> | null = null;

async function ensureFaceModelLoaded(): Promise<void> {
  if (!modelLoadPromise) {
    modelLoadPromise = faceapi.nets.tinyFaceDetector.loadFromUri('/models').catch((err) => {
      modelLoadPromise = null;
      throw err;
    });
  }
  return modelLoadPromise;
}

function loadImageFromFile(file: File | Blob): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca file gambar selfie.'));
    };
    img.src = url;
  });
}

/**
 * Checks pixel luminance mean and standard deviation on a downscaled 64x64 canvas
 * to catch blank, solid-color, covered-lens, pitch-black, or washed-out frames.
 */
function checkBlankOrLowVarianceImage(img: HTMLImageElement): { isBlank: boolean; message?: string } {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { isBlank: false };

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const pixelCount = size * size;

  let sum = 0;
  const luminances = new Float32Array(pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    luminances[p] = lum;
    sum += lum;
  }

  const mean = sum / pixelCount;
  let varianceSum = 0;
  for (let p = 0; p < pixelCount; p++) {
    const diff = luminances[p] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / pixelCount);

  if (stdDev < 10) {
    return {
      isBlank: true,
      message: 'Foto selfie kosong atau polos (lensa tertutup). Silakan ambil foto selfie dengan wajah Anda terlihat jelas.',
    };
  }
  if (mean < 12) {
    return {
      isBlank: true,
      message: 'Foto selfie terlalu gelap. Pastikan pencahayaan cukup dan wajah Anda terlihat jelas.',
    };
  }
  if (mean > 248) {
    return {
      isBlank: true,
      message: 'Foto selfie terlalu terang / kosong. Silakan ambil ulang foto selfie dengan wajah terlihat jelas.',
    };
  }

  return { isBlank: false };
}

/**
 * Verifies that a self-attendance selfie photo is not blank and contains at least one human face.
 * Runs 100% locally on-device using @vladmandic/face-api TinyFaceDetector (free, offline-ready).
 */
export async function verifySelfieHasFace(file: File | Blob): Promise<FaceVerificationResult> {
  if (!file || file.size === 0) {
    return {
      valid: false,
      faceCount: 0,
      reason: 'invalid_file',
      message: 'File foto selfie tidak valid. Silakan ambil foto selfie dengan wajah Anda.',
    };
  }

  let objectUrl = '';
  try {
    const loaded = await loadImageFromFile(file);
    objectUrl = loaded.url;

    const blankCheck = checkBlankOrLowVarianceImage(loaded.img);
    if (blankCheck.isBlank) {
      return {
        valid: false,
        faceCount: 0,
        reason: 'blank_image',
        message: blankCheck.message || 'Foto selfie kosong. Silakan ambil foto selfie dengan wajah terlihat jelas.',
      };
    }

    await ensureFaceModelLoaded();
    const detections = await faceapi.detectAllFaces(
      loaded.img,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.45,
      })
    );

    if (!detections || detections.length === 0) {
      return {
        valid: false,
        faceCount: 0,
        reason: 'no_face',
        message: 'Wajah tidak terdeteksi pada foto selfie. Silakan ambil foto selfie ulang dengan wajah menghadap kamera dan terlihat jelas.',
      };
    }

    const bestScore = Math.max(...detections.map((d) => d.score));
    return {
      valid: true,
      faceCount: detections.length,
      confidence: bestScore,
      message: `Wajah terdeteksi (${Math.round(bestScore * 100)}% keyakinan).`,
    };
  } catch (err) {
    console.warn('[FaceDetection] Verification error:', err);
    return {
      valid: false,
      faceCount: 0,
      reason: 'invalid_file',
      message: 'Gagal memverifikasi wajah pada foto selfie. Silakan ambil ulang foto selfie dengan wajah terlihat jelas.',
    };
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

