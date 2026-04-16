import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { GenericId } from "convex/values";
import { AddAthlete } from "./components/AddAthlete";
import { AthleteList } from "./components/AthleteList";
import { AthleteTimes } from "./components/AthleteTimes";
import { RelayBuilder } from "./components/RelayBuilder";
import { EventRankings } from "./components/EventRankings";
import { MeetList } from "./components/MeetList";
import "./App.css";

type Tab = "roster" | "relays" | "rankings" | "meets";

function App() {
  const [tab, setTab] = useState<Tab>("roster");
  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [selectedAthleteId, setSelectedAthleteId] =
    useState<GenericId<"athletes"> | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamUrl, setNewTeamUrl] = useState("");
  const upsertTeam = useMutation(api.teams.upsert);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const teams = useQuery(api.teams.list) ?? [];
  const athletes = useQuery(api.athletes.listWithTimes, { team: selectedTeam }) ?? [];

  const selectedAthlete =
    athletes.find((a) => a._id === selectedAthleteId) ?? null;

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(teamSearch.toLowerCase())
  );
  const selectedTeamName = teams.find((t) => t.slug === selectedTeam)?.name ?? "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setTeamSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏃‍♀️ Iowa Girls Track &amp; Field Lineup</h1>
        <p className="subtitle">State Meet Event Manager</p>
        <div className="team-selector" ref={dropdownRef}>
            <button
              className="team-selector-btn"
              onClick={() => {
                setDropdownOpen((o) => !o);
                setTeamSearch("");
              }}
            >
              {selectedTeamName || "Select a team…"}
              <span className="team-selector-caret">{dropdownOpen ? "▲" : "▼"}</span>
            </button>
            {dropdownOpen && (
              <div className="team-dropdown">
                <input
                  className="team-search-input"
                  type="text"
                  placeholder="Search teams…"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  autoFocus
                />
                <ul className="team-dropdown-list">
                  {filteredTeams.length === 0 && (
                    <li className="team-dropdown-empty">No teams found</li>
                  )}
                  {filteredTeams.map((t) => (
                    <li
                      key={t.slug}
                      className={`team-dropdown-item${selectedTeam === t.slug ? " active" : ""}`}
                      onClick={() => {
                        setSelectedTeam(t.slug);
                        setSelectedAthleteId(null);
                        setDropdownOpen(false);
                        setTeamSearch("");
                      }}
                    >
                      {t.name}
                    </li>
                  ))}
                </ul>
                {!addingTeam ? (
                  <button className="btn-add-team-inline" onClick={() => setAddingTeam(true)}>+ Add team</button>
                ) : (
                  <div className="add-team-form">
                    <input
                      className="team-search-input"
                      type="text"
                      placeholder="Team name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                    />
                    <input
                      className="team-search-input"
                      type="text"
                      placeholder="Gobound URL (optional)"
                      value={newTeamUrl}
                      onChange={(e) => setNewTeamUrl(e.target.value)}
                    />
                    <div className="add-team-form-actions">
                      <button
                        className="btn-primary btn-sm"
                        disabled={!newTeamName.trim()}
                        onClick={async () => {
                          const slug = newTeamName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                          await upsertTeam({ slug, name: newTeamName.trim(), url: newTeamUrl.trim() });
                          setSelectedTeam(slug);
                          setNewTeamName("");
                          setNewTeamUrl("");
                          setAddingTeam(false);
                          setDropdownOpen(false);
                        }}
                      >Save</button>
                      <button className="btn-secondary btn-sm" onClick={() => { setAddingTeam(false); setNewTeamName(""); setNewTeamUrl(""); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      </header>

      <nav className="tabs">
        <button
          className={tab === "roster" ? "tab active" : "tab"}
          onClick={() => setTab("roster")}
        >
          Roster &amp; Times
        </button>
        <button
          className={tab === "relays" ? "tab active" : "tab"}
          onClick={() => setTab("relays")}
        >
          Relay Builder
        </button>
        <button
          className={tab === "rankings" ? "tab active" : "tab"}
          onClick={() => setTab("rankings")}
        >
          Event Rankings
        </button>
        <button
          className={tab === "meets" ? "tab active" : "tab"}
          onClick={() => setTab("meets")}
        >
          Meets
        </button>
      </nav>

      <main className="main-content">
        {tab === "roster" && (
          <div className="roster-view">
            <AddAthlete team={selectedTeam} />
            <div className="roster-layout">
              <AthleteList
                athletes={athletes}
                selectedAthleteId={selectedAthleteId}
                onSelect={(id) =>
                  setSelectedAthleteId(
                    id === selectedAthleteId ? null : id
                  )
                }
              />
              {selectedAthlete && (
                <AthleteTimes
                  athlete={selectedAthlete}
                  onClose={() => setSelectedAthleteId(null)}
                />
              )}
            </div>
          </div>
        )}

        {tab === "relays" && <RelayBuilder athletes={athletes} />}

        {tab === "rankings" && <EventRankings athletes={athletes} />}

        {tab === "meets" && <MeetList />}
      </main>
    </div>
  );
}

export default App;
