/**
 * High-Resolution Canvas Snapshot Exporter with Mathematical Watermark Badge
 */
export interface ExportOptions {
  scale?: number; // 1 for native DPR, 2 for Ultra-HD 2x supersampling
  subtitle?: string;
  category?: string;
}

export function exportCanvasSnapshot(
  sourceCanvas: HTMLCanvasElement,
  experimentName: string,
  badgeInfo: string,
  options: ExportOptions = {}
): string {
  const scale = options.scale ?? (window.devicePixelRatio >= 2 ? 1 : 1.5);
  const targetW = Math.round(sourceCanvas.width * scale);
  const targetH = Math.round(sourceCanvas.height * scale);

  // Create offscreen high-res export canvas
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetW;
  exportCanvas.height = targetH;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return '';

  // Configure high quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw source canvas image
  ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  // Responsive watermark badge sizing
  const badgeScale = Math.max(1.0, Math.min(2.5, targetW / 1200));
  const pad = Math.round(24 * badgeScale);
  const badgeW = Math.round(300 * badgeScale);
  const badgeH = Math.round(62 * badgeScale);
  const bx = targetW - badgeW - pad;
  const by = targetH - badgeH - pad;
  const cornerR = Math.round(12 * badgeScale);

  ctx.save();

  // Glassmorphic dark card backdrop
  ctx.fillStyle = 'rgba(7, 10, 18, 0.88)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = Math.max(1.5, 1.5 * badgeScale);

  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, cornerR);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.strokeRect(bx, by, badgeW, badgeH);
  }

  // Integral logo badge circle
  const circleX = bx + Math.round(30 * badgeScale);
  const circleY = by + Math.round(31 * badgeScale);
  const circleR = Math.round(18 * badgeScale);

  ctx.beginPath();
  ctx.arc(circleX, circleY, circleR, 0, 2 * Math.PI);
  const logoGrad = ctx.createLinearGradient(
    circleX - circleR,
    circleY - circleR,
    circleX + circleR,
    circleY + circleR
  );
  logoGrad.addColorStop(0, '#0284c7');
  logoGrad.addColorStop(1, '#4f46e5');
  ctx.fillStyle = logoGrad;
  ctx.fill();

  // Integral '∫' symbol
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(18 * badgeScale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('∫', circleX, circleY + Math.round(1 * badgeScale));

  // Experiment Title
  const textX = bx + Math.round(58 * badgeScale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#38bdf8';
  ctx.font = `bold ${Math.round(13 * badgeScale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(`MathLab • ${experimentName}`, textX, by + Math.round(26 * badgeScale));

  // Subtitle / Physics Parameter Info
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.round(10 * badgeScale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const cleanBadge = badgeInfo.length > 36 ? badgeInfo.slice(0, 36) + '...' : badgeInfo;
  ctx.fillText(cleanBadge, textX, by + Math.round(42 * badgeScale));

  // Ultra-HD stamp
  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(8.5 * badgeScale)}px ui-monospace, SFMono-Regular, monospace`;
  const resLabel = `${targetW} × ${targetH} UHD • ${new Date().toLocaleDateString()}`;
  ctx.fillText(resLabel, textX, by + Math.round(54 * badgeScale));

  ctx.restore();

  // Generate file & trigger download
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const cleanName = experimentName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `MathLab_${cleanName}_${timestamp}.png`;

  const link = document.createElement('a');
  link.download = filename;
  link.href = exportCanvas.toDataURL('image/png', 1.0);
  link.click();

  return filename;
}
