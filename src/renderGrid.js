// Renders a parsed puzzle grid to a monochrome PNG buffer sized for a
// thermal receipt printer (80mm ≈ 576 printable dots at 203 dpi).

const { PNG } = require('pngjs');

// 5x7 bitmap font for cell labels.
const DIGITS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11111', '00010', '00100', '00110', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const MAX_WIDTH = 560; // dots, leaves a little margin on 576-dot paper
const LINE = 2; // grid line thickness in px
const FONT_SCALE = 2; // 5x7 font -> 10x14 px labels

// Overlay art shares NYT's SVG coordinate space: a 3-unit frame, then one
// 55-unit box per cell. Walls are opaque black; the arrows are that same black
// at roughly a third alpha, which is why they read as pink on screen. Averaging
// alpha over each destination pixel's source box keeps walls, arrows and
// antialiased edges alike, with no separate colour path.
// Shaded squares have to survive a 1-bit printer, so they become a dot screen
// rather than grey. The screen is aligned to the image instead of the cell, so
// a run of shaded squares reads as one continuous field.
const SHADE_PITCH = 2; // one dot per 2x2 px, ~25% coverage

const SVG_FRAME = 3;
const SVG_CELL = 55;
const OVERLAY_INK = 0.22; // averaged coverage that counts as ink

/**
 * @param {ReturnType<require('./parseNYT')>} puzzle
 * @param {Buffer} [overlay] PNG overlay art, as fetched from puzzle.overlayUrl
 * @returns {Buffer} PNG buffer
 */
function renderGrid(puzzle, overlay) {
  const { width: cols, height: rows, cells } = puzzle;

  const cell = Math.floor((MAX_WIDTH - LINE) / cols);
  const imgW = cols * cell + LINE;
  const imgH = rows * cell + LINE;

  const png = new PNG({ width: imgW, height: imgH });
  png.data.fill(255); // white

  const setBlack = (x, y) => {
    if (x < 0 || y < 0 || x >= imgW || y >= imgH) return;
    const i = (y * imgW + x) * 4;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  };

  const fillRect = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) setBlack(x + dx, y + dy);
    }
  };

  const fillWhite = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (x + dx >= imgW || y + dy >= imgH) continue;
        const i = ((y + dy) * imgW + (x + dx)) * 4;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 255;
      }
    }
  };

  const drawLabel = (text, x, y) => {
    // White backing so labels stay readable on top of circles.
    const pad = 2;
    const w = text.length * 6 * FONT_SCALE - FONT_SCALE;
    fillWhite(x - pad, y - pad, w + pad * 2, 7 * FONT_SCALE + pad * 2);
    let cursor = x;
    for (const ch of text) {
      const glyph = DIGITS[ch];
      if (!glyph) continue;
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] === '1') {
            fillRect(cursor + gx * FONT_SCALE, y + gy * FONT_SCALE, FONT_SCALE, FONT_SCALE);
          }
        }
      }
      cursor += 6 * FONT_SCALE; // glyph width + 1px gap, scaled
    }
  };

  const drawShade = (x, y, size) => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if ((x + dx) % SHADE_PITCH === 0 && (y + dy) % SHADE_PITCH === 0) {
          setBlack(x + dx, y + dy);
        }
      }
    }
  };

  const drawCircle = (x, y, size) => {
    const c = (size - 1) / 2;
    const r = size / 2 - 1.5;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const dist = Math.sqrt((dx - c) ** 2 + (dy - c) ** 2);
        if (dist <= r && dist >= r - LINE) setBlack(x + dx, y + dy);
      }
    }
  };

  // Grid lines
  for (let c = 0; c <= cols; c++) fillRect(c * cell, 0, LINE, imgH);
  for (let r = 0; r <= rows; r++) fillRect(0, r * cell, imgW, LINE);

  // Cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const data = cells[r * cols + c];
      const x = c * cell + LINE;
      const y = r * cell + LINE;
      if (data.blocked) {
        fillRect(x, y, cell - LINE, cell - LINE);
        continue;
      }
      if (data.shaded) drawShade(x, y, cell - LINE);
      if (data.circled) drawCircle(x, y, cell - LINE);
      if (data.label) drawLabel(data.label, x + 4, y + 4);
    }
  }

  if (overlay) drawOverlay(overlay, { cols, rows, cell, imgW, imgH, setBlack });

  return PNG.sync.write(png);
}

function drawOverlay(overlay, { cols, rows, cell, imgW, imgH, setBlack }) {
  // Anything but a PNG (afterSolve art is often a GIF) we simply skip.
  if (overlay.length < 8 || overlay.slice(1, 4).toString() !== 'PNG') return;

  let art;
  try {
    art = PNG.sync.read(overlay);
  } catch {
    return; // decoration is never worth failing a print over
  }

  // Map destination pixels onto the art. Gridline centres sit at LINE/2, which
  // is where the SVG frame ends and cell zero begins. Each axis gets its own
  // scale so a non-square themed grid still lines up.
  const axis = (extent, count) => {
    const scale = extent / (SVG_FRAME * 2 + count * SVG_CELL);
    return (d) => (SVG_FRAME + ((d - LINE / 2) * SVG_CELL) / cell) * scale;
  };
  const toSourceX = axis(art.width, cols);
  const toSourceY = axis(art.height, rows);

  for (let y = 0; y < imgH; y++) {
    const sy0 = Math.floor(toSourceY(y - 0.5));
    const sy1 = Math.max(Math.ceil(toSourceY(y + 0.5)), sy0 + 1);
    for (let x = 0; x < imgW; x++) {
      const sx0 = Math.floor(toSourceX(x - 0.5));
      const sx1 = Math.max(Math.ceil(toSourceX(x + 0.5)), sx0 + 1);

      let alpha = 0;
      let samples = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        if (sy < 0 || sy >= art.height) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          if (sx < 0 || sx >= art.width) continue;
          alpha += art.data[(sy * art.width + sx) * 4 + 3];
          samples++;
        }
      }
      if (samples && alpha / samples / 255 >= OVERLAY_INK) setBlack(x, y);
    }
  }
}

module.exports = renderGrid;
