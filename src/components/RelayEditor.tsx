import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { RELAY_LEG_LABELS, formatTime, parseTime } from "../events";
import { SearchableSelect } from "./SearchableSelect";

// Relay leg distances in meters — mirrors convex/meets.ts
const RELAY_LEG_DISTANCES: Record<string, number[]> = {
  "4x100 Meter Relay": [100, 100, 100, 100],
  "4x200 Meter Relay": [200, 200, 200, 200],
  "4x400 Meter Relay": [400, 400, 400, 400],
  "4x800 Meter Relay": [800, 800, 800, 800],
  "Sprint Medley Relay": [100, 100, 200, 400],
  "Distance Medley Relay": [200, 200, 400, 800],
  "Shuttle Hurdle Relay": [100, 100, 100, 100],
};

// Conservative handoff time savings (3 exchanges per relay)
const HANDOFF_DISCOUNT: Record<string, number> = {
  "4x100 Meter Relay": 2.4,   // 0.8s × 3
  "4x200 Meter Relay": 1.8,   // 0.6s × 3
  "4x400 Meter Relay": 0.9,   // 0.3s × 3
  "4x800 Meter Relay": 0.6,   // 0.2s × 3
  "Sprint Medley Relay": 1.5, // 0.5s × 3
  "Distance Medley Relay": 0.9, // 0.3s × 3
  "Shuttle Hurdle Relay": 0.9,  // 0.3s × 3
};

const EVENT_DISTANCES: Record<string, number> = {
  "100 Meters": 100,
  "200 Meters": 200,
  "400 Meters": 400,
  "800 Meters": 800,
  "1500 Meters": 1500,
  "3000 Meters": 3000,
  "100 Meter Hurdles": 100,
  "400 Meter Hurdles": 400,
};

function riegelPredict(knownDist: number, knownTime: number, targetDist: number) {
  return knownTime * Math.pow(targetDist / knownDist, 1.06);
}

const HURDLE_EVENTS = new Set(["100 Meter Hurdles", "400 Meter Hurdles"]);
const HURDLE_RELAYS = new Set(["Shuttle Hurdle Relay"]);

// Only allow Riegel estimates for legs ≤ 200m
const MAX_ESTIMATE_DIST = 200;

function predictLegTime(
  athleteTimes: { event: string; time: number }[],
  targetDist: number,
  relayEvent: string
): { time: number; estimated: boolean } | null {
  const legIsHurdle = HURDLE_RELAYS.has(relayEvent);
  // Look for exact event match respecting hurdle/flat category
  const exactEvent = Object.entries(EVENT_DISTANCES).find(
    ([name, d]) => d === targetDist && HURDLE_EVENTS.has(name) === legIsHurdle
  )?.[0];
  if (exactEvent) {
    const exact = athleteTimes.find((t) => t.event === exactEvent);
    if (exact) return { time: exact.time, estimated: false };
  }
  // Only produce estimates for legs ≤ 200m
  if (targetDist > MAX_ESTIMATE_DIST) return null;
  const predictions: { pred: number; weight: number }[] = [];
  for (const t of athleteTimes) {
    const knownDist = EVENT_DISTANCES[t.event];
    if (!knownDist) continue;
    if (HURDLE_EVENTS.has(t.event) !== legIsHurdle) continue;
    const ratio = knownDist > targetDist ? knownDist / targetDist : targetDist / knownDist;
    if (ratio > 3) continue;
    const pred = riegelPredict(knownDist, t.time, targetDist);
    const weight = 1 / Math.abs(Math.log(knownDist / targetDist));
    predictions.push({ pred, weight });
  }
  if (predictions.length === 0) return null;
  const totalWeight = predictions.reduce((s, p) => s + p.weight, 0);
  const weighted = predictions.reduce((s, p) => s + p.pred * p.weight, 0) / totalWeight;
  return { time: weighted, estimated: true };
}

function fmt(s: number) {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2).padStart(5, "0");
    return `${m}:${sec}`;
  }
  return s.toFixed(2);
}

interface Athlete {
  _id: GenericId<"athletes">;
  name: string;
  times: { event: string; time: number }[];
}

interface Props {
  meetId: GenericId<"meets">;
  teamSlug: string;
  event: string;
  athletes: Athlete[];
  legAthleteIds: (GenericId<"athletes"> | null)[];
  usedEventCounts: Map<string, number>; // athleteId -> events assigned
  teamOverrides: { event: string; athleteId: string; time: number }[];
  onChange: (legs: (GenericId<"athletes"> | null)[]) => void;
  onAdjustedTotal?: (total: number | null) => void;
}

export function RelayEditor({
  meetId,
  teamSlug,
  event,
  athletes,
  legAthleteIds,
  usedEventCounts,
  teamOverrides,
  onChange,
  onAdjustedTotal,
}: Props) {
  const setEntry = useMutation(api.meets.setEntry);
  const setTimeOverride = useMutation(api.meets.setTimeOverride);
  const setRelayPrediction = useMutation(api.meets.setRelayPrediction);

  function getOverrideDisplay(athleteId: string): string {
    const o = teamOverrides.find((o) => o.event === event && o.athleteId === athleteId);
    return o ? formatTime(o.time) : "";
  }
  const legDistances = RELAY_LEG_DISTANCES[event] ?? [];
  const legLabels = RELAY_LEG_LABELS[event] ?? legDistances.map((_, i) => `Leg ${i + 1}`);

  function handleLegChange(legIndex: number, athleteId: string) {
    const updated = [...legAthleteIds] as (GenericId<"athletes"> | null)[];
    updated[legIndex] = athleteId ? (athleteId as GenericId<"athletes">) : null;
    onChange(updated);
    const validIds = updated.filter(Boolean) as GenericId<"athletes">[];
    setEntry({ meetId, teamSlug, event, athleteIds: validIds });
  }

  // Predicted relay total — includes predictions, actual times, and manual overrides
  let relayTotal = 0;
  let relayEstimated = false;
  let relayHasOverride = false;
  let relayValid = legDistances.length > 0;
  const legPredictions: ({ time: number; estimated: boolean } | null)[] = [];

  for (let i = 0; i < legDistances.length; i++) {
    const id = legAthleteIds[i];
    if (!id) {
      relayValid = false;
      legPredictions.push(null);
      continue;
    }
    const athlete = athletes.find((a) => a._id === id);
    const pred = athlete ? predictLegTime(athlete.times, legDistances[i], event) : null;
    // If there's a manual override, use it (even if an estimate exists)
    const override = teamOverrides.find((o) => o.event === event && o.athleteId === id);
    if (override) {
      legPredictions.push({ time: override.time, estimated: false });
      relayTotal += override.time;
      relayHasOverride = true;
    } else {
      legPredictions.push(pred);
      if (pred) {
        relayTotal += pred.time;
        if (pred.estimated) relayEstimated = true;
      } else {
        relayValid = false;
      }
    }
  }

  // Report adjusted total to parent (real-time UI)
  const adjustedTotal = relayValid ? relayTotal - (HANDOFF_DISCOUNT[event] ?? 0) : null;
  onAdjustedTotal?.(adjustedTotal);

  // Persist adjusted total so other teams' popups reflect our simulated time
  useEffect(() => {
    setRelayPrediction({
      meetId,
      teamSlug,
      event,
      predictedTime: adjustedTotal ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustedTotal]);

  return (
    <div className="relay-editor">
      {legDistances.map((dist, i) => {
        const currentId = legAthleteIds[i] ?? "";
        const legPred = legPredictions[i];

        // Sort athletes by time for this leg distance (fastest first)
        const sorted = [...athletes].sort((a, b) => {
          const aP = predictLegTime(a.times, dist, event);
          const bP = predictLegTime(b.times, dist, event);
          const aTime = aP ? aP.time : null;
          const bTime = bP ? bP.time : null;
          if (aTime == null && bTime == null) return a.name.localeCompare(b.name);
          if (aTime == null) return 1;
          if (bTime == null) return -1;
          return aTime - bTime;
        });

        const currentOverride = currentId ? teamOverrides.find((o) => o.event === event && o.athleteId === currentId) : undefined;
        const hasOverride = currentId && !!currentOverride;

        return (
          <div key={i} className="relay-leg-block">
            <div className="relay-leg-row">
            <span className="relay-leg-label">{legLabels[i]}</span>
            <SearchableSelect
              className={`relay-leg-select${hasOverride ? " manual-override" : ""}`}
              value={currentId}
              placeholder="— unassigned —"
              onChange={(val) => handleLegChange(i, val)}
              options={sorted.map((a) => {
                const count = usedEventCounts.get(a._id) ?? 0;
                const alreadyInThisLeg = legAthleteIds.some(
                  (id, idx) => idx !== i && id === a._id
                );
                const isAtLimit = count >= 4 && currentId !== a._id;
                const pred = predictLegTime(a.times, dist, event);
                const ov = teamOverrides.find((o) => o.event === event && o.athleteId === a._id);
                let label = a.name;
                if (ov) {
                  label += ` — ${fmt(ov.time)} (manual)`;
                } else if (pred) {
                  label += ` — ${fmt(pred.time)}`;
                  if (pred.estimated) label += " (est.)";
                }
                if (isAtLimit) label += " [4 events]";
                return {
                  value: a._id,
                  label,
                  disabled: isAtLimit || alreadyInThisLeg,
                };
              })}
            />
            {legPred && (
              <span className={`relay-leg-time ${legPred.estimated ? "estimated" : "exact"}`}>
                {fmt(legPred.time)}{legPred.estimated ? " (est.)" : ""}
              </span>
            )}
            {!legPred && currentId && (
              <input
                type="text"
                className="manual-time-input manual-override-time"
                placeholder="0:00.00"
                defaultValue={getOverrideDisplay(currentId)}
                key={`${currentId}-${getOverrideDisplay(currentId)}`}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val === "") {
                    setTimeOverride({ meetId, teamSlug, event, athleteId: currentId as GenericId<"athletes"> });
                  } else {
                    const parsed = parseTime(val);
                    if (parsed != null && parsed > 0) {
                      setTimeOverride({ meetId, teamSlug, event, athleteId: currentId as GenericId<"athletes">, time: parsed });
                    }
                  }
                }}
              />
            )}
            </div>
            {legPred?.estimated && currentId && (
              <div className="relay-leg-override-row">
                <span className="relay-leg-override-label">Override est. time:</span>
                <input
                  type="text"
                  className="manual-time-input estimated-input"
                  placeholder="0:00.00"
                  defaultValue={getOverrideDisplay(currentId)}
                  key={`est-${currentId}-${getOverrideDisplay(currentId)}`}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val === "") {
                      setTimeOverride({ meetId, teamSlug, event, athleteId: currentId as GenericId<"athletes"> });
                    } else {
                      const parsed = parseTime(val);
                      if (parsed != null && parsed > 0) {
                        setTimeOverride({ meetId, teamSlug, event, athleteId: currentId as GenericId<"athletes">, time: parsed });
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      {relayValid && (
        <div className="relay-total">
          Additive: <strong>{fmt(relayTotal)}</strong>
          {(relayEstimated || relayHasOverride) && (
            <span className="estimated-label">
              {relayEstimated && relayHasOverride ? " (est. + manual)" : relayEstimated ? " (estimated)" : " (manual)"}
            </span>
          )}
          <span className="relay-adjusted">
            {" → Adjusted: "}<strong>{fmt(relayTotal - (HANDOFF_DISCOUNT[event] ?? 0))}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
