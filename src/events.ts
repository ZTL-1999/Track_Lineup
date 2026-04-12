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
  "Distance Medley Relay": ["1200 Meters", "400 Meters", "800 Meters", "1600 Meters"],
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
  "Distance Medley Relay": ["Leg 1 (1200m)", "Leg 2 (400m)", "Leg 3 (800m)", "Leg 4 (1600m)"],
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
