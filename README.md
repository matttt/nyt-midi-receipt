# NYT Midi → Receipt Printer

Fetches the day's [NYT Midi crossword](https://www.nytimes.com/crosswords/game/midi)
and prints it — grid image, clues, and all — to a network thermal receipt printer.

## Run

```sh
npm install
npm start
```

Then:

| Endpoint | What it does |
| --- | --- |
| `GET /print` | Print today's puzzle |
| `GET /print?date=2026-07-16` | Print a specific day's puzzle |
| `GET /print?answers=1` | Also print the answer key |
| `GET /preview` | Text preview, no paper used |
| `GET /grid.png` | Rendered grid image, for a browser sanity check |

## Deploy (Docker)

```sh
docker compose up -d --build
```

Printer IP and paper width are set in [docker-compose.yml](docker-compose.yml)
(`PRINTER_HOST` / `RECEIPT_WIDTH`). The compose file builds the image on the
host it runs on, so architecture (x86 vs ARM) doesn't matter.

## Config (env vars)

| Var | Default | |
| --- | --- | --- |
| `PRINTER_HOST` | `192.168.10.11` | Printer IP (raw TCP port 9100) |
| `RECEIPT_WIDTH` | `48` | Characters per line (48 for 80mm paper) |
| `PORT` | `3000` | HTTP server port |

## How it works

- [fetchMidi.js](fetchMidi.js) — grabs `midi.json` from NYT's v6 puzzle API. The
  `x-games-auth-bypass: true` header is all it needs; no login or cookies.
- [parseNYT.js](parseNYT.js) — flattens the puzzle JSON into grid cells + labeled clues.
- [renderGrid.js](renderGrid.js) — draws the grid as a PNG (pngjs, hand-rolled 5x7
  digit font) sized for 80mm / 576-dot paper, with cells big enough to write in.
- [app.js](app.js) — HTTP server; talks to the printer with
  [node-thermal-printer](https://github.com/Klemen1337/node-thermal-printer).

`sampleMidi.json` is a captured API response for offline tinkering, and
`nyt-mini-bot-main (reference)` is the puppeteer-based project this was inspired by.
