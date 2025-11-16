# Cloudflare Music Helper Worker

A small Cloudflare Worker that helps with songwriting by:

- Suggesting **chord progressions** given a key and scale
- Generating simple **melodies** that fit a chosen chord progression

## Endpoints

### `GET /api/progressions`

Query params:

- `key`: musical key root, e.g. `C`, `G`, `Bb` (default: `C`)
- `scale`: `major` or `minor` (default: `major`)

Example:

```bash
curl "http://localhost:8787/api/progressions?key=C&scale=major"
```

### `POST /api/melody`

JSON body:

```json
{
  "key": "C",
  "scale": "major",
  "progression": ["C", "G", "Am", "F"]
}
```

Example:

```bash
curl -X POST "http://localhost:8787/api/melody" \
  -H "content-type: application/json" \
  -d '{"key":"C","scale":"major","progression":["C","G","Am","F"]}'
```

Returns a list of melody notes:

```json
{
  "key": "C",
  "scaleType": "major",
  "progression": ["C", "G", "Am", "F"],
  "melody": [
    { "note": "E4", "duration": 1, "beat": 0 },
    { "note": "G4", "duration": 1, "beat": 1 }
  ]
}
```

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npx wrangler dev
```

Deploy:

```bash
npx wrangler deploy
```
