const INVALID_FILENAME_CHARS = '<>:"/\\|?*';

/** Computes source crop coordinates matching CSS `object-fit: cover`. */
export function computeCoverCrop(sourceWidth, sourceHeight, targetAspect) {
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sw / sh > targetAspect) {
    sw = sh * targetAspect;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sw / targetAspect;
    sy = (sourceHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

/** Strips invalid filesystem/control characters and normalizes whitespace into dashes. */
export function sanitizeFilename(name, fallback = 'my-aura-filter') {
  const cleaned = Array.from(String(name ?? '').trim())
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && !INVALID_FILENAME_CHARS.includes(char);
    })
    .join('')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  return cleaned || fallback;
}

/** Builds a sortable ISO-style timestamp filename such as `iqra-aura-2026-01-01T00-00-00-000Z.jpg`. */
export function buildTimestampFilename(prefix, extension = 'jpg', date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

/** Captures a horizontally mirrored video frame composited with one or more overlay canvases. */
export async function captureCompositePhoto({
  video,
  container,
  layers = [],
  mimeType = 'image/jpeg',
  quality = 0.92,
}) {
  if (
    !video ||
    !container ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    throw new Error('The camera frame is not ready yet. Wait a moment and try again.');
  }

  const rect = container.getBoundingClientRect();
  const aspect = rect.width && rect.height ? rect.width / rect.height : 16 / 9;
  const outputWidth = Math.min(1920, Math.max(640, video.videoWidth));
  const outputHeight = Math.round(outputWidth / aspect);

  const photo = document.createElement('canvas');
  photo.width = outputWidth;
  photo.height = outputHeight;
  const context = photo.getContext('2d');
  if (!context) {
    throw new Error('Canvas capture is unavailable in this browser.');
  }

  const { sx, sy, sw, sh } = computeCoverCrop(video.videoWidth, video.videoHeight, aspect);
  context.save();
  context.translate(outputWidth, 0);
  context.scale(-1, 1);
  context.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  context.restore();

  for (const layer of layers) {
    if (layer) {
      context.drawImage(layer, 0, 0, outputWidth, outputHeight);
    }
  }

  return new Promise((resolve, reject) => {
    photo.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('The browser could not encode this photo. Try again.'))),
      mimeType,
      quality,
    );
  });
}

/** Triggers a browser download from an existing object or data URL. */
export function triggerDownloadUrl(url, filename) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Triggers a browser download for a Blob and revokes the temporary object URL afterward. */
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
