import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { LineupEditor } from "./LineupEditor";
import { MeetResults } from "./MeetResults";

const MEDAL = ["🥇", "🥈", "🥉"];

interface Props {
  meetId: GenericId<"meets">;
  onBack: () => void;
}

export function MeetDetail({ meetId, onBack }: Props) {
  const meet = useQuery(api.meets.get, { meetId });
  const allTeams = useQuery(api.teams.list) ?? [];
  const addTeam = useMutation(api.meets.addTeam);
  const removeTeam = useMutation(api.meets.removeTeam);
  const simulation = useQuery(api.meets.getProjectedTotals, { meetId });

  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [addTeamSlug, setAddTeamSlug] = useState("");
  const [showFullStandings, setShowFullStandings] = useState(false);

  if (!meet) return <div className="loading-msg">Loading meet…</div>;

  const availableTeams = allTeams.filter(
    (t) => !meet.teamSlugs.includes(t.slug)
  );

  const teamName = (slug: string) =>
    allTeams.find((t) => t.slug === slug)?.name ?? slug;

  if (editingTeam) {
    return (
      <LineupEditor
        meetId={meetId}
        teamSlug={editingTeam}
        teamName={teamName(editingTeam)}
        onBack={() => setEditingTeam(null)}
      />
    );
  }

  return (
    <div className="meet-detail">
      <div className="meet-detail-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div>
          <h2 className="meet-title">{meet.name}</h2>
          {meet.date && <span className="meet-date">{meet.date}</span>}
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowResults((v) => !v)}
        >
          {showResults ? "Hide Results" : "▶ Simulate"}
        </button>
      </div>

      {showResults && (
        <MeetResults meetId={meetId} teams={allTeams} />
      )}

      {meet.teamSlugs.length > 0 && (
        <div className="meet-scoresheet card">
          <div className="scoresheet-title-row">
            <h3 className="scoresheet-title">Projected Score Sheet</h3>
          </div>
          {!simulation ? (
            <p className="empty-msg">Calculating…</p>
          ) : (() => {
            const standings = Object.entries(simulation)
              .map(([slug, pts]) => ({ slug, pts }))
              .sort((a, b) => b.pts - a.pts)
              .filter((r) => r.pts > 0);
            const visibleStandings = showFullStandings ? standings : standings.slice(0, 10);
            const cols = showFullStandings
              ? (() => { const half = Math.ceil(standings.length / 2); return [0,1].map(i => ({ col: standings.slice(i*half, (i+1)*half), offset: i*half })); })()
              : [{ col: visibleStandings.slice(0, 10), offset: 0 }];
            return standings.every((r) => r.pts === 0) ? (
              <p className="empty-msg">No lineups entered yet — fill in lineups to see scores.</p>
            ) : (
              <>
              <div className={showFullStandings ? "standings-two-col" : "standings-one-col"}>
                {cols.map(({ col, offset }, colIdx) => (
                  <table key={colIdx} className="standings-table">
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Team</th>
                        <th style={{ textAlign: "right" }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {col.map((row, i) => {
                        const globalIdx = offset + i;
                        return (
                          <tr key={row.slug} className={globalIdx === 0 && row.pts > 0 ? "gold-row" : ""}>
                            <td style={{ width: 36 }}>
                              {row.pts > 0
                                ? (MEDAL[globalIdx] ?? <span style={{ color: "var(--text-light)" }}>{globalIdx + 1}</span>)
                                : <span style={{ color: "var(--text-light)" }}>—</span>}
                            </td>
                            <td>{teamName(row.slug)}</td>
                            <td style={{ textAlign: "right" }}><strong>{row.pts}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
              {standings.length > 10 && (
                <button className="btn-show-full-standings" onClick={() => setShowFullStandings(v => !v)}>
                  {showFullStandings ? "Show top 10" : `Show full list (${standings.length} teams)`}
                </button>
              )}
              </>
            );
          })()}
        </div>
      )}

      <div className="meet-teams-section">
        <h3>Teams ({meet.teamSlugs.length})</h3>

        {meet.teamSlugs.length === 0 && (
          <p className="empty-msg">No teams added yet.</p>
        )}

        <div className="team-rows">
          {meet.teamSlugs.map((slug) => (
            <div key={slug} className="team-row card">
              <span className="team-row-name">{teamName(slug)}</span>
              <div className="team-row-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setEditingTeam(slug)}
                >
                  Fill Lineup →
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`Remove ${teamName(slug)} from this meet?`)) {
                      removeTeam({ meetId, teamSlug: slug });
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {availableTeams.length > 0 && (
          <div className="add-team-row">
            <select
              value={addTeamSlug}
              onChange={(e) => setAddTeamSlug(e.target.value)}
              className="add-team-select"
            >
              <option value="">— Add a team —</option>
              {availableTeams.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              disabled={!addTeamSlug}
              onClick={() => {
                if (addTeamSlug) {
                  addTeam({ meetId, teamSlug: addTeamSlug });
                  setAddTeamSlug("");
                }
              }}
            >
              Add Team
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
