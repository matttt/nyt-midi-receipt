# NYT Midi → Receipt Printer

Fetches the daily [NYT Midi crossword](https://www.nytimes.com/crosswords/game/midi)
and prints it — grid image, clues, and all — to a network thermal receipt printer.

<img width="689" height="1140" alt="0FFD1D12-F7DF-4768-A9AC-1A5EEB28DE59_1_105_c" src="https://github.com/user-attachments/assets/f4c0980e-faa2-4b41-80f8-6961fd738f53" />


https://github.com/user-attachments/assets/2f1d7a78-71fb-4a26-924f-f4fb30431f2a


## Quick start (prebuilt image)

A prebuilt image is published to GitHub Container Registry:

```sh
docker run -d --name nyt-midi-receipt \
  -p 6434:6434 \
  -e PRINTER_HOST=192.168.10.11 \
  ghcr.io/matttt/nytmidireceipt:latest
```

Set `PRINTER_HOST` to your printer's IP, then hit `http://localhost:6434/print`.
See [Config](#config-env-vars) for the other env vars. 

Or, as an entry to your docker-compose.yml: 

```
services:
  nyt-midi-receipt:
    image: ghcr.io/matttt/nytmidireceipt:latest
    container_name: nyt-midi-receipt
    restart: unless-stopped
    ports:
      - "6434:6434"
    environment:
      PRINTER_HOST: 192.168.10.11
      RECEIPT_WIDTH: 48
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
| `PORT` | `6434` | HTTP server port |

## How it works

- [fetchMidi.js](fetchMidi.js) — grabs `midi.json` from NYT's v6 puzzle API. The
  `x-games-auth-bypass: true` header is all it needs; no login or cookies.
- [parseNYT.js](parseNYT.js) — flattens the puzzle JSON into grid cells + labeled clues.
- [renderGrid.js](renderGrid.js) — draws the grid as a PNG (pngjs, hand-rolled 5x7
  digit font) sized for 80mm / 576-dot paper, with cells big enough to write in.
- [app.js](app.js) — HTTP server; talks to the printer with
  [node-thermal-printer](https://github.com/Klemen1337/node-thermal-printer).

`sampleMidi.json` is a captured API response for offline tinkering, and
Shoutout to @anyu and their `nyt-mini-bot` - it helped a lot to have another working example (https://github.com/anyu/nyt-mini-bot)
