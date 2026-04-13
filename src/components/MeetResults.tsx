import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { formatMark } from "../events";

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

export function MeetResults({ meetId, teams }: Props) {
  const results = useQuery(api.meets.simulate, { meetId });
  const [resultTab, setResultTab] = useState<"events" | "standings">("standings");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const teamName = (slug: string) =>
    teams.find((t) => t.slug === slug)?.name ?? slug;

  if (!results) return <div className="loading-msg">Simulating…</div>;

  const { byEvent, teamStandings } = results;

  return (
    <div className="meet-results">
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
          {byEvent.map((er) => (
            <div key={er.event} className="event-result-block">
              <button
                className="event-result-header"
                onClick={() =>
                  setExpandedEvent(expandedEvent === er.event ? null : er.event)
                }
              >
                <span className="event-result-name">{er.event}</span>
                <span className="event-result-winner">
                  {er.places[0]
                    ? `1st: ${er.places[0].athleteName} (${teamName(er.places[0].teamSlug)})`
                    : "No entries"}
                </span>
                <span className="event-result-chevron">
                  {expandedEvent === er.event ? "▲" : "▼"}
                </span>
              </button>

              {expandedEvent === er.event && (
                <table className="event-results-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th>Athlete / Team</th>
                      <th>{FIELD_EVENTS.has(er.event) ? "Mark (m)" : "Time"}</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {er.places.map((p) => (
                      <tr key={`${p.teamSlug}-${p.place}`}>
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
