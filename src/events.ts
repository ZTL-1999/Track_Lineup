// Iowa Girls State Track & Field Events (IGHSAU)

export const INDIVIDUAL_EVENTS = [
  "100 Meters",
  "200 Meters",
  "400 Meters",
  "800 Meters",
  "1500 Meters",
  "3000 Meters",
  "100 Meter Hurdles",
  "400 Meter Hurdles",
] as const;

export const FIELD_EVENTS = [
  "High Jump",
  "Long Jump",
  "Shot Put",
  "Discus Throw",
] as const;

export const RELAY_EVENTS = [
  "4x100 Meter Relay",
  "4x200 Meter Relay",
  "4x400 Meter Relay",
  "4x800 Meter Relay",
  "Sprint Medley Relay",
  "Distance Medley Relay",
  "Shuttle Hurdle Relay",
] as const;

export const ALL_EVENTS = [...INDIVIDUAL_EVENTS, ...FIELD_EVENTS, ...RELAY_EVENTS] as const;

// Maps relay events to the individual event each leg corresponds to
// Used to look up athlete split times
export const RELAY_LEG_EVENTS: Record<string, string[]> = {
  "4x100 Meter Relay": ["100 Meters", "100 Meters", "100 Meters", "100 Meters"],
  "4x200 Meter Relay": ["200 Meters", "200 Meters", "200 Meters", "200 Meters"],
  "4x400 Meter Relay": ["400 Meters", "400 Meters", "400 Meters", "400 Meters"],
  "4x800 Meter Relay": ["800 Meters", "800 Meters", "800 Meters", "800 Meters"],
  "Sprint Medley Relay": ["100 Meters", "100 Meters", "200 Meters", "400 Meters"],
  "Distance Medley Relay": ["200 Meters", "200 Meters", "400 Meters", "800 Meters"],
  "Shuttle Hurdle Relay": [
    "100 Meter Hurdles",
    "100 Meter Hurdles",
    "100 Meter Hurdles",
    "100 Meter Hurdles",
  ],
};

export const RELAY_LEG_LABELS: Record<string, string[]> = {
  "4x100 Meter Relay": ["Leg 1 (100m)", "Leg 2 (100m)", "Leg 3 (100m)", "Leg 4 (100m)"],
  "4x200 Meter Relay": ["Leg 1 (200m)", "Leg 2 (200m)", "Leg 3 (200m)", "Leg 4 (200m)"],
  "4x400 Meter Relay": ["Leg 1 (400m)", "Leg 2 (400m)", "Leg 3 (400m)", "Leg 4 (400m)"],
  "4x800 Meter Relay": ["Leg 1 (800m)", "Leg 2 (800m)", "Leg 3 (800m)", "Leg 4 (800m)"],
  "Sprint Medley Relay": ["Leg 1 (100m)", "Leg 2 (100m)", "Leg 3 (200m)", "Leg 4 (400m)"],
  "Distance Medley Relay": ["Leg 1 (200m)", "Leg 2 (200m)", "Leg 3 (400m)", "Leg 4 (800m)"],
  "Shuttle Hurdle Relay": [
    "Leg 1 (100mH)",
    "Leg 2 (100mH)",
    "Leg 3 (100mH)",
    "Leg 4 (100mH)",
  ],
};

// Events that athletes can log times for (individual + relay-specific distances)
export const TIMED_EVENTS = [
  "100 Meters",
  "200 Meters",
  "400 Meters",
  "800 Meters",
  "1200 Meters",
  "1500 Meters",
  "1600 Meters",
  "3000 Meters",
  "100 Meter Hurdles",
  "400 Meter Hurdles",
] as const;

export function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
  }
  return seconds.toFixed(2);
}

export function formatMark(meters: number): string {
  const totalInches = meters / 0.0254;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches.toFixed(1)}"`;
}

export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  // Format: M:SS.ss or SS.ss
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2}(?:\.\d{1,2})?)$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseFloat(colonMatch[2]);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }
  const secMatch = trimmed.match(/^\d+(?:\.\d{1,2})?$/);
  if (secMatch) {
    return parseFloat(trimmed);
  }
  return null;
}

// Distance in meters for each timed event — used by Riegel prediction
export const EVENT_DISTANCES: Record<string, number> = {
  "100 Meters": 100,
  "200 Meters": 200,
  "400 Meters": 400,
  "800 Meters": 800,
  "1500 Meters": 1500,
  "3000 Meters": 3000,
  "100 Meter Hurdles": 100,
  "400 Meter Hurdles": 400,
};

// Hurdle events should only predict from other hurdle events (and vice versa)
const HURDLE_EVENTS = new Set(["100 Meter Hurdles", "400 Meter Hurdles"]);

export function isHurdleEvent(event: string): boolean {
  return HURDLE_EVENTS.has(event);
}

// Riegel formula: T2 = T1 * (D2/D1)^1.06
export function riegelPredict(
  knownDistMeters: number,
  knownTimeSeconds: number,
  targetDistMeters: number
): number {
  return knownTimeSeconds * Math.pow(targetDistMeters / knownDistMeters, 1.06);
}

// Predict time for a target event using all known times (distance-weighted Riegel)
export function predictEventTime(
  athleteTimes: { event: string; time: number }[],
  targetEvent: string
): { time: number; estimated: boolean } | null {
  const targetDist = EVENT_DISTANCES[targetEvent];
  if (!targetDist) return null;

  // Exact match first
  const exact = athleteTimes.find((t) => t.event === targetEvent);
  if (exact) return { time: exact.time, estimated: false };

  // Riegel prediction — weighted by closeness in log-distance
  // Only use same category (flat↔flat, hurdle↔hurdle)
  // Cap at 3x distance ratio — Riegel breaks down for large extrapolations
  const targetIsHurdle = isHurdleEvent(targetEvent);
  const predictions: { pred: number; weight: number }[] = [];
  for (const t of athleteTimes) {
    const knownDist = EVENT_DISTANCES[t.event];
    if (!knownDist || knownDist === targetDist) continue;
    // Skip cross-category predictions
    if (isHurdleEvent(t.event) !== targetIsHurdle) continue;
    // Skip if distance ratio > 3x (too far to extrapolate reliably)
    const ratio = knownDist > targetDist ? knownDist / targetDist : targetDist / knownDist;
    if (ratio > 3) continue;
    const pred = riegelPredict(knownDist, t.time, targetDist);
    const weight = 1 / Math.abs(Math.log(knownDist / targetDist));
    predictions.push({ pred, weight });
  }
  if (predictions.length === 0) return null;
  const totalWeight = predictions.reduce((s, p) => s + p.weight, 0);
  const weighted =
    predictions.reduce((s, p) => s + p.pred * p.weight, 0) / totalWeight;
  return { time: weighted, estimated: true };
}
