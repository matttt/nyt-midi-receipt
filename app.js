// NYT Midi -> receipt printer.
//
//   GET /print               fetch today's midi and print it
//   GET /print?date=YYYY-MM-DD    print a specific day's puzzle
//   GET /print?answers=1     also print the answer key
//   GET /preview             text preview of what would print (no paper used)
//   GET /grid.png            the rendered grid image (for a browser sanity check)

const http = require('http');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const fetchMidi = require('./fetchMidi');
const parse = require('./parseNYT');
const renderGrid = require('./renderGrid');

const PORT = process.env.PORT || 6434;
const PRINTER_HOST = process.env.PRINTER_HOST || '192.168.10.11';
const RECEIPT_WIDTH = parseInt(process.env.RECEIPT_WIDTH || '48', 10); // chars per line, 48 for 80mm

function makePrinter() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${PRINTER_HOST}`,
    width: RECEIPT_WIDTH,
    characterSet: CharacterSet.PC437_USA,
  });
}

// The CP437 charset chokes on fancy punctuation NYT clues love.
function sanitize(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

// Word-wrap with a hanging indent so wrapped clue lines align under the text.
function wrap(text, width, indent) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const prefix = lines.length === 0 ? '' : ' '.repeat(indent);
    if (line && (prefix + line + ' ' + word).length > width) {
      lines.push((lines.length === 0 ? '' : ' '.repeat(indent)) + line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  lines.push((lines.length === 0 ? '' : ' '.repeat(indent)) + line);
  return lines;
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function clueLines(puzzle) {
  const lines = [];
  for (const dir of ['across', 'down']) {
    lines.push({ bold: true, text: dir.toUpperCase() });
    for (const clue of puzzle.clues[dir]) {
      const head = `${clue.label}. `;
      for (const l of wrap(head + sanitize(clue.text), RECEIPT_WIDTH, head.length)) {
        lines.push({ text: l });
      }
    }
    lines.push({ text: '' });
  }
  return lines;
}

function answerLines(puzzle) {
  const lines = [{ bold: true, text: 'ANSWERS' }];
  for (const dir of ['across', 'down']) {
    const suffix = dir === 'across' ? 'A' : 'D';
    for (const clue of puzzle.clues[dir]) {
      lines.push({ text: `${clue.label}${suffix} ${clue.answer}` });
    }
  }
  return lines;
}

async function printPuzzle(puzzle, { answers = false } = {}) {
  const printer = makePrinter();

  if (!(await printer.isPrinterConnected())) {
    throw new Error(`printer at ${PRINTER_HOST} is not reachable`);
  }

  printer.alignCenter();
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println('NYT MIDI');
  printer.setTextNormal();
  printer.println(sanitize(puzzle.title));
  printer.bold(false);
  printer.println(formatDate(puzzle.date));
  if (puzzle.constructors.length) {
    printer.println(`By ${sanitize(puzzle.constructors.join(', '))}`);
  }
  printer.newLine();

  await printer.printImageBuffer(renderGrid(puzzle));
  printer.newLine();

  printer.alignLeft();
  const lines = clueLines(puzzle).concat(answers ? answerLines(puzzle) : []);
  for (const line of lines) {
    printer.bold(!!line.bold);
    printer.println(line.text);
  }
  printer.bold(false);

  printer.cut();
  await printer.execute();
}

function previewText(puzzle, { answers = false } = {}) {
  const header = [
    'NYT MIDI',
    puzzle.title,
    formatDate(puzzle.date),
    puzzle.constructors.length ? `By ${puzzle.constructors.join(', ')}` : '',
    `[${puzzle.width}x${puzzle.height} grid image]`,
    '',
  ];
  const body = clueLines(puzzle).concat(answers ? answerLines(puzzle) : []);
  return header.concat(body.map((l) => l.text)).join('\n');
}

async function getPuzzle(query) {
  const date = query.get('date') || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('date must be YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  return parse(await fetchMidi(date));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const answers = url.searchParams.get('answers') === '1';

  try {
    switch (url.pathname) {
      case '/': {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(
          'NYT Midi receipt printer\n\n' +
            'GET /print               print today\'s puzzle\n' +
            'GET /print?date=YYYY-MM-DD\n' +
            'GET /print?answers=1     include answer key\n' +
            'GET /preview             text preview, no printing\n' +
            'GET /grid.png            rendered grid image\n'
        );
        return;
      }
      case '/print': {
        const puzzle = await getPuzzle(url.searchParams);
        await printPuzzle(puzzle, { answers });
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(`Printed "${puzzle.title}" (${puzzle.date}) to ${PRINTER_HOST}\n`);
        return;
      }
      case '/preview': {
        const puzzle = await getPuzzle(url.searchParams);
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(previewText(puzzle, { answers }) + '\n');
        return;
      }
      case '/grid.png': {
        const puzzle = await getPuzzle(url.searchParams);
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(renderGrid(puzzle));
        return;
      }
      default: {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found\n');
      }
    }
  } catch (err) {
    console.error(err);
    res.writeHead(err.status || 502, { 'content-type': 'text/plain' });
    res.end(`Error: ${err.message}\n`);
  }
});

server.listen(PORT, () => {
  console.log(`NYT Midi receipt server on http://localhost:${PORT}`);
  console.log(`Printer: ${PRINTER_HOST}`);
});
