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

function generateChordProgressions(key: string, scaleType: ScaleType) {
  const normalizedKey = normalizeKey(key);
  const scale = buildScale(normalizedKey, scaleType);

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
    scaleType,
    scale,
    progressions
  };
}

// Melody generation
// 1 bar of 4 beats per chord, quarter-note grid

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
      notes.push({
        note: pitch,
        duration,
        beat: currentBeat
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

        const data = generateChordProgressions(key, scaleType);
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
        const info = {
          message: "Music helper Worker",
          endpoints: {
            "/api/progressions?key=C&scale=major": "GET chord progression suggestions",
            "/api/melody": {
              method: "POST",
              bodyExample: {
                key: "C",
                scale: "major",
                progression: ["C", "G", "Am", "F"]
              }
            }
          }
        };
        return jsonResponse(info);
      }

      return new Response("Not found", { status: 404 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      return jsonResponse({ error: msg }, 500);
    }
  }
};
