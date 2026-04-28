import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import {
  INDIVIDUAL_EVENTS,
  FIELD_EVENTS,
  RELAY_EVENTS,
  RELAY_LEG_EVENTS,
  formatTime,
  formatMark,
  parseTime,
  predictEventTime,
} from "../events";
import { RelayEditor } from "./RelayEditor";
import { SearchableSelect } from "./SearchableSelect";

interface Props {
  meetId: GenericId<"meets">;
  teamSlug: string;
  teamName: string;
  onBack: () => void;
}

const FIELD_EVENT_SET = new Set<string>(FIELD_EVENTS);
const RELAY_EVENT_SET = new Set<string>(RELAY_EVENTS);

export function LineupEditor({ meetId, teamSlug, teamName, onBack }: Props) {
  const athletes = useQuery(api.athletes.listWithTimes, { team: teamSlug }) ?? [];
  const existingEntries = useQuery(api.meets.getEntries, { meetId }) ?? [];
  const existingMarks = useQuery(api.meets.getFieldMarks, { meetId }) ?? [];
  const existingOverrides = useQuery(api.meets.getTimeOverrides, { meetId }) ?? [];
  const projectedPts = useQuery(api.meets.projectedPoints, { meetId, teamSlug }) ?? {};
  const setEntry = useMutation(api.meets.setEntry);
  const setFieldMark = useMutation(api.meets.setFieldMark);
  const setTimeOverride = useMutation(api.meets.setTimeOverride);
  const saveProjectedTotal = useMutation(api.meets.saveProjectedTotal);

  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [autoFillMsg, setAutoFillMsg] = useState<string | null>(null);
  const [fieldAutoFillMsg, setFieldAutoFillMsg] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load rankings once on mount, then unsubscribe — avoids reactive re-execution
  // during imports. User can manually refresh with the Refresh button.
  const [rankingsSnapped, setRankingsSnapped] = useState(false);
  const [localRankings, setLocalRankings] = useState<Record<string, any[]>>({});
  const liveRankings = useQuery(api.meets.allRankings, rankingsSnapped ? "skip" : { meetId });
  useEffect(() => {
    if (liveRankings && !rankingsSnapped) {
      setLocalRankings(liveRankings);
      setRankingsSnapped(true);
    }
  }, [liveRankings, rankingsSnapped]);

  const rankingsMap = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const [event, rows] of Object.entries(localRankings)) {
      m.set(event, rows as any[]);
    }
    return m;
  }, [localRankings]);

  function handleMouseEnter(event: string) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredEvent(event);
  }
  function handleMouseLeave() {
    hoverTimeout.current = setTimeout(() => setHoveredEvent(null), 200);
  }

  // Store adjusted relay totals from RelayEditor
  const [relayAdjustedTotals, setRelayAdjustedTotals] = useState<Map<string, number | null>>(
    () => new Map()
  );

  // Compute track event projected points client-side using eventRankings (includes estimated competitors)
  const trackProjectedPts = useMemo(() => {
    const pts: Record<string, number> = {};
    const teamEntries = existingEntries.filter((e) => e.teamSlug === teamSlug);
    for (const event of INDIVIDUAL_EVENTS) {
      const entry = teamEntries.find((e) => e.event === event);
      if (!entry) continue;
      const rankings = rankingsMap.get(event) ?? [];
      const rankedTimes = rankings.map((r: any) => r.time);
      // Get our athletes' times (actual, override, or predicted)
      const ourAthletes: { time: number }[] = [];
      for (const athleteId of entry.athleteIds) {
        if (!athleteId) continue;
        const athlete = athletes.find((a) => a._id === athleteId);
        if (!athlete) continue;
        const override = existingOverrides.find((o) => o.event === event && o.athleteId === athleteId);
        const predicted = override
          ? { time: override.time }
          : predictEventTime(athlete.times.map((t) => ({ event: t.event, time: t.time })), event);
        if (predicted) ourAthletes.push({ time: predicted.time });
      }
      ourAthletes.sort((a, b) => a.time - b.time); // fastest first
      const usedPlaces = new Set<number>();
      let eventPts = 0;
      for (const { time } of ourAthletes) {
        const betterCount = rankedTimes.filter((t: number) => t < time).length;
        let place = betterCount;
        while (usedPlaces.has(place)) place++;
        if (place >= 8) continue;
        usedPlaces.add(place);
        eventPts += PLACE_POINTS[place] ?? 0;
      }
      if (eventPts > 0) pts[event] = eventPts;
    }
    return pts;
  }, [existingEntries, teamSlug, rankingsMap, athletes, existingOverrides]);

  // Compute relay projected points from adjusted totals vs other teams' actual times
  const relayProjectedPts = useMemo(() => {
    const pts: Record<string, number> = {};
    for (const event of RELAY_EVENTS) {
      const adjusted = relayAdjustedTotals.get(event);
      if (adjusted == null) continue;
      const rankings = rankingsMap.get(event) ?? [];
      // Count how many other teams are faster
      const fasterCount = rankings.filter((r: any) => r.teamSlug !== teamSlug && r.time < adjusted).length;
      const p = PLACE_POINTS[fasterCount] ?? 0;
      if (p > 0) pts[event] = p;
    }
    return pts;
  }, [relayAdjustedTotals, rankingsMap, teamSlug]);

  // Compute field event projected points from rankings
  const fieldProjectedPts = useMemo(() => {
    const pts: Record<string, number> = {};
    const teamEntries = existingEntries.filter((e) => e.teamSlug === teamSlug);
    for (const event of FIELD_EVENTS) {
      const entry = teamEntries.find((e) => e.event === event);
      if (!entry) continue;
      const rankings = rankingsMap.get(event) ?? [];
      // Get marks for our athletes
      const ourAthletes: { athleteId: string; mark: number }[] = [];
      for (const athleteId of entry.athleteIds) {
        if (!athleteId) continue;
        const athlete = athletes.find((a) => a._id === athleteId);
        const mark = athlete?.times.find((t) => t.event === event)?.time;
        if (mark != null) ourAthletes.push({ athleteId, mark });
      }
      // Sort our athletes best first (highest mark for field)
      ourAthletes.sort((a, b) => b.mark - a.mark);
      // Use full rankings (don't filter our team) — they represent the true top 8
      const rankedMarks = rankings.map((r: any) => r.time);
      const usedPlaces = new Set<number>();
      let eventPts = 0;
      for (const { mark } of ourAthletes) {
        // Count how many ranked marks are strictly better (higher for field)
        const betterCount = rankedMarks.filter((m: number) => m > mark).length;
        // Find next available place (avoid two athletes at the same position)
        let place = betterCount;
        while (usedPlaces.has(place)) place++;
        if (place >= 8) continue; // outside top 8, no points
        usedPlaces.add(place);
        const p = PLACE_POINTS[place] ?? 0;
        eventPts += p;
      }
      if (eventPts > 0) pts[event] = eventPts;
    }
    return pts;
  }, [existingEntries, teamSlug, rankingsMap, athletes]);

  // Local relay leg state: event -> [id|null, id|null, id|null, id|null]
  const [relayLegs, setRelayLegs] = useState<
    Map<string, (GenericId<"athletes"> | null)[]>
  >(() => {
    const map = new Map<string, (GenericId<"athletes"> | null)[]>();
    for (const event of RELAY_EVENTS) {
      map.set(event, [null, null, null, null]);
    }
    return map;
  });

  // Seed relay legs from existing entries (runs once when data arrives)
  const seededRef = { current: false };
  useMemo(() => {
    if (seededRef.current) return;
    const teamEntries = existingEntries.filter((e) => e.teamSlug === teamSlug);
    if (teamEntries.length === 0) return;
    seededRef.current = true;
    const next = new Map(relayLegs);
    for (const entry of teamEntries) {
      if (RELAY_EVENT_SET.has(entry.event)) {
        const legs: (GenericId<"athletes"> | null)[] = [null, null, null, null];
        entry.athleteIds.forEach((id, i) => { legs[i] = id; });
        next.set(entry.event, legs);
      }
    }
    // We can't call setState inside useMemo; handled via initial state seeding below
  }, [existingEntries]);

  // Count how many events each athlete is assigned to in this meet for this team
  const usedEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const teamEntries = existingEntries.filter((e) => e.teamSlug === teamSlug);
    for (const entry of teamEntries) {
      for (const id of entry.athleteIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [existingEntries, teamSlug]);

  // Field marks for this team
  const teamMarks = useMemo(
    () => existingMarks.filter((m) => m.teamSlug === teamSlug),
    [existingMarks, teamSlug]
  );

  // Persist the projected total so the scoresheet stays in sync
  const projectedTotal =
    Object.values(trackProjectedPts).reduce((s, p) => s + p, 0) +
    Object.values(relayProjectedPts).reduce((s, p) => s + p, 0) +
    Object.values(fieldProjectedPts).reduce((s, p) => s + p, 0);

  useEffect(() => {
    saveProjectedTotal({ meetId, teamSlug, total: projectedTotal });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectedTotal]);

  function getEntryAthleteIds(event: string): GenericId<"athletes">[] {
    const e = existingEntries.find(
      (e) => e.teamSlug === teamSlug && e.event === event
    );
    return (e?.athleteIds ?? []) as GenericId<"athletes">[];
  }

  function handleSlotChange(event: string, slotIndex: number, athleteId: string, maxSlots: number) {
    const current = getEntryAthleteIds(event);
    // Build array with up to maxSlots entries
    const updated: GenericId<"athletes">[] = [];
    for (let i = 0; i < maxSlots; i++) {
      if (i === slotIndex) {
        if (athleteId) updated.push(athleteId as GenericId<"athletes">);
      } else {
        const existing = current[i];
        if (existing) updated.push(existing);
      }
    }
    // Remove duplicates
    const unique = [...new Set(updated)];
    setEntry({ meetId, teamSlug, event, athleteIds: unique });
  }

  // Only show estimates for these events; all others require actual times
  const ESTIMATE_OK_EVENTS = new Set(["100 Meters", "200 Meters"]);

  // Overrides for this team
  const teamOverrides = useMemo(
    () => existingOverrides.filter((o) => o.teamSlug === teamSlug),
    [existingOverrides, teamSlug]
  );

  // Pre-compute sorted athletes, labels, and manual-time flags for all track events
  // This avoids calling predictEventTime() on every render for every athlete × event
  const trackEventData = useMemo(() => {
    const data = new Map<
      string,
      { sorted: typeof athletes; labels: Map<string, string>; needsManual: Set<string>; hasOverride: Set<string>; isEstimated: Set<string> }
    >();
    for (const event of INDIVIDUAL_EVENTS) {
      const allowEst = ESTIMATE_OK_EVENTS.has(event);
      const sorted = [...athletes].sort((a, b) => {
        const aP = predictEventTime(a.times, event);
        const bP = predictEventTime(b.times, event);
        const aTime = aP && (allowEst || !aP.estimated) ? aP.time : null;
        const bTime = bP && (allowEst || !bP.estimated) ? bP.time : null;
        if (aTime == null && bTime == null) return a.name.localeCompare(b.name);
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return aTime - bTime;
      });
      const labels = new Map<string, string>();
      const needsManual = new Set<string>();
      const hasOverride = new Set<string>();
      const isEstimated = new Set<string>();
      for (const a of sorted) {
        const pred = predictEventTime(a.times, event);
        let label = a.name;
        if (pred && (allowEst || !pred.estimated)) {
          label += ` — ${formatTime(pred.time)}`;
          if (pred.estimated) {
            label += " (est.)";
            isEstimated.add(a._id);
          }
          // If there's a manual override for an estimated time, show that instead
          const override = teamOverrides.find((o) => o.event === event && o.athleteId === a._id);
          if (override && pred.estimated) {
            label = `${a.name} — ${formatTime(override.time)} (manual)`;
            hasOverride.add(a._id);
          }
        } else {
          needsManual.add(a._id);
          // Include manual override time in label if it exists
          const override = teamOverrides.find((o) => o.event === event && o.athleteId === a._id);
          if (override) {
            label += ` — ${formatTime(override.time)}`;
            hasOverride.add(a._id);
          }
        }
        labels.set(a._id, label);
      }
      data.set(event, { sorted, labels, needsManual, hasOverride, isEstimated });
    }
    return data;
  }, [athletes, teamOverrides]);

  function getFieldMark(event: string, athleteId: string): string {
    const m = teamMarks.find((m) => m.event === event && m.athleteId === athleteId);
    return m ? String(m.mark) : "";
  }

  function getTimeOverrideDisplay(event: string, athleteId: string): string {
    const o = teamOverrides.find((o) => o.event === event && o.athleteId === athleteId);
    return o ? formatTime(o.time) : "";
  }

  return (
    <div className="lineup-editor-wrapper">
      <div className="lineup-editor">
        <div className="lineup-header">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h2>
            Lineup: <span className="lineup-team-name">{teamName}</span>
            <span className="lineup-total-pts">
              Projected: {projectedTotal} pts
            </span>
          </h2>
          <p className="lineup-hint">Athletes are limited to 4 events each. Hover over an event name to see 4A rankings.{" "}
            <button
              className="btn-refresh-rankings"
              onClick={() => setRankingsSnapped(false)}
              title="Reload rankings from database"
            >
              {liveRankings === undefined && !rankingsSnapped ? "Loading…" : "↻ Refresh Rankings"}
            </button>
          </p>
        </div>

      <div className="lineup-sections">
        <div className="lineup-column-left">
        {/* Individual track events */}
        <section className="lineup-section">
          <div className="lineup-section-header">
            <h3 className="lineup-section-title">⚡ Track Events</h3>
            <button
              className="btn-auto-populate"
              onClick={() => {
                let filled = 0;
                for (const event of INDIVIDUAL_EVENTS) {
                  const evData = trackEventData.get(event)!;
                  const allowEst = ESTIMATE_OK_EVENTS.has(event);
                  const rankings = rankingsMap.get(event) ?? [];
                  const rankedTimes = rankings.map((r: any) => r.time);
                  const eligible = evData.sorted.filter((a) => {
                    const override = existingOverrides.find((o) => o.event === event && o.athleteId === a._id);
                    const pred = override ? { time: override.time, estimated: false } : predictEventTime(a.times, event);
                    if (!pred || (!allowEst && pred.estimated)) return false;
                    const betterCount = rankedTimes.filter((t: number) => t < pred.time).length;
                    return betterCount < 8;
                  });
                  const top2 = eligible.slice(0, 2).map((a) => a._id as GenericId<"athletes">);
                  if (top2.length > 0) {
                    setEntry({ meetId, teamSlug, event, athleteIds: top2 });
                    filled++;
                  }
                }
                if (filled === 0) {
                  setAutoFillMsg("No athletes would score points in any track event.");
                  setTimeout(() => setAutoFillMsg(null), 4000);
                } else {
                  setAutoFillMsg(null);
                }
              }}
            >
              Auto-fill Top 2
            </button>
          </div>
          {autoFillMsg && <p className="autofill-no-scorers">{autoFillMsg}</p>}
          <p className="lineup-field-hint">Up to 2 athletes per event per team.</p>
          <div className="lineup-event-rows">
            {INDIVIDUAL_EVENTS.map((event) => {
              const ids = getEntryAthleteIds(event);
              const evData = trackEventData.get(event)!;
              const sorted = evData.sorted;
              return (
                <div key={event} className="lineup-event-row lineup-multi-row">
                  <span
                    className={`lineup-event-name clickable ${hoveredEvent === event ? "active" : ""}`}
                    onMouseEnter={() => handleMouseEnter(event)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {event}
                    {trackProjectedPts[event] != null && (
                      <span className="event-projected-pts"> ({trackProjectedPts[event]} pts)</span>
                    )}
                  </span>
                  <div className="lineup-multi-slots">
                    {[0, 1].map((slot) => {
                      const selectedId = ids[slot] ?? "";
                      const otherId = ids[slot === 0 ? 1 : 0] ?? "";
                      return (
                        <div key={slot} className="lineup-field-slot">
                          <SearchableSelect
                            className={`lineup-athlete-select${selectedId && evData.hasOverride.has(selectedId) ? " manual-override" : ""}`}
                            value={selectedId}
                            placeholder={`— slot ${slot + 1} —`}
                            onChange={(val) => handleSlotChange(event, slot, val, 2)}
                            options={sorted.map((a) => {
                              const count = usedEventCounts.get(a._id) ?? 0;
                              const isAtLimit = count >= 4 && selectedId !== a._id;
                              const isOtherSlot = otherId === a._id;
                              const baseLabel = evData.labels.get(a._id) ?? a.name;
                              return {
                                value: a._id,
                                label: baseLabel + (isAtLimit ? " [4 events]" : ""),
                                disabled: isAtLimit || isOtherSlot,
                              };
                            })}
                          />
                          {selectedId && (evData.needsManual.has(selectedId) || evData.isEstimated.has(selectedId)) && (
                            <input
                              type="text"
                              className={`manual-time-input${evData.isEstimated.has(selectedId) && !evData.hasOverride.has(selectedId) ? " estimated-input" : ""}`}
                              placeholder={evData.isEstimated.has(selectedId) ? "Override est. time" : "0:00.00"}
                              defaultValue={getTimeOverrideDisplay(event, selectedId)}
                              key={`${selectedId}-${getTimeOverrideDisplay(event, selectedId)}`}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val === "") {
                                  setTimeOverride({
                                    meetId,
                                    teamSlug,
                                    event,
                                    athleteId: selectedId as GenericId<"athletes">,
                                  });
                                } else {
                                  const parsed = parseTime(val);
                                  if (parsed != null && parsed > 0) {
                                    setTimeOverride({
                                      meetId,
                                      teamSlug,
                                      event,
                                      athleteId: selectedId as GenericId<"athletes">,
                                      time: parsed,
                                    });
                                  }
                                }
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Field events */}
        <section className="lineup-section lineup-section-field">
          <div className="lineup-section-header">
            <h3 className="lineup-section-title">🏅 Field Events</h3>
            <button
              className="btn-auto-populate"
              onClick={() => {
                let filled = 0;
                for (const event of FIELD_EVENTS) {
                  const rankings = rankingsMap.get(event) ?? [];
                  const rankedMarks = rankings.map((r: any) => r.time);
                  const eligible = athletes
                    .filter((a) => {
                      const mark = a.times.find((t) => t.event === event)?.time;
                      if (mark == null) return false;
                      const betterCount = rankedMarks.filter((m: number) => m > mark).length;
                      return betterCount < 8;
                    })
                    .sort((a, b) => {
                      const aTime = a.times.find((t) => t.event === event)?.time ?? 0;
                      const bTime = b.times.find((t) => t.event === event)?.time ?? 0;
                      return bTime - aTime;
                    });
                  const top2 = eligible.slice(0, 2).map((a) => a._id as GenericId<"athletes">);
                  if (top2.length > 0) {
                    setEntry({ meetId, teamSlug, event, athleteIds: top2 });
                    filled++;
                  }
                }
                if (filled === 0) {
                  setFieldAutoFillMsg("No athletes would score points in any field event.");
                  setTimeout(() => setFieldAutoFillMsg(null), 4000);
                } else {
                  setFieldAutoFillMsg(null);
                }
              }}
            >
              Auto-fill Top 2
            </button>
          </div>
          {fieldAutoFillMsg && <p className="autofill-no-scorers">{fieldAutoFillMsg}</p>}
          <p className="lineup-field-hint">Up to 2 athletes per event.</p>
          <div className="lineup-event-rows">
            {FIELD_EVENTS.map((event) => {
              const ids = getEntryAthleteIds(event);
              return (
                <div key={event} className="lineup-event-row lineup-multi-row">
                  <span
                    className={`lineup-event-name clickable ${hoveredEvent === event ? "active" : ""}`}
                    onMouseEnter={() => handleMouseEnter(event)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {event}
                    {fieldProjectedPts[event] != null && (
                      <span className="event-projected-pts"> ({fieldProjectedPts[event]} pts)</span>
                    )}
                  </span>
                  <div className="lineup-multi-slots">
                    {[0, 1].map((slot) => {
                      const selectedId = ids[slot] ?? "";
                      const otherId = ids[slot === 0 ? 1 : 0] ?? "";
                      return (
                        <div key={slot} className="lineup-field-slot">
                          <SearchableSelect
                            className="lineup-athlete-select"
                            value={selectedId}
                            placeholder={`— slot ${slot + 1} —`}
                            onChange={(val) => handleSlotChange(event, slot, val, 2)}
                            options={athletes
                              .filter((a) => a.times.some((t) => t.event === event))
                              .sort((a, b) => {
                                const aTime = a.times.find((t) => t.event === event)?.time ?? 0;
                                const bTime = b.times.find((t) => t.event === event)?.time ?? 0;
                                return bTime - aTime;
                              })
                              .map((a) => {
                              const count = usedEventCounts.get(a._id) ?? 0;
                              const isAtLimit = count >= 4 && selectedId !== a._id;
                              const isOtherSlot = otherId === a._id;
                              const mark = a.times.find((t) => t.event === event)?.time;
                              const markStr = mark != null ? ` — ${formatMark(mark)}` : "";
                              return {
                                value: a._id,
                                label: a.name + markStr + (isAtLimit ? " [4 events]" : ""),
                                disabled: isAtLimit || isOtherSlot,
                              };
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Athlete roster summary */}
        <section className="lineup-section lineup-section-roster">
          {(() => {
            const DISTANCE_THRESHOLD = new Set(["800 Meters", "1500 Meters", "3000 Meters"]);

            const shortEvent = (e: string) =>
              e.replace(/(\d+) Meters?/g, "$1m").replace(" Hurdles", "H").replace(" Relay", "");

            // athleteId -> { name, allEvents: string[], hasDistance: boolean }
            type AthleteSummary = { name: string; allEvents: string[]; hasDistance: boolean; hasTrack: boolean };
            const map = new Map<string, AthleteSummary>();
            const ensure = (id: string, name: string): AthleteSummary => {
              if (!map.has(id)) map.set(id, { name, allEvents: [], hasDistance: false, hasTrack: false });
              return map.get(id)!;
            };
            const addEvent = (entry: AthleteSummary, label: string, isDistance: boolean) => {
              if (!entry.allEvents.includes(label)) entry.allEvents.push(label);
              if (isDistance) entry.hasDistance = true;
              entry.hasTrack = true;
            };

            // Individual track events
            for (const event of INDIVIDUAL_EVENTS) {
              for (const id of getEntryAthleteIds(event)) {
                if (!id) continue;
                const athlete = athletes.find((a) => a._id === id);
                if (!athlete) continue;
                const entry = ensure(id, athlete.name);
                addEvent(entry, shortEvent(event), DISTANCE_THRESHOLD.has(event));
              }
            }
            // Field events
            for (const event of FIELD_EVENTS) {
              for (const id of getEntryAthleteIds(event)) {
                if (!id) continue;
                const athlete = athletes.find((a) => a._id === id);
                if (!athlete) continue;
                const entry = ensure(id, athlete.name);
                if (!entry.allEvents.includes(event)) entry.allEvents.push(event);
              }
            }
            // Relay events — classify each athlete by their actual leg distance
            for (const event of RELAY_EVENTS) {
              const ids = getEntryAthleteIds(event);
              const legEvents = RELAY_LEG_EVENTS[event] ?? [];
              const seenInRelay = new Set<string>();
              ids.forEach((id, i) => {
                if (!id || seenInRelay.has(id)) return;
                seenInRelay.add(id);
                const athlete = athletes.find((a) => a._id === id);
                if (!athlete) return;
                const legEvent = legEvents[i] ?? "";
                const isDistanceLeg = DISTANCE_THRESHOLD.has(legEvent);
                const entry = ensure(id, athlete.name);
                const MEDLEY_EVENTS = new Set(["Sprint Medley Relay", "Distance Medley Relay"]);
                const legDist = MEDLEY_EVENTS.has(event) ? shortEvent(legEvent) : null;
                const label = legDist ? `${shortEvent(event)} (${legDist})` : shortEvent(event);
                addEvent(entry, label, isDistanceLeg);
              });
            }

            const totalEvents = (e: AthleteSummary) => e.allEvents.length;
            const byMostEvents = (a: AthleteSummary, b: AthleteSummary) =>
              totalEvents(b) - totalEvents(a) || a.name.localeCompare(b.name);

            const allEntries = Array.from(map.values()).sort(byMostEvents);
            // Each athlete appears in exactly one section
            const distanceAthletes = allEntries.filter((e) => e.hasDistance);
            const sprintAthletes = allEntries.filter((e) => !e.hasDistance && e.hasTrack);
            const fieldAthletes = allEntries.filter((e) => !e.hasTrack);

            if (allEntries.length === 0) return null;

            // Day color mapping keyed by shortEvent label
            const EVENT_DAY: Record<string, 1 | 2 | 3> = {
              "3000m": 1, "Discus Throw": 1, "4x800m": 1, "400m": 1, "High Jump": 1,
              "Distance Medley": 2, "4x200m": 2, "Shot Put": 2, "400mH": 2, "Long Jump": 2,
              "Sprint Medley": 3, "800m": 3, "Shuttle Hurdle": 3, "100m": 3, "100mH": 3, "200m": 3, "1500m": 3, "4x100m": 3, "4x400m": 3,
            };

            // Full sort order: day first, then shortest distance within day
            const EVENT_SORT_ORDER: string[] = [
              // Day 1
              "400m", "3000m", "High Jump", "Discus Throw", "4x800m",
              // Day 2
              "400mH", "Long Jump", "Shot Put", "4x200m", "Distance Medley",
              // Day 3
              "100m", "100mH", "200m", "800m", "1500m", "4x100m", "4x400m", "Sprint Medley", "Shuttle Hurdle",
            ];
            const eventSortKey = (label: string) => {
              const base = label.replace(/ \(.*\)$/, "");
              const i = EVENT_SORT_ORDER.indexOf(base);
              return i === -1 ? 999 : i;
            };
            const dayClass = (label: string) => {
              const base = label.replace(/ \(.*\)$/, "");
              const day = EVENT_DAY[base];
              return day ? `event-day-${day}` : "event-day-none";
            };

            const Section = ({ title, entries }: { title: string; entries: AthleteSummary[] }) =>
              entries.length === 0 ? null : (
                <div className="field-summary-section">
                  <div className="field-summary-section-title">{title}</div>
                  <ul className="field-summary-list">
                    {entries.map((entry) => (
                      <li key={entry.name} className="field-summary-row">
                        <span className="field-summary-name">{entry.name} <span className="field-summary-count">({totalEvents(entry)})</span></span>
                        <span className="field-summary-events">
                          {[...entry.allEvents].sort((a, b) => eventSortKey(a) - eventSortKey(b)).map((ev) => (
                            <span key={ev} className={`event-day-badge ${dayClass(ev)}`}>{ev}</span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );

            return (
              <div className="field-athlete-summary">
                <h3 className="lineup-section-title">📋 Athlete Roster</h3>
                <div className="event-day-key">
                  <span className="event-day-badge event-day-1">Day 1</span>
                  <span className="event-day-badge event-day-2">Day 2</span>
                  <span className="event-day-badge event-day-3">Day 3</span>
                </div>
                <Section title="Sprints & Hurdles" entries={sprintAthletes} />
                <Section title="Distance" entries={distanceAthletes} />
                <Section title="Field" entries={fieldAthletes} />
              </div>
            );
          })()}
        </section>
        </div>

        {/* Relay events */}
        <section className="lineup-section">
          <h3 className="lineup-section-title">🔄 Relay Events</h3>
          <div className="lineup-relay-rows">
            {RELAY_EVENTS.map((event) => {
              const legs = relayLegs.get(event) ?? [null, null, null, null];
              // Seed from DB if available and local state is empty
              const dbEntry = existingEntries.find(
                (e) => e.teamSlug === teamSlug && e.event === event
              );
              const effectiveLegs =
                legs.every((l) => l === null) && dbEntry
                  ? ([...dbEntry.athleteIds, null, null, null, null].slice(
                      0,
                      4
                    ) as (GenericId<"athletes"> | null)[])
                  : legs;

              return (
                <div key={event} className="lineup-relay-block">
                  <div className="lineup-relay-header">
                    <h4
                      className={`lineup-relay-name clickable ${hoveredEvent === event ? "active" : ""}`}
                      onMouseEnter={() => handleMouseEnter(event)}
                      onMouseLeave={handleMouseLeave}
                    >{event}
                      {relayProjectedPts[event] != null && (
                        <span className="event-projected-pts"> ({relayProjectedPts[event]} pts)</span>
                      )}
                    </h4>
                    {effectiveLegs.some((l) => l !== null) && (
                    <button
                      className="btn-clear-relay"
                      title="Clear relay"
                      onClick={() => {
                        setRelayLegs((prev) => {
                          const next = new Map(prev);
                          next.set(event, [null, null, null, null]);
                          return next;
                        });
                        setEntry({ meetId, teamSlug, event, athleteIds: [] });
                      }}
                    >Clear</button>
                    )}
                  </div>
                  <RelayEditor
                    meetId={meetId}
                    teamSlug={teamSlug}
                    event={event}
                    athletes={athletes}
                    legAthleteIds={effectiveLegs}
                    usedEventCounts={usedEventCounts}
                    teamOverrides={teamOverrides}
                    onAdjustedTotal={(total) => {
                      setRelayAdjustedTotals((prev) => {
                        if (prev.get(event) === total) return prev;
                        const next = new Map(prev);
                        next.set(event, total);
                        return next;
                      });
                    }}
                    onChange={(updated) => {
                      setRelayLegs((prev) => {
                        const next = new Map(prev);
                        next.set(event, updated);
                        return next;
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>

    {hoveredEvent && (() => {
      const isRelayEvent = RELAY_EVENTS.includes(hoveredEvent as any);
      const isFieldEvent = FIELD_EVENTS.includes(hoveredEvent as any);
      const rawRankings = rankingsMap.get(hoveredEvent) ?? [];
      // For relay events, replace own team's actual time with adjusted predicted time
      let displayRankings = rawRankings;
      if (isRelayEvent) {
        const adjustedTotal = relayAdjustedTotals.get(hoveredEvent);
        const withoutOwn = rawRankings.filter((r: any) => r.teamSlug !== teamSlug);
        const ownActual = rawRankings.find((r: any) => r.teamSlug === teamSlug);
        let ownTime: number | undefined;
        if (ownActual != null && adjustedTotal != null) {
          ownTime = Math.min(ownActual.time, adjustedTotal);
        } else if (adjustedTotal != null) {
          ownTime = adjustedTotal;
        } else if (ownActual != null) {
          ownTime = ownActual.time;
        }
        if (ownTime != null) {
          const ownEntry = { teamSlug, teamName: teamName.split(" ").slice(0, -1).join(" ") || teamName, time: ownTime };
          displayRankings = [...withoutOwn, ownEntry].sort((a: any, b: any) => a.time - b.time).slice(0, 8);
        } else {
          displayRankings = withoutOwn.slice(0, 8);
        }
      }
      return (
      <div
        className="event-ranking-panel"
        onMouseEnter={() => handleMouseEnter(hoveredEvent)}
        onMouseLeave={handleMouseLeave}
      >
        <div className="event-ranking-header">
          <h3>{hoveredEvent}</h3>
        </div>
        <p className="event-ranking-subtitle">Top 8 — All 4A Schools</p>
        {displayRankings.length === 0 ? (
          <p className="event-ranking-empty">No times recorded for this event.</p>
        ) : (
          <ol className="event-ranking-list">
            {displayRankings.map((r: any, i: number) => {
              const pts = PLACE_POINTS[i] ?? 0;
              const isOwn = r.teamSlug === teamSlug;
              const isRelay = !r.athleteName;
              return (
                <li
                  key={`${r.athleteName ?? r.teamSlug}-${r.teamSlug}-${i}`}
                  className={`event-ranking-row ${isOwn ? "own-team" : ""}`}
                >
                  <span className="rank-place">{i + 1}</span>
                  {isRelay ? (
                    <span className="rank-athlete rank-team-only">{r.teamName}</span>
                  ) : (
                    <>
                      <span className="rank-athlete">{r.athleteName}</span>
                      <span className="rank-team">{r.teamName}</span>
                    </>
                  )}
                  <span className="rank-time">
                    {isFieldEvent ? formatMark(r.time) : formatTime(r.time)}{r.estimated ? " (est.)" : ""}
                  </span>
                  <span className="rank-pts">{pts > 0 ? `${pts} pts` : ""}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      );
    })()}
    </div>
  );
}

// Points awarded for places 1-8
const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
