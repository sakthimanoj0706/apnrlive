/**
 * GateSense ANPR Pipeline — Edge-AI Detection
 * 
 * Pipeline:
 * 1. Fast Probe: COCO-SSD Vehicle Detection -> Edge-Density Plate Localization -> Quality Score
 * 2. Targeted OCR: Bilinear Quad Warp -> 6 Preprocessing Variants -> Multi-PSM Tesseract OCR
 * 3. Fusion: Character-level voting -> Confidence calculation -> Result Validation
 */

import { createWorker } from 'tesseract.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VehicleBox {
  bbox: [number, number, number, number]; // x, y, w, h
  score: number;
  class: string;
}

export interface OcrAttempt {
  text: string;
  confidence: number;
  variant: string;
  psm: string;
}

export interface PlateCrop {
  bbox: [number, number, number, number];
  canvas: HTMLCanvasElement;
  qualityScore: number;
  width: number;
  height: number;
  variance: number;
}

export interface FrameResult {
  timestamp: number;
  vehicles: VehicleBox[];
  plateBbox: [number, number, number, number] | null;
  ocrAttempts: OcrAttempt[];
  bestText: string | null;
  quality: number;
  crop?: PlateCrop;
  trackId?: string;
}

export interface PipelineOutput {
  plate: string;
  confidence: number;
  frameAgreement: number;
  isPlateCertain: boolean;
  frames: FrameResult[];
  debugLog: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle', 'motorbike', 'van']);
const STRICT_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;
const LOOSE_RE = /[A-Z0-9]{2}[0-9]{1,2}[A-Z0-9]{1,3}[0-9]{3,4}/;

// ─── Singletons ──────────────────────────────────────────────────────────────

let _detector: any = null;

export async function loadDetector(): Promise<any> {
  if (!_detector) {
    const [cocoSsdMod] = await Promise.all([
      import('@tensorflow-models/coco-ssd'),
      import('@tensorflow/tfjs-backend-webgl'),
    ]);
    _detector = await cocoSsdMod.load({ base: 'lite_mobilenet_v2' });
  }
  return _detector;
}

let _tessWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

async function getTessWorker() {
  if (!_tessWorker) {
    _tessWorker = await createWorker('eng');
    await _tessWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    });
  }
  return _tessWorker;
}

// ─── Image Utilities ─────────────────────────────────────────────────────────

function cropAndScale(
  src: HTMLCanvasElement | HTMLVideoElement,
  sx: number, sy: number, sw: number, sh: number,
  scale: number
): HTMLCanvasElement {
  const ow = Math.max(1, Math.round(sw * scale));
  const oh = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = ow; c.height = oh;
  c.getContext('2d')!.drawImage(src as any, sx, sy, sw, sh, 0, 0, ow, oh);
  return c;
}

function toLuminance(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(data.length >> 2);
  for (let i = 0, gi = 0; i < data.length; i += 4, gi++) {
    out[gi] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function pixelVariance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!;
  const grays = toLuminance(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  const mean = grays.reduce((a, b) => a + b, 0) / grays.length;
  return grays.reduce((a, b) => a + (b - mean) ** 2, 0) / grays.length;
}

function copyCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const n = document.createElement('canvas');
  n.width = c.width; n.height = c.height;
  n.getContext('2d')!.drawImage(c, 0, 0);
  return n;
}

// ─── Plate Localization (Edge Density Projection) ────────────────────────────

function localizePlate(vehicleCanvas: HTMLCanvasElement): [number, number, number, number] | null {
  const w = vehicleCanvas.width;
  const h = vehicleCanvas.height;
  const ctx = vehicleCanvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const grays = toLuminance(img.data);
  
  // Calculate absolute horizontal gradients
  const grads = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      grads[y * w + x] = Math.abs(grays[y * w + x + 1] - grays[y * w + x - 1]);
    }
  }
  
  // Vertical projection (row sums)
  const rowSum = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += grads[y * w + x];
    rowSum[y] = sum;
  }
  
  // Find vertical band with maximum average edge density
  const minH = Math.max(8, Math.floor(h * 0.05));
  const maxH = Math.floor(h * 0.35);
  let bestY1 = 0, bestY2 = 0, maxRowScore = 0;
  for (let y = 0; y < h - minH; y++) {
    for (let bandH = minH; bandH <= maxH && y + bandH < h; bandH++) {
      let score = 0;
      for (let i = y; i <= y + bandH; i++) score += rowSum[i];
      const avgScore = score / bandH;
      if (avgScore > maxRowScore) { maxRowScore = avgScore; bestY1 = y; bestY2 = y + bandH; }
    }
  }
  
  // Horizontal projection within the selected vertical band
  const colSum = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = bestY1; y <= bestY2; y++) sum += grads[y * w + x];
    colSum[x] = sum;
  }
  
  // Find horizontal band matching license plate aspect ratio
  const plateH = bestY2 - bestY1;
  const minW = Math.floor(plateH * 2.0);
  const maxW = Math.floor(plateH * 6.0);
  let bestX1 = 0, bestX2 = 0, maxColScore = 0;
  for (let x = 0; x < w - minW; x++) {
    for (let bandW = minW; bandW <= maxW && x + bandW < w; bandW++) {
      let score = 0;
      for (let i = x; i <= x + bandW; i++) score += colSum[i];
      const avgScore = score / bandW;
      if (avgScore > maxColScore) { maxColScore = avgScore; bestX1 = x; bestX2 = x + bandW; }
    }
  }
  
  if (maxRowScore === 0 || maxColScore === 0) return null;
  return [bestX1, bestY1, bestX2 - bestX1, plateH];
}

// ─── Perspective Corner Detection & Bilinear Warp ────────────────────────────

function findPlateCorners(canvas: HTMLCanvasElement): {p1: any, p2: any, p3: any, p4: any} {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h);
  const grays = toLuminance(img.data);
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  
  let sum = 0, count = 0;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) { sum += grays[y * w + x]; count++; }
    }
  }
  const refBright = count > 0 ? sum / count : 128;
  const isLightPlate = refBright > 100;
  
  const scanLine = (tx: number, ty: number) => {
    const steps = Math.max(Math.abs(tx - cx), Math.abs(ty - cy));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(cx + t * (tx - cx));
      const y = Math.round(cy + t * (ty - cy));
      if (x < 0 || x >= w || y < 0 || y >= h) break;
      const val = grays[y * w + x];
      // Check for sharp contrast drop-off indicating plate border
      if (isLightPlate && val < refBright * 0.65) return { x, y };
      if (!isLightPlate && val > refBright * 1.5) return { x, y };
    }
    return { x: tx, y: ty };
  };
  
  return { p1: scanLine(0, 0), p2: scanLine(w - 1, 0), p3: scanLine(w - 1, h - 1), p4: scanLine(0, h - 1) };
}

function warpQuad(srcCtx: CanvasRenderingContext2D, srcW: number, srcH: number, p1: any, p2: any, p3: any, p4: any, dstW: number, dstH: number): HTMLCanvasElement {
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW; dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d')!;
  const srcImg = srcCtx.getImageData(0, 0, srcW, srcH);
  const dstImg = dstCtx.createImageData(dstW, dstH);
  const srcData = srcImg.data, dstData = dstImg.data;
  
  for (let dv = 0; dv < dstH; dv++) {
    const yRatio = dv / (dstH - 1);
    for (let du = 0; du < dstW; du++) {
      const xRatio = du / (dstW - 1);
      
      const sx = (1 - xRatio) * (1 - yRatio) * p1.x + xRatio * (1 - yRatio) * p2.x + xRatio * yRatio * p3.x + (1 - xRatio) * yRatio * p4.x;
      const sy = (1 - xRatio) * (1 - yRatio) * p1.y + xRatio * (1 - yRatio) * p2.y + xRatio * yRatio * p3.y + (1 - xRatio) * yRatio * p4.y;
      
      const x0 = Math.floor(sx), x1 = Math.min(srcW - 1, x0 + 1);
      const y0 = Math.floor(sy), y1 = Math.min(srcH - 1, y0 + 1);
      const dx = sx - x0, dy = sy - y0;
      const idx00 = (y0 * srcW + x0) * 4, idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4, idx11 = (y1 * srcW + x1) * 4;
      const didx = (dv * dstW + du) * 4;
      
      for (let c = 0; c < 4; c++) {
        const val = (1 - dx) * (1 - dy) * srcData[idx00 + c] + dx * (1 - dy) * srcData[idx10 + c] + (1 - dx) * dy * srcData[idx01 + c] + dx * dy * srcData[idx11 + c];
        dstData[didx + c] = Math.round(val);
      }
    }
  }
  dstCtx.putImageData(dstImg, 0, 0);
  return dstCanvas;
}

// ─── OCR Preprocessing Variants ──────────────────────────────────────────────

function contrastStretch(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(canvas); const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const grays = toLuminance(img.data);
  let lo = 255, hi = 0; grays.forEach(g => { if (g < lo) lo = g; if (g > hi) hi = g; });
  const rng = hi - lo || 1;
  for (let i = 0, gi = 0; i < img.data.length; i += 4, gi++) {
    const v = Math.round(((grays[gi] - lo) / rng) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

function localContrastEnhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(canvas); const ctx = c.getContext('2d')!;
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const grays = toLuminance(img.data);
  const integral = new Float64Array(w * h), integralSq = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0, sumSq = 0;
    for (let x = 0; x < w; x++) {
      const v = grays[y * w + x]; sum += v; sumSq += v * v;
      integral[y * w + x] = sum + (y > 0 ? integral[(y - 1) * w + x] : 0);
      integralSq[y * w + x] = sumSq + (y > 0 ? integralSq[(y - 1) * w + x] : 0);
    }
  }
  const size = 31, half = Math.floor(size / 2);
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[y1 * w + x1] - (y0 > 0 ? integral[(y0 - 1) * w + x1] : 0) - (x0 > 0 ? integral[y1 * w + (x0 - 1)] : 0) + (y0 > 0 && x0 > 0 ? integral[(y0 - 1) * w + (x0 - 1)] : 0);
      const sumSq = integralSq[y1 * w + x1] - (y0 > 0 ? integralSq[(y0 - 1) * w + x1] : 0) - (x0 > 0 ? integralSq[y1 * w + (x0 - 1)] : 0) + (y0 > 0 && x0 > 0 ? integralSq[(y0 - 1) * w + (x0 - 1)] : 0);
      const mean = sum / count, variance = Math.max(0, (sumSq / count) - (mean * mean));
      const stddev = Math.sqrt(variance);
      let val = grays[y * w + x];
      if (stddev > 0.1) val = 128 + ((val - mean) / stddev) * 64;
      val = Math.max(0, Math.min(255, val));
      const idx = (y * w + x) * 4;
      out.data[idx] = out.data[idx+1] = out.data[idx+2] = val; out.data[idx+3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  
  // Apply 3x3 Sharpening filter
  const sharp = ctx.createImageData(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const v = 5 * out.data[idx] - out.data[((y - 1) * w + x) * 4] - out.data[((y + 1) * w + x) * 4] - out.data[(y * w + (x - 1)) * 4] - out.data[(y * w + (x + 1)) * 4];
      sharp.data[idx] = sharp.data[idx+1] = sharp.data[idx+2] = Math.max(0, Math.min(255, v));
      sharp.data[idx+3] = 255;
    }
  }
  ctx.putImageData(sharp, 0, 0); return c;
}

function adaptiveThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(canvas); const ctx = c.getContext('2d')!;
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const grays = toLuminance(img.data);
  const integral = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      sum += grays[y * w + x];
      integral[y * w + x] = sum + (y > 0 ? integral[(y - 1) * w + x] : 0);
    }
  }
  const size = 31, half = Math.floor(size / 2), C_val = 10;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[y1 * w + x1] - (y0 > 0 ? integral[(y0 - 1) * w + x1] : 0) - (x0 > 0 ? integral[y1 * w + (x0 - 1)] : 0) + (y0 > 0 && x0 > 0 ? integral[(y0 - 1) * w + (x0 - 1)] : 0);
      const mean = sum / count;
      const v = grays[y * w + x] < (mean - C_val) ? 0 : 255;
      const idx = (y * w + x) * 4;
      img.data[idx] = img.data[idx+1] = img.data[idx+2] = v; img.data[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); return c;
}

function otsuThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(canvas); const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const grays = toLuminance(img.data);
  const hist = new Int32Array(256); grays.forEach(g => hist[Math.round(g)]++);
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxV = 0, thresh = 128, total = grays.length;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > maxV) { maxV = v; thresh = t; }
  }
  for (let i = 0, gi = 0; i < img.data.length; i += 4, gi++) {
    const v = grays[gi] >= thresh ? 255 : 0;
    img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

function invertedContrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = copyCanvas(canvas); const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const grays = toLuminance(img.data);
  let lo = 255, hi = 0; grays.forEach(g => { if (g < lo) lo = g; if (g > hi) hi = g; });
  const rng = hi - lo || 1;
  for (let i = 0, gi = 0; i < img.data.length; i += 4, gi++) {
    const v = 255 - Math.round(((grays[gi] - lo) / rng) * 255);
    img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

const VARIANTS: {name: string, fn: (c: HTMLCanvasElement)=>HTMLCanvasElement}[] = [
  {name: 'original', fn: copyCanvas},
  {name: 'contrast', fn: contrastStretch},
  {name: 'clahe', fn: localContrastEnhance},
  {name: 'adaptive', fn: adaptiveThreshold},
  {name: 'otsu', fn: otsuThreshold},
  {name: 'inverted', fn: invertedContrast}
];
const PSMS = ['7', '8', '13'];

// ─── Pipeline Core Functions ─────────────────────────────────────────────────

export async function probeFrame(
  detector: any,
  video: HTMLVideoElement,
  timestamp: number,
  onLog: (msg: string) => void
): Promise<FrameResult> {
  const W = video.videoWidth || 640;
  const H = video.videoHeight || 480;
  const fc = document.createElement('canvas');
  fc.width = W; fc.height = H;
  fc.getContext('2d')!.drawImage(video, 0, 0, W, H);
  
  const rawPreds: any[] = await detector.detect(video);
  const vehicles: VehicleBox[] = rawPreds
    .filter((p: any) => VEHICLE_CLASSES.has(p.class) && p.score >= 0.25)
    .sort((a: any, b: any) => b.score - a.score);
    
  if (vehicles.length === 0) {
    onLog(`Frame @${timestamp.toFixed(1)}s — No vehicles detected.`);
    return { timestamp, vehicles, plateBbox: null, ocrAttempts: [], bestText: null, quality: 0 };
  }
  
  const v = vehicles[0]; // Process main vehicle
  const vc = cropAndScale(fc, v.bbox[0], v.bbox[1], v.bbox[2], v.bbox[3], 1);
  const localBbox = localizePlate(vc);
  
  if (!localBbox) {
    onLog(`Frame @${timestamp.toFixed(1)}s — Vehicle detected (${v.class}), but plate localization failed.`);
    return { timestamp, vehicles, plateBbox: null, ocrAttempts: [], bestText: null, quality: 0.1 };
  }
  
  const [lx, ly, lw, lh] = localBbox;
  const sx = v.bbox[0] + lx;
  const sy = v.bbox[1] + ly;
  const plateBbox: [number, number, number, number] = [sx, sy, lw, lh];
  
  const pc = cropAndScale(fc, sx, sy, lw, lh, 1);
  const variance = pixelVariance(pc);
  
  // Image Quality filter
  const ar = lw / lh;
  if (lw < 30 || lh < 8 || ar < 1.8 || ar > 6.0 || variance < 50) {
    onLog(`Frame @${timestamp.toFixed(1)}s — Crop rejected (size/aspect/variance): ${Math.round(lw)}x${Math.round(lh)} ar=${ar.toFixed(1)} var=${variance.toFixed(0)}`);
    return { timestamp, vehicles, plateBbox, ocrAttempts: [], bestText: null, quality: 0.2 };
  }
  
  // Perspective corner detection & warping
  const corners = findPlateCorners(pc);
  const warped = warpQuad(pc.getContext('2d')!, lw, lh, corners.p1, corners.p2, corners.p3, corners.p4, 800, 240);
  
  const qualityScore = 0.3 * v.score + 0.3 * Math.min(1, lw / 150) + 0.4 * Math.min(1, variance / 500);
  onLog(`Frame @${timestamp.toFixed(1)}s — Plate localized: ${Math.round(lw)}x${Math.round(lh)} | Quality: ${(qualityScore * 100).toFixed(0)}%`);
  
  return {
    timestamp, vehicles, plateBbox, ocrAttempts: [], bestText: null, quality: qualityScore,
    crop: { bbox: plateBbox, canvas: warped, qualityScore, width: lw, height: lh, variance }
  };
}

export async function runOcrOnCrop(
  fr: FrameResult,
  onLog: (msg: string) => void
): Promise<FrameResult> {
  if (!fr.crop) return fr;
  const warped = fr.crop.canvas;
  const attempts: OcrAttempt[] = [];
  
  const worker = await getTessWorker();
  
  for (const v of VARIANTS) {
    const vc = v.fn(warped);
    for (const psm of PSMS) {
      await worker.setParameters({ tessedit_pageseg_mode: psm as any });
      const { data } = await worker.recognize(vc);
      const text = data.text.trim().replace(/[^A-Z0-9]/g, '');
      if (text.length >= 4) {
        attempts.push({ text, confidence: data.confidence / 100, variant: v.name, psm });
      }
    }
  }
  
  const best = attempts.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  onLog(`OCR [Frame @${fr.timestamp.toFixed(1)}s] → "${best?.text ?? 'none'}" (${((best?.confidence ?? 0)*100).toFixed(0)}%) via ${best?.variant}/PSM${best?.psm}`);
  
  return {
    ...fr,
    ocrAttempts: attempts,
    bestText: best?.text ?? null,
    quality: fr.quality + (best ? best.confidence * 0.4 : 0) // Boost quality score with OCR success
  };
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function fuseTrackedFrames(frames: FrameResult[]): PipelineOutput {
  const log: string[] = [];
  const candidates = frames.flatMap(f => f.bestText ? [{ text: f.bestText, confidence: f.ocrAttempts.find(a=>a.text===f.bestText)?.confidence ?? 0 }] : []);
  
  log.push(`Fusion: ${candidates.length} OCR candidates extracted from ${frames.length} selected frames.`);
  
  if (candidates.length === 0) {
    log.push('No candidates — PLATE NOT VERIFIED');
    return { plate: 'PLATE NOT VERIFIED', confidence: 0, frameAgreement: 0, isPlateCertain: false, frames, debugLog: log };
  }
  
  // Align by string length and perform character-level voting
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const rep = sorted[0].text;
  const L = rep.length;
  
  const fusedChars: string[] = [];
  let totalAgreement = 0;
  
  for (let i = 0; i < L; i++) {
    const charVotes: Record<string, number> = {};
    let totalVotes = 0;
    
    for (const cand of candidates) {
      let char = '';
      if (cand.text.length === L) char = cand.text[i];
      else {
        const idx = i * (cand.text.length / L);
        char = cand.text[Math.floor(idx)] || '';
      }
      if (char) {
        charVotes[char] = (charVotes[char] || 0) + 1;
        totalVotes++;
      }
    }
    
    if (totalVotes === 0) {
      fusedChars.push(rep[i]);
      continue;
    }
    
    let winner = '', maxVotes = 0;
    for (const [char, votes] of Object.entries(charVotes)) {
      if (votes > maxVotes) { maxVotes = votes; winner = char; }
    }
    
    fusedChars.push(winner || rep[i]);
    totalAgreement += maxVotes / candidates.length;
  }
  
  const plate = fusedChars.join('');
  const charAgreement = totalAgreement / L;
  
  let agreeingFrames = 0;
  for (const cand of candidates) {
    if (editDistance(cand.text, plate) <= 2) agreeingFrames++;
  }
  const frameAgreement = agreeingFrames / candidates.length;
  
  // Comprehensive score integration
  const validFrames = frames.filter(f => f.crop);
  const vConf = validFrames.reduce((s, f) => s + (f.vehicles[0]?.score ?? 0), 0) / (validFrames.length || 1);
  const pConf = validFrames.length / (frames.length || 1);
  const ocrConf = candidates.reduce((s, c) => s + c.confidence, 0) / (candidates.length || 1);
  const imgQual = validFrames.reduce((s, f) => s + (f.crop ? Math.min(1, f.crop.variance / 500) : 0), 0) / (validFrames.length || 1);
  
  const finalConf = (vConf + pConf + ocrConf + frameAgreement + charAgreement + imgQual) / 6;
  
  log.push(`Fused Plate: "${plate}" | vConf:${(vConf*100).toFixed(0)}% pConf:${(pConf*100).toFixed(0)}% ocr:${(ocrConf*100).toFixed(0)}% fAgree:${(frameAgreement*100).toFixed(0)}% cAgree:${(charAgreement*100).toFixed(0)}% img:${(imgQual*100).toFixed(0)}%`);
  log.push(`Final Confidence: ${(finalConf * 100).toFixed(0)}%`);
  
  const isPlateCertain = finalConf >= 0.50 && charAgreement >= 0.50;
  const finalPlate = isPlateCertain ? plate : 'PLATE NOT VERIFIED';
  
  if (!isPlateCertain) {
    log.push('Validation Failed: Confidence or character agreement too low.');
  }
  
  return {
    plate: finalPlate,
    confidence: finalConf,
    frameAgreement,
    isPlateCertain,
    frames,
    debugLog: log,
  };
}
