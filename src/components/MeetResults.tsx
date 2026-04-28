import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { formatMark, parseTime } from "../events";

interface Props {
  meetId: GenericId<"meets">;
  teams: { slug: string; name: string }[];
}

function fmt(s: number) {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2).padStart(5, "0");
    return `${m}:${sec}`;
  }
  return s.toFixed(2);
}

const FIELD_EVENTS = new Set(["High Jump", "Long Jump", "Shot Put", "Discus Throw"]);
const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

type PlaceRow = {
  place: number;
  athleteId: string;
  athleteName: string;
  teamSlug: string;
  value: number;
  estimated: boolean;
  points: number;
};

type EventResult = { event: string; places: PlaceRow[] };

function rerank(places: PlaceRow[]): PlaceRow[] {
  return places.map((p, i) => ({ ...p, place: i + 1, points: PLACE_POINTS[i] ?? 0 }));
}

export function MeetResults({ meetId, teams }: Props) {
  const results = useQuery(api.meets.simulate, { meetId });
  const savedSims = useQuery(api.meets.listSimulations, { meetId }) ?? [];
  const allAthletes = useQuery(api.athletes.listWithTimes, {}) ?? [];
  const allRelayTimes = useQuery(api.importData.listAllRelayTimes, {}) ?? [];
  const saveSimulation = useMutation(api.meets.saveSimulation);
  const updateSimulation = useMutation(api.meets.updateSimulation);
  const deleteSimulation = useMutation(api.meets.deleteSimulation);

  const [resultTab, setResultTab] = useState<"events" | "standings">("standings");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  // Manual overrides: event -> reordered PlaceRow[]
  const [overrides, setOverrides] = useState<Map<string, PlaceRow[]>>(new Map());
  const [confirmedEvents, setConfirmedEvents] = useState<Set<string>>(new Set());
  const dragSrc = useRef<{ event: string; idx: number } | null>(null);

  // Add-entry form state
  const [addFormEvent, setAddFormEvent] = useState<string | null>(null);
  const [addFormName, setAddFormName] = useState("");
  const [addFormTeam, setAddFormTeam] = useState("");
  const [addFormValue, setAddFormValue] = useState("");

  // Simulation save/load state
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"idle" | "new" | "rename">("idle");
  const [saveName, setSaveName] = useState("");

  // When simulate data updates, clear any overrides for events whose places changed
  useEffect(() => {
    if (!results) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const er of results.byEvent as EventResult[]) {
        const ov = next.get(er.event);
        if (ov && JSON.stringify(ov.map((p) => p.athleteId + p.teamSlug)) !==
            JSON.stringify(er.places.map((p: PlaceRow) => p.athleteId + p.teamSlug))) {
          next.delete(er.event);
        }
      }
      return next;
    });
    // If loaded sim is now stale (athlete set changed), keep overrides as-is
  }, [results]);

  const teamName = (slug: string) => {
    const full = teams.find((t) => t.slug === slug)?.name ?? slug;
    const words = full.split(" ");
    return words.length > 1 ? words.slice(0, -1).join(" ") : full;
  };

  if (!results) return <div className="loading-msg">Simulating…</div>;

  const { byEvent: rawByEvent, teamStandings: rawStandings } = results as {
    byEvent: EventResult[];
    teamStandings: { teamSlug: string; points: number }[];
  };

  // Apply manual overrides to byEvent
  const byEvent: EventResult[] = rawByEvent.map((er) => ({
    ...er,
    places: overrides.get(er.event) ?? er.places,
  }));

  // Recompute team standings from (possibly overridden) byEvent
  const pointMap = new Map<string, number>();
  for (const t of rawStandings) pointMap.set(t.teamSlug, 0);
  for (const er of byEvent) {
    for (const p of er.places) {
      pointMap.set(p.teamSlug, (pointMap.get(p.teamSlug) ?? 0) + p.points);
    }
  }
  const teamStandings = [...pointMap.entries()]
    .map(([teamSlug, points]) => ({ teamSlug, points }))
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);

  const hasChanges = overrides.size > 0;
  const activeSim = savedSims.find((s) => s._id === activeSimId);
  const isDirty = hasChanges || (activeSim && JSON.stringify(
    (activeSim.eventOverrides ?? []).map((e: { event: string }) => e.event).sort()
  ) !== JSON.stringify([...overrides.keys()].sort()));

  function handleDragStart(event: string, idx: number) {
    dragSrc.current = { event, idx };
  }

  function handleDrop(event: string, dropIdx: number) {
    if (!dragSrc.current || dragSrc.current.event !== event) return;
    const srcIdx = dragSrc.current.idx;
    if (srcIdx === dropIdx) return;
    const base = overrides.get(event) ?? (rawByEvent.find((e) => e.event === event)?.places ?? []);
    const reordered = [...base];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setOverrides((prev) => new Map(prev).set(event, rerank(reordered)));
    dragSrc.current = null;
  }

  function buildEventOverrides() {
    return [...overrides.entries()].map(([event, places]) => ({ event, places }));
  }

  async function handleSaveNew() {
    if (!saveName.trim()) return;
    const id = await saveSimulation({ meetId, name: saveName.trim(), eventOverrides: buildEventOverrides() });
    setActiveSimId(id);
    setSaveMode("idle");
    setSaveName("");
  }

  async function handleUpdate() {
    if (!activeSimId) return;
    await updateSimulation({ simulationId: activeSimId as GenericId<"meetSimulations">, name: activeSim?.name ?? "", eventOverrides: buildEventOverrides() });
  }

  async function handleRename() {
    if (!activeSimId || !saveName.trim()) return;
    await updateSimulation({ simulationId: activeSimId as GenericId<"meetSimulations">, name: saveName.trim(), eventOverrides: buildEventOverrides() });
    setSaveMode("idle");
    setSaveName("");
  }

  async function handleDelete(simId: string) {
    await deleteSimulation({ simulationId: simId as GenericId<"meetSimulations"> });
    if (activeSimId === simId) {
      setActiveSimId(null);
      setOverrides(new Map());
    }
  }

  function loadSimulation(sim: typeof savedSims[0]) {
    const map = new Map<string, PlaceRow[]>();
    for (const eo of sim.eventOverrides) map.set(eo.event, eo.places as PlaceRow[]);
    setOverrides(map);
    setActiveSimId(sim._id);
  }

  function clearToAuto() {
    setOverrides(new Map());
    setActiveSimId(null);
  }

  return (
    <div className="meet-results">

      {/* Simulations toolbar */}
      <div className="sim-toolbar">
        <div className="sim-toolbar-left">
          <span className="sim-label">Simulation:</span>
          {activeSim
            ? <span className="sim-active-name">{activeSim.name}</span>
            : <span className="sim-active-name sim-auto">Auto</span>
          }
          {(activeSim || hasChanges) && (
            <button className="btn-sim-clear" onClick={clearToAuto}>✕ Clear</button>
          )}
        </div>
        <div className="sim-toolbar-right">
          {activeSim && (
            <button className="btn-sim-action" onClick={handleUpdate}>💾 Update</button>
          )}
          {saveMode === "new" ? (
            <span className="sim-save-inline">
              <input
                autoFocus
                className="sim-name-input"
                placeholder="Simulation name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveNew(); if (e.key === "Escape") { setSaveMode("idle"); setSaveName(""); } }}
              />
              <button className="btn-sim-action" onClick={handleSaveNew}>Save</button>
              <button className="btn-sim-cancel" onClick={() => { setSaveMode("idle"); setSaveName(""); }}>Cancel</button>
            </span>
          ) : (
            <button className="btn-sim-action" onClick={() => setSaveMode("new")}>💾 Save as…</button>
          )}
        </div>
      </div>

      {/* Saved simulations list */}
      {savedSims.length > 0 && (
        <div className="sim-list">
          {savedSims.map((sim) => (
            <div key={sim._id} className={`sim-chip${sim._id === activeSimId ? " active" : ""}`}>
              {saveMode === "rename" && activeSimId === sim._id ? (
                <>
                  <input
                    autoFocus
                    className="sim-name-input"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setSaveMode("idle"); setSaveName(""); } }}
                  />
                  <button className="btn-sim-chip-action" onClick={handleRename}>✓</button>
                  <button className="btn-sim-chip-cancel" onClick={() => { setSaveMode("idle"); setSaveName(""); }}>✕</button>
                </>
              ) : (
                <>
                  <button className="btn-sim-chip-load" onClick={() => loadSimulation(sim)}>{sim.name}</button>
                  <button className="btn-sim-chip-action" title="Rename" onClick={() => { setActiveSimId(sim._id); setSaveName(sim.name); setSaveMode("rename"); }}>✎</button>
                  <button className="btn-sim-chip-del" title="Delete" onClick={() => handleDelete(sim._id)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="results-tabs">
        <button
          className={resultTab === "standings" ? "result-tab active" : "result-tab"}
          onClick={() => setResultTab("standings")}
        >
          Team Standings
        </button>
        <button
          className={resultTab === "events" ? "result-tab active" : "result-tab"}
          onClick={() => setResultTab("events")}
        >
          By Event
        </button>
      </div>

      {resultTab === "standings" && (
        <div className="standings-table-wrap">
          {teamStandings.length === 0 ? (
            <p className="empty-msg">No entries yet — fill in lineups to see standings.</p>
          ) : (
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Team</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {teamStandings.map((row, i) => (
                  <tr key={row.teamSlug} className={i === 0 ? "gold-row" : ""}>
                    <td>{i + 1}</td>
                    <td>{teamName(row.teamSlug)}</td>
                    <td><strong>{row.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {resultTab === "events" && (
        <div className="event-results-list">
          {byEvent.length === 0 && (
            <p className="empty-msg">No event entries yet.</p>
          )}
          {byEvent.map((er) => {
            const isOverridden = overrides.has(er.event);
            return (
            <div key={er.event} className={`event-result-block${confirmedEvents.has(er.event) ? " event-confirmed" : ""}`}>
              <div className="event-result-header">
                <button
                  className={`btn-confirm-event${confirmedEvents.has(er.event) ? " confirmed" : ""}`}
                  title={confirmedEvents.has(er.event) ? "Mark as unconfirmed" : "Mark as confirmed"}
                  onClick={() => {
                    setConfirmedEvents(prev => {
                      const next = new Set(prev);
                      if (next.has(er.event)) {
                        next.delete(er.event);
                      } else {
                        next.add(er.event);
                        setExpandedEvent(exp => exp === er.event ? null : exp);
                      }
                      return next;
                    });
                  }}
                >✓</button>
                <button
                  className="event-result-toggle"
                  onClick={() =>
                    setExpandedEvent(expandedEvent === er.event ? null : er.event)
                  }
                >
                <span className="event-result-name">
                  {er.event}
                  {isOverridden && <span className="manual-order-badge"> ✎</span>}
                </span>
                <span className="event-result-winner">
                  {er.places[0]
                    ? er.event.toLowerCase().includes("relay")
                      ? `1st: ${er.places[0].athleteName}`
                      : `1st: ${er.places[0].athleteName} — ${teamName(er.places[0].teamSlug)}`
                    : "No entries"}
                </span>
                <span className="event-result-chevron">
                  {expandedEvent === er.event ? "▲" : "▼"}
                </span>
                </button>
              </div>

              {expandedEvent === er.event && (
                <>
                <table className="event-results-table">
                  <thead>
                    <tr>
                      <th className="drag-handle-col"></th>
                      <th>Place</th>
                      <th>Athlete / Team</th>
                      <th>{FIELD_EVENTS.has(er.event) ? "Mark" : "Time"}</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {er.places.map((p, idx) => (
                      <tr
                        key={`${p.teamSlug}-${idx}`}
                        draggable
                        onDragStart={() => handleDragStart(er.event, idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(er.event, idx)}
                        className="draggable-row"
                      >
                        <td className="drag-handle-col">
                          <span className="drag-handle" title="Drag to reorder">⠿</span>
                        </td>
                        <td>{p.place}</td>
                        <td>
                          <div className="result-athlete">
                            <span>{p.athleteName}</span>
                            <span className="result-team">{teamName(p.teamSlug)}</span>
                          </div>
                        </td>
                        <td>
                          {FIELD_EVENTS.has(er.event)
                            ? formatMark(p.value)
                            : fmt(p.value)}
                          {p.estimated && (
                            <span className="estimated-label"> (est.)</span>
                          )}
                        </td>
                        <td><strong>{p.points}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isOverridden && (
                  <button
                    className="btn-reset-order"
                    onClick={() => setOverrides((prev) => { const n = new Map(prev); n.delete(er.event); return n; })}
                  >
                    ↺ Reset to auto order
                  </button>
                )}
                <div className="add-entry-section">
                  {addFormEvent !== er.event ? (
                    <button
                      className="btn-add-entry"
                      onClick={() => {
                        setAddFormEvent(er.event);
                        setAddFormName("");
                        const defaultTeam = teams[0]?.slug ?? "";
                        setAddFormTeam(defaultTeam);
                        setAddFormValue("");
                      }}
                    >+ Add entry</button>
                  ) : (
                    <div className="add-entry-row">
                      <select
                        className="add-entry-team"
                        value={addFormTeam}
                        onChange={(e) => { setAddFormTeam(e.target.value); setAddFormName(""); }}
                      >
                        {(() => {
                          const isRelay = er.event.toLowerCase().includes("relay");
                          const alreadyIn = new Set(er.places.map((p) => p.teamSlug));
                          if (isRelay) {
                            return teams
                              .filter((t) => !alreadyIn.has(t.slug))
                              .map((t) => ({
                                slug: t.slug,
                                pr: allRelayTimes.find((r: { team: string; event: string; time: number }) => r.team === t.slug && r.event === er.event)?.time ?? Infinity,
                              }))
                              .sort((a, b) => a.pr - b.pr)
                              .map((t) => {
                                const label = teamName(t.slug);
                                return (
                                  <option key={t.slug} value={t.slug}>
                                    {label}{t.pr !== Infinity ? ` (${fmt(t.pr)})` : ""}
                                  </option>
                                );
                              });
                          }
                          return teams.map((t) => (
                            <option key={t.slug} value={t.slug}>{teamName(t.slug)}</option>
                          ));
                        })()}
                      </select>
                      {!er.event.toLowerCase().includes("relay") && (
                        <select
                          className="add-entry-name"
                          value={addFormName}
                          onChange={(e) => setAddFormName(e.target.value)}
                        >
                          <option value="">— select athlete —</option>
                          {(() => {
                            const alreadyIn = new Set(er.places.map((p) => p.athleteName));
                            return allAthletes
                              .filter((a) => a.team === addFormTeam && !alreadyIn.has(a.name))
                              .map((a) => ({
                                name: a.name,
                                pr: a.times.find((t: { event: string; time: number }) => t.event === er.event)?.time ?? Infinity,
                              }))
                              .sort((a, b) => a.pr - b.pr)
                              .map((a) => (
                                <option key={a.name} value={a.name}>
                                  {a.name}{a.pr !== Infinity ? ` (${fmt(a.pr)})` : ""}
                                </option>
                              ));
                          })()}
                        </select>
                      )}
                      <input
                        className="add-entry-value"
                        placeholder={FIELD_EVENTS.has(er.event) ? "Mark (m, e.g. 5.50)" : "Time (e.g. 12.34)"}
                        value={addFormValue}
                        onChange={(e) => setAddFormValue(e.target.value)}
                      />
                      <button
                        className="btn-add-entry-confirm"
                        onClick={() => {
                          const isRelay = er.event.toLowerCase().includes("relay");
                          const name = isRelay ? teamName(addFormTeam) : addFormName.trim();
                          const parsed = FIELD_EVENTS.has(er.event)
                            ? parseFloat(addFormValue)
                            : parseTime(addFormValue);
                          if (!name || parsed === null || isNaN(parsed as number)) return;
                          const cur = overrides.get(er.event) ?? rawByEvent.find((e) => e.event === er.event)?.places ?? [];
                          const newRow: PlaceRow = {
                            place: cur.length + 1,
                            athleteId: `manual-${er.event}-${Date.now()}`,
                            athleteName: name,
                            teamSlug: addFormTeam,
                            value: parsed as number,
                            estimated: false,
                            points: 0,
                          };
                          const combined = [...cur, newRow];
                          const isField = FIELD_EVENTS.has(er.event);
                          combined.sort((a, b) => isField ? b.value - a.value : a.value - b.value);
                          setOverrides((prev) => new Map(prev).set(er.event, rerank(combined)));
                          setAddFormEvent(null);
                        }}
                      >Add</button>
                      <button className="btn-add-entry-cancel" onClick={() => setAddFormEvent(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                </>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
