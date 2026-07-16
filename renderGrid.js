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

/**
 * @param {ReturnType<require('./parseNYT')>} puzzle
 * @returns {Buffer} PNG buffer
 */
function renderGrid(puzzle) {
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
      if (data.circled) drawCircle(x, y, cell - LINE);
      if (data.label) drawLabel(data.label, x + 4, y + 4);
    }
  }

  return PNG.sync.write(png);
}

module.exports = renderGrid;
