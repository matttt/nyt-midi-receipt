// Parses an NYT crossword puzzle payload (v6 puzzle JSON: midi, mini, etc.)
// into a flat structure that's easy to render.

/**
 * @param {object} data raw puzzle JSON (as returned by fetchMidi)
 * @returns {{
 *   title: string, date: string, constructors: string[],
 *   width: number, height: number,
 *   cells: {blocked: boolean, label: string|null, answer: string|null}[],
 *   clues: {across: Clue[], down: Clue[]}
 * }}
 * where Clue = {label: string, text: string, answer: string}
 */
function parse(data) {
  const board = data.body[0];
  const { width, height } = board.dimensions;

  // Blocked (black) squares come through as empty objects. type 2 = circled.
  const cells = board.cells.map((cell) => ({
    blocked: cell.answer === undefined,
    circled: cell.type === 2,
    label: cell.label || null,
    answer: cell.answer || null,
  }));

  const clues = { across: [], down: [] };
  for (const clue of board.clues) {
    clues[clue.direction.toLowerCase()].push({
      label: clue.label,
      text: clue.text[0].plain,
      answer: clue.cells.map((i) => board.cells[i].answer).join(''),
    });
  }

  return {
    title: data.title,
    date: data.publicationDate,
    constructors: data.constructors || [],
    width,
    height,
    cells,
    clues,
  };
}

module.exports = parse;
