import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Your base artwork. Put the design (logo, background, "PASS" layout) here.
// Recommended size: 1080 x 1080 (square works well on WhatsApp).
const BASE_IMAGE = path.join(ROOT, 'assets', 'pass.png');

// Where generated images are written. This folder is served publicly by Express.
const OUT_DIR = path.join(ROOT, 'public', 'generated');

// Register the bundled fonts by family name (Skia renders text directly — no
// system-font install needed, identical output on your PC and any server).
GlobalFonts.registerFromPath(path.join(ROOT, 'assets', 'fonts', 'Montserrat-Bold.ttf'), 'Montserrat Bold');
GlobalFonts.registerFromPath(path.join(ROOT, 'assets', 'fonts', 'Poppins-Medium.ttf'), 'Poppins Medium');

// --- Typography ---------------------------------------------------------
// Sizes are given in points (pt) and converted to pixels relative to the card
// width: on a 1080px-wide card, 1pt = 3px (24pt ≈ 72px, 12pt ≈ 36px). If your
// real artwork is a very different size, change PT_DIVISOR (smaller = bigger).
const PT_DIVISOR = 360;
const pxFromPt = (pt, W) => (pt * W) / PT_DIVISOR;

// Placed in the navy E-PASS band — light text on dark background.
// Name:     Montserrat Bold, white
// District: Poppins Medium, gold
// yFrac = vertical position as a fraction of card height (0 = top, 1 = bottom).
const NAME = { family: 'Montserrat Bold', min: 14, max: 19, fill: '#ffffff', yFrac: 0.81 };
const DIST = { family: 'Poppins Medium', min: 10, max: 13, fill: '#facc15', yFrac: 0.865 };

// Text width limit (the navy band is wide, with small side margins).
const MAX_TEXT_WIDTH_FRAC = 0.82;

// Largest pt in [min,max] whose rendered width fits maxWidthPx (measured exactly).
function fitPt({ ctx, family, text, min, max, W, maxWidthPx }) {
  for (let pt = max; pt > min; pt--) {
    ctx.font = `${pxFromPt(pt, W)}px "${family}"`;
    if (ctx.measureText(text).width <= maxWidthPx) return pt;
  }
  return min;
}

function drawCenteredLine({ ctx, cfg, text, W, H }) {
  const pt = fitPt({ ctx, family: cfg.family, text, min: cfg.min, max: cfg.max, W, maxWidthPx: W * MAX_TEXT_WIDTH_FRAC });
  ctx.font = `${pxFromPt(pt, W)}px "${cfg.family}"`;
  ctx.fillStyle = cfg.fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, W / 2, H * cfg.yFrac);
}

/**
 * Draws `name` (Montserrat Bold) and `district` (Poppins Medium) onto the base
 * image and writes a PNG. Returns the public path, e.g. "/generated/abc123.png".
 */
export async function generatePassImage({ id, name, district }) {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const base = await loadImage(await fs.readFile(BASE_IMAGE));
  const W = base.width || 1080;
  const H = base.height || 1080;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0, W, H);

  drawCenteredLine({ ctx, cfg: NAME, text: name, W, H });
  drawCenteredLine({ ctx, cfg: DIST, text: district, W, H });

  const outFile = path.join(OUT_DIR, `${id}.png`);
  await fs.writeFile(outFile, canvas.toBuffer('image/png'));

  return `/generated/${id}.png`;
}
