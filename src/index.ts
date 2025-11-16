// src/index.ts

// Chromatic scale (using sharps; we'll normalize inputs)
const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Simple enharmonic mapping for user input with flats
const ENHARMONIC_MAP: Record<string, string> = {
  "Db": "C#",
  "Eb": "D#",
  "Gb": "F#",
  "Ab": "G#",
  "Bb": "A#"
};

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NAT_MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];

type ScaleType = "major" | "minor";

type Chord = {
  degree: number;  // 1–7
  name: string;    // e.g. "C", "Dm", "G7" (we keep it simple here)
  notes: string[]; // e.g. ["C4", "E4", "G4"]
};

type MelodyNote = {
  note: string;    // "E4"
  duration: number; // in beats (e.g. 0.5, 1, 2)
  beat: number;    // absolute beat position in the progression
  tab: TabPosition;
};

type TabPosition = {
  stringNumber: number; // 1 = high E, 6 = low E
  fret: number;
  label: string;
};

function normalizeKey(key: string): string {
  key = key.trim();
  const k = key.charAt(0).toUpperCase() + key.slice(1);
  if (ENHARMONIC_MAP[k]) return ENHARMONIC_MAP[k];
  return k;
}

function getNoteIndex(note: string): number {
  const idx = CHROMATIC.indexOf(note);
  if (idx === -1) {
    throw new Error(`Unsupported note: ${note}`);
  }
  return idx;
}

function buildScale(root: string, scaleType: ScaleType): string[] {
  const steps = scaleType === "major" ? MAJOR_SCALE_STEPS : NAT_MINOR_SCALE_STEPS;
  const rootIndex = getNoteIndex(root);
  return steps.map(step => CHROMATIC[(rootIndex + step) % 12]);
}

// Very simple triad builder (no 7ths/9ths yet)
function buildChordTriad(scale: string[], degree: number, octave = 4): Chord {
  // degree: 1–7
  const i = degree - 1;
  const root = scale[i];
  const third = scale[(i + 2) % 7];
  const fifth = scale[(i + 4) % 7];

  // Determine chord quality by scale type & degree (very basic)
  // Major key: I ii iii IV V vi vii°
  const qualityMapMajor = ["", "m", "m", "", "", "m", "dim"];
  // Minor key (natural): i ii° III iv v VI VII
  const qualityMapMinor = ["m", "dim", "", "m", "m", "", ""];

  // Infer major vs minor from scale intervals (quick hack)
  const rootIdx = getNoteIndex(scale[0]);
  const thirdIdx = getNoteIndex(scale[2]);
  const isMajorScale = (thirdIdx - rootIdx + 12) % 12 === 4;

  const quality = isMajorScale ? qualityMapMajor[i] : qualityMapMinor[i];

  let name = root;
  if (quality === "m") name += "m";
  else if (quality === "dim") name += "°";

  return {
    degree,
    name,
    notes: [root, third, fifth].map(n => `${n}${octave}`)
  };
}

// Progression patterns

type ProgressionPattern = {
  name: string;
  degrees: number[];
};

const COMMON_PROGRESSIONS: ProgressionPattern[] = [
  { name: "Pop I–V–vi–IV", degrees: [1, 5, 6, 4] },
  { name: "Pop vi–IV–I–V", degrees: [6, 4, 1, 5] },
  { name: "Classic I–vi–IV–V", degrees: [1, 6, 4, 5] },
  { name: "ii–V–I (Jazz-ish cadence)", degrees: [2, 5, 1] },
  { name: "I–IV–V–IV (Rock)", degrees: [1, 4, 5, 4] }
];

function shiftNote(root: string, semitones: number): string {
  const idx = getNoteIndex(root);
  const offset = ((semitones % 12) + 12) % 12;
  return CHROMATIC[(idx + offset) % 12];
}

function generateChordProgressions(key: string, scaleType: ScaleType, capo = 0) {
  const normalizedKey = normalizeKey(key);
  const capoKey = shiftNote(normalizedKey, capo);
  const scale = buildScale(capoKey, scaleType);

  const progressions = COMMON_PROGRESSIONS.map(pattern => {
    const chords = pattern.degrees.map(deg => buildChordTriad(scale, deg));
    return {
      label: pattern.name,
      degrees: pattern.degrees,
      chords: chords.map(c => ({
        degree: c.degree,
        name: c.name,
        notes: c.notes
      }))
    };
  });

  return {
    key: normalizedKey,
    capo,
    capoKey,
    scaleType,
    scale,
    progressions
  };
}

// Melody generation
// 1 bar of 4 beats per chord, quarter-note grid

function noteNameToSemitone(note: string): number {
  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note format: ${note}`);
  const [, pitch, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  return octave * 12 + getNoteIndex(pitch);
}

const STANDARD_TUNING = ["E2", "A2", "D3", "G3", "B3", "E4"]; // strings 6 -> 1

function convertNoteToTab(note: string): TabPosition {
  const targetSemitone = noteNameToSemitone(note);

  const positions = STANDARD_TUNING.map((open, idx) => {
    const openSemitone = noteNameToSemitone(open);
    return {
      stringNumber: 6 - idx, // reverse so idx 0 -> string 6
      fret: targetSemitone - openSemitone
    };
  }).filter(pos => pos.fret >= 0);

  const best = positions.reduce((acc, cur) => {
    if (!acc) return cur;
    if (cur.fret < acc.fret) return cur;
    if (cur.fret === acc.fret && cur.stringNumber < acc.stringNumber) return cur;
    return acc;
  }, null as (typeof positions)[number] | null);

  if (!best) {
    return { stringNumber: 0, fret: -1, label: "(out of range)" };
  }

  return {
    ...best,
    label: `String ${best.stringNumber}, fret ${best.fret}`
  };
}

function generateMelodyForProgression(
  key: string,
  scaleType: ScaleType,
  chordNames: string[]
): MelodyNote[] {
  const normalizedKey = normalizeKey(key);
  const scale = buildScale(normalizedKey, scaleType);

  function getChordForName(name: string): Chord {
    // Strip "m" or "°" for lookup
    const rootRaw = name.replace(/[m°]/g, "");
    const deg = scale.findIndex(n => n === rootRaw);
    if (deg === -1) {
      // fallback: I chord
      return buildChordTriad(scale, 1);
    }
    return buildChordTriad(scale, deg + 1);
  }

  const melodyOctaves = [4, 5];

  function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const notes: MelodyNote[] = [];
  let currentBeat = 0;

  chordNames.forEach(chordName => {
    const chord = getChordForName(chordName);

    for (let beatInBar = 0; beatInBar < 4; beatInBar++) {
      const useChordTone = Math.random() < 0.7; // 70% chord tones
      let pitch: string;

      if (useChordTone) {
        const base = pickRandom(chord.notes).slice(0, -1); // strip octave
        const octave = pickRandom(melodyOctaves);
        pitch = `${base}${octave}`;
      } else {
        const base = pickRandom(scale);
        const octave = pickRandom(melodyOctaves);
        pitch = `${base}${octave}`;
      }

      const duration = 1; // quarter notes for now
      const tab = convertNoteToTab(pitch);
      notes.push({
        note: pitch,
        duration,
        beat: currentBeat,
        tab
      });

      currentBeat += duration;
    }
  });

  return notes;
}

// Utility: JSON response

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*" // so a local frontend can call it
    }
  });
}

function renderHomePage(): Response {
  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Music Explorer</title>
    <style>
      :root {
        --bg: #0b1021;
        --card: #101735;
        --accent: #7b6cff;
        --text: #f8fbff;
        --muted: #b7c4e4;
        --border: #2a335a;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        font-family: "Inter", system-ui, -apple-system, sans-serif;
        background: radial-gradient(circle at 20% 20%, #16224d, #0b1021 40%),
                    radial-gradient(circle at 80% 0%, #271e5a, transparent 35%),
                    var(--bg);
        color: var(--text);
        min-height: 100vh;
      }

      header {
        padding: 48px 24px 16px;
        max-width: 1200px;
        margin: 0 auto;
      }

      h1 { margin: 0 0 12px; font-size: 36px; letter-spacing: -0.02em; }
      p.lead { margin: 0; color: var(--muted); font-size: 17px; max-width: 720px; }

      main { max-width: 1200px; margin: 0 auto; padding: 0 24px 64px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      }

      .card h2 { margin: 0 0 10px; font-size: 20px; }
      .card p { margin: 0 0 16px; color: var(--muted); }

      label { display: block; margin-bottom: 6px; font-weight: 600; }
      input, select, button, textarea {
        font: inherit;
      }

      input, select, textarea {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #0d132a;
        color: var(--text);
        margin-bottom: 12px;
      }

      button {
        background: linear-gradient(135deg, #9c7bff, #5c6cff);
        color: white;
        border: none;
        padding: 12px 16px;
        border-radius: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
        box-shadow: 0 10px 30px rgba(124, 111, 255, 0.35);
      }
      button:hover { transform: translateY(-1px); box-shadow: 0 12px 40px rgba(124, 111, 255, 0.45); }
      button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

      .results { margin-top: 12px; }
      .progression-item, .melody-item {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
        background: rgba(255, 255, 255, 0.02);
      }
      .progression-item { cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
      .progression-item:hover { border-color: #4f5fa3; background: rgba(124, 111, 255, 0.05); }
      .progression-item h3 { margin: 0 0 6px; font-size: 16px; }
      .muted { color: var(--muted); }
      code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 6px; }

      .tab-section {
        margin-top: 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.02);
      }
      .tab-section h3 {
        margin: 0 0 10px;
        font-size: 15px;
        letter-spacing: 0.01em;
      }

      .fretboard {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        background: linear-gradient(135deg, rgba(124, 111, 255, 0.06), rgba(255, 255, 255, 0));
      }
      .fret-labels {
        display: grid;
        gap: 4px;
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 8px;
        opacity: 0.8;
      }
      .string-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .string-row:last-child { margin-bottom: 0; }
      .string-name {
        width: 70px;
        text-align: right;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.02em;
      }
      .string-line {
        position: relative;
        flex: 1;
        height: 30px;
        border-top: 2px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        background: repeating-linear-gradient(
          to right,
          transparent 0,
          transparent calc((100% / var(--fret-count)) - 1px),
          rgba(255, 255, 255, 0.05) calc((100% / var(--fret-count)) - 1px),
          rgba(255, 255, 255, 0.05) calc(100% / var(--fret-count))
        );
      }
      .fret-marker {
        position: absolute;
        top: -9px;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      .marker-order {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #f5f0ff, #9c7bff);
        color: #0b1021;
        font-weight: 800;
        font-size: 12px;
        box-shadow: 0 0 0 2px rgba(123, 108, 255, 0.35);
      }
      .marker-note {
        font-size: 12px;
        color: var(--text);
        padding: 4px 8px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid var(--border);
      }
      .tab-legend {
        margin: 10px 0 0;
        padding-left: 18px;
        color: var(--text);
      }
      .tab-legend li { margin-bottom: 6px; }
      .tab-legend .muted { color: var(--muted); }

      .api-hint {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px dashed var(--border);
        background: rgba(255, 255, 255, 0.02);
        color: var(--muted);
        font-size: 14px;
      }

      @media (max-width: 640px) {
        h1 { font-size: 28px; }
        header { padding-top: 32px; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Music Explorer</h1>
      <p class="lead">Generate chord progressions and quick melodies powered by the Music Helper worker. Tweak the key, choose a scale, and listen for inspiration.</p>
    </header>

    <main class="grid">
      <section class="card">
        <h2>Chord Progressions</h2>
        <p>Pick a key and scale to discover common progressions with built-in triads.</p>
        <form id="progression-form">
          <label for="progression-key">Key</label>
          <input id="progression-key" name="key" value="C" placeholder="C, G, Bb" />

          <label for="progression-scale">Scale</label>
          <select id="progression-scale" name="scale">
            <option value="major" selected>Major</option>
            <option value="minor">Minor</option>
          </select>

          <label for="progression-capo">Capo (semitones)</label>
          <input id="progression-capo" name="capo" type="number" min="0" max="11" value="0" />

          <button type="submit">Get Progressions</button>
        </form>
        <div id="progression-results" class="results muted">Results will appear here.</div>
      </section>

      <section class="card">
        <h2>Melody Generator</h2>
        <p>Send any chord list to get a simple melody that sits on top.</p>
        <form id="melody-form">
          <label for="melody-key">Key</label>
          <input id="melody-key" name="key" value="C" />

          <label for="melody-scale">Scale</label>
          <select id="melody-scale" name="scale">
            <option value="major" selected>Major</option>
            <option value="minor">Minor</option>
          </select>

          <label for="melody-progression">Progression (comma separated)</label>
          <input id="melody-progression" name="progression" value="C,G,Am,F" />

          <button type="submit">Generate Melody</button>
        </form>
        <div class="muted" style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" data-progression="C,G,Am,F" class="progression-fill">Pop I–V–vi–IV</button>
          <button type="button" data-progression="Am,F,C,G" class="progression-fill">vi–IV–I–V</button>
          <button type="button" data-progression="Dm,G,C,F" class="progression-fill">ii–V–I–IV</button>
        </div>
        <div id="melody-results" class="results muted">Melody notes will appear here.</div>
      </section>

      <section class="card">
        <h2>Guitar Fretboard</h2>
        <p class="muted">Visualize where each melody note sits on the neck.</p>
        <div id="fretboard-area" class="results muted">Play a melody to see fret positions.</div>
      </section>

      <section class="card" style="grid-column: 1 / -1;">
        <h2>API quick reference</h2>
        <p class="muted">Prefer JSON? You can still call the worker directly.</p>
        <div class="api-hint">
          <div>
            <div><strong>Progressions:</strong> <code>/api/progressions?key=C&scale=major</code></div>
            <div><strong>Melody:</strong> POST <code>/api/melody</code> with <code>{"key":"C","scale":"major","progression":["C","G","Am","F"]}</code></div>
            <div style="margin-top: 6px;"><strong>Extras:</strong> Add <code>&capo=2</code> to transpose progressions; melodies now include guitar tab positions.</div>
          </div>
        </div>
      </section>
    </main>

    <script>
      const progressionForm = document.getElementById('progression-form');
      const melodyForm = document.getElementById('melody-form');
      const progressionResults = document.getElementById('progression-results');
      const melodyResults = document.getElementById('melody-results');
      const fretboardArea = document.getElementById('fretboard-area');
      const progressionCapoInput = document.getElementById('progression-capo');

      const setLoading = (el, isLoading) => {
        if (!el) return;
        if (isLoading) {
          el.innerHTML = '<span class="muted">Loading...</span>';
        }
      };

      const buildTabLegend = (melody) => {
        const playable = (melody || []).map((n, idx) => ({
          order: idx + 1,
          note: n.note,
          tab: n.tab
        })).filter((n) => n.tab && n.tab.stringNumber > 0 && n.tab.fret >= 0);

        if (!playable.length) return '';

        const steps = playable.map((p) => '<li>'
          + '<strong>' + p.order + '.</strong> String ' + p.tab.stringNumber + ', fret ' + p.tab.fret
          + ' <span class="muted">(' + p.note + ')</span>'
          + '</li>').join('');

        return '<div class="tab-section">'
          + '<h3>Step-by-step tab</h3>'
          + '<ol class="tab-legend">' + steps + '</ol>'
          + '</div>';
      };

      const buildFretboardDiagram = (melody) => {
        const playable = (melody || []).map((n, idx) => ({
          order: idx + 1,
          note: n.note,
          tab: n.tab
        })).filter((n) => n.tab && n.tab.stringNumber > 0 && n.tab.fret >= 0);

        if (!playable.length) return '';

        const strings = [6, 5, 4, 3, 2, 1];
        const maxFret = Math.max(...playable.map((p) => p.tab.fret));
        const fretCount = Math.max(5, Math.min(14, maxFret + 3));

        const fretLabels = Array.from({ length: fretCount + 1 }, (_, i) => '<div>' + i + '</div>').join('');

        const rows = strings.map((stringNumber) => {
          const markers = playable
            .filter((p) => p.tab.stringNumber === stringNumber)
            .map((p) => {
              const left = Math.min(98, (p.tab.fret / fretCount) * 100);
              return '<div class="fret-marker" style="left:' + left + '%">'
                + '<span class="marker-order">' + p.order + '</span>'
                + '<span class="marker-note">fret ' + p.tab.fret + ' · ' + p.note + '</span>'
                + '</div>';
            }).join('');

          return '<div class="string-row">'
            + '<div class="string-name">String ' + stringNumber + '</div>'
            + '<div class="string-line" style="--fret-count:' + fretCount + ';">' + markers + '</div>'
            + '</div>';
        }).join('');

        return '<div class="tab-section">'
          + '<div class="fretboard">'
            + '<div class="fret-labels" style="grid-template-columns: repeat(' + (fretCount + 1) + ', 1fr);">' + fretLabels + '</div>'
            + rows
          + '</div>'
          + '</div>';
      };

      const applyProgressionToMelody = (progression, key, scale) => {
        const input = document.getElementById('melody-progression');
        const keyInput = document.getElementById('melody-key');
        const scaleSelect = document.getElementById('melody-scale');

        if (input && 'value' in input) input.value = progression;
        if (key && keyInput && 'value' in keyInput) keyInput.value = key;
        if (scale && scaleSelect && 'value' in scaleSelect) scaleSelect.value = scale;
      };

      const wireProgressionSelection = () => {
        progressionResults?.querySelectorAll('.progression-item').forEach((item) => {
          item.addEventListener('click', () => {
            const progression = item.getAttribute('data-progression');
            const key = item.getAttribute('data-key');
            const scale = item.getAttribute('data-scale');
            if (progression) {
              applyProgressionToMelody(progression, key || '', scale || '');
            }
          });
        });
      };

      progressionForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyInput = document.getElementById('progression-key');
        const scaleSelect = document.getElementById('progression-scale');
        const capoInput = progressionCapoInput && 'value' in progressionCapoInput ? progressionCapoInput.value : '0';
        const key = keyInput && 'value' in keyInput ? keyInput.value : 'C';
        const scale = scaleSelect && 'value' in scaleSelect ? scaleSelect.value : 'major';
        const capo = parseInt(capoInput || '0', 10) || 0;

        setLoading(progressionResults, true);

        try {
          const res = await fetch('/api/progressions?key=' + encodeURIComponent(key) + '&scale=' + encodeURIComponent(scale) + '&capo=' + capo);
          const data = await res.json();

          if (!data.progressions) {
            progressionResults.innerHTML = '<span class="muted">No progressions found.</span>';
            return;
          }

          const items = data.progressions.map((p) => {
            const chordNames = p.chords.map((c) => c.name);
            const degrees = p.degrees.join(' - ');
            return '<div class="progression-item" data-progression="' + chordNames.join(',') + '" data-key="' + (data.capoKey || data.key) + '" data-scale="' + data.scaleType + '">' 
              + '<h3>' + p.label + '</h3>'
              + '<div class="muted">Degrees: ' + degrees + '</div>'
              + '<div><strong>Chords:</strong> ' + chordNames.join(' · ') + '</div>'
              + '<div class="muted">Click to send to melody</div>'
              + '</div>';
          }).join('');

          const capoDetail = data.capo ? ' · Capo: ' + data.capo + ' (new key: ' + data.capoKey + ')' : '';
          progressionResults.innerHTML = '<div class="muted" style="margin-bottom: 8px;">Key: ' + data.key + ' · Scale: ' + data.scaleType + capoDetail + '</div>' + items;
          wireProgressionSelection();
        } catch (err) {
          progressionResults.innerHTML = '<span class="muted">Something went wrong loading progressions.</span>';
        }
      });

      melodyForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyInput = document.getElementById('melody-key');
        const scaleSelect = document.getElementById('melody-scale');
        const progressionField = document.getElementById('melody-progression');
        const key = keyInput && 'value' in keyInput ? keyInput.value : 'C';
        const scale = scaleSelect && 'value' in scaleSelect ? scaleSelect.value : 'major';
        const progressionInput = progressionField && 'value' in progressionField ? progressionField.value : '';
        const progression = progressionInput.split(',').map((p) => p.trim()).filter(Boolean);

        setLoading(melodyResults, true);
        setLoading(fretboardArea, true);

        try {
          const res = await fetch('/api/melody', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key, scale, progression })
          });
          const data = await res.json();

          if (!data.melody) {
            melodyResults.innerHTML = '<span class="muted">No melody returned.</span>';
            return;
          }

          const items = data.melody.map((n) => '<div class="melody-item">'
              + '<strong>' + n.note + '</strong> — ' + n.duration + ' beat' + (n.duration !== 1 ? 's' : '') + ' at beat ' + n.beat
              + '<div class="muted">Tab: ' + (n.tab?.label || '—') + '</div>'
            + '</div>').join('');

          const fretboard = buildFretboardDiagram(data.melody);
          const tabSteps = buildTabLegend(data.melody);

          melodyResults.innerHTML = '<div class="muted" style="margin-bottom: 8px;">Progression: ' + data.progression.join(' · ') + '</div>' + tabSteps + items;
          fretboardArea.innerHTML = fretboard || '<span class="muted">No playable fretboard positions found.</span>';
        } catch (err) {
          melodyResults.innerHTML = '<span class="muted">Failed to load melody.</span>';
          fretboardArea.innerHTML = '<span class="muted">Failed to load fretboard diagram.</span>';
        }
      });

      document.querySelectorAll('.progression-fill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const value = btn.dataset.progression;
          const input = document.getElementById('melody-progression');
          if (value && input && 'value' in input) input.value = value;
        });
      });
    </script>
  </body>
  </html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

// Worker entrypoint

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/progressions" && request.method === "GET") {
        const key = url.searchParams.get("key") || "C";
        const scaleParam = (url.searchParams.get("scale") || "major").toLowerCase();
        const scaleType: ScaleType = scaleParam === "minor" ? "minor" : "major";
        const capoParam = parseInt(url.searchParams.get("capo") || "0", 10);
        const capo = Number.isFinite(capoParam) ? Math.max(0, Math.min(11, capoParam)) : 0;

        const data = generateChordProgressions(key, scaleType, capo);
        return jsonResponse(data);
      }

      if (path === "/api/melody" && request.method === "POST") {
        const body = await request.json() as {
          key?: string;
          scale?: string;
          progression?: string[];
        };

        const key = typeof body.key === "string" ? body.key : "C";
        const scaleParam = typeof body.scale === "string" ? body.scale.toLowerCase() : "major";
        const scaleType: ScaleType = scaleParam === "minor" ? "minor" : "major";
        const progression = Array.isArray(body.progression) ? body.progression : ["C", "G", "Am", "F"];

        const melody = generateMelodyForProgression(key, scaleType, progression);

        return jsonResponse({
          key: normalizeKey(key),
          scaleType,
          progression,
          melody
        });
      }

      if (path === "/" && request.method === "GET") {
        return renderHomePage();
      }

      return new Response("Not found", { status: 404 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, 500);
    }
  }
};
