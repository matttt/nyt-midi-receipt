// Fetches the NYT Midi crossword puzzle JSON.
// The `x-games-auth-bypass` header is all the endpoint needs — no login/cookies.

const BASE_URL = 'https://www.nytimes.com/svc/crosswords/v6/puzzle/midi';

const HEADERS = {
  accept: '*/*',
  'x-games-auth-bypass': 'true',
  referer: 'https://www.nytimes.com/crosswords/game/midi',
};

/**
 * @param {string} [date] optional YYYY-MM-DD; defaults to today's puzzle
 * @returns {Promise<object>} the raw midi.json payload
 */
async function fetchMidi(date) {
  const url = date ? `${BASE_URL}/${date}.json` : `${BASE_URL}.json`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`NYT responded ${res.status} for ${url}`);
  }
  return res.json();
}

module.exports = fetchMidi;
