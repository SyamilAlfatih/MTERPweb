import QRCode from 'qrcode';
import { resolveImageUrl } from './image';

/**
 * Canonical Document Seal & QR Signature Engine
 * Single Source of Truth for generating cryptographically auditable QR verification seals
 * and loading remote/local image assets for client-side PDF document generation.
 */

/**
 * Loads an image from a URL or data URI into an HTMLImageElement.
 * Returns null if the image fails to load.
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const targetUrl = resolveImageUrl(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback for /photos/ to /misc/ if applicable
      if (targetUrl.includes('/photos/')) {
        const fallbackUrl = targetUrl.replace('/photos/', '/misc/');
        const imgFallback = new Image();
        imgFallback.crossOrigin = 'anonymous';
        imgFallback.onload = () => resolve(imgFallback);
        imgFallback.onerror = () => resolve(null);
        imgFallback.src = fallbackUrl;
        return;
      }
      resolve(null);
    };
    img.src = targetUrl;
  });
}

/**
 * Loads an image asset as a Base64 PNG data URL from a given source URL.
 */
export async function loadImageAsBase64(src: string): Promise<string> {
  const img = await loadImage(src);
  if (!img) {
    throw new Error(`Failed to load image: ${src}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D canvas context');
  }
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Generates a high-resolution QR code canvas composite with a centered signature/seal image overlay.
 * Uses high error correction ('H') so the center overlay does not impede scannability.
 * If the signature image fails to load, the QR code remains valid without the overlay.
 */
export async function generateQrSignatureSeal(
  qrData: string,
  signatureAssetUrl?: string,
  size = 500,
  darkColor = '#0F172A'
): Promise<string> {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrData, {
    width: size,
    margin: 2,
    color: { dark: darkColor, light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });

  if (signatureAssetUrl) {
    try {
      const sigImg = await loadImage(signatureAssetUrl);
      if (sigImg) {
        const ctx = qrCanvas.getContext('2d');
        if (ctx) {
          const overlaySize = size * 0.28;
          const cx = (size - overlaySize) / 2;
          const cy = (size - overlaySize) / 2;

          ctx.fillStyle = '#FFFFFF';
          const pad = 4;
          ctx.fillRect(cx - pad, cy - pad, overlaySize + pad * 2, overlaySize + pad * 2);
          ctx.drawImage(sigImg, cx, cy, overlaySize, overlaySize);
        }
      }
    } catch {
      // If signature image fails to load, QR remains valid
    }
  }

  return qrCanvas.toDataURL('image/png');
}

/** Aliases for drop-in backward compatibility across callers */
export const generateQrWithOverlay = generateQrSignatureSeal;
export const buildSignatureQr = generateQrSignatureSeal;
