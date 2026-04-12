import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { GenericId } from "convex/values";
import { AddAthlete } from "./components/AddAthlete";
import { AthleteList } from "./components/AthleteList";
import { AthleteTimes } from "./components/AthleteTimes";
import { RelayBuilder } from "./components/RelayBuilder";
import { EventRankings } from "./components/EventRankings";
import "./App.css";

type Tab = "roster" | "relays" | "rankings";

function App() {
  const [tab, setTab] = useState<Tab>("roster");
  const [selectedTeam, setSelectedTeam] = useState<string | undefined>(undefined);
  const [selectedAthleteId, setSelectedAthleteId] =
    useState<GenericId<"athletes"> | null>(null);
  const teams = useQuery(api.teams.list) ?? [];
  const athletes = useQuery(api.athletes.listWithTimes, { team: selectedTeam }) ?? [];

  const selectedAthlete =
    athletes.find((a) => a._id === selectedAthleteId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏃‍♀️ Iowa Girls Track &amp; Field Lineup</h1>
        <p className="subtitle">State Meet Event Manager</p>
        <div className="team-selector">
          <select
            value={selectedTeam ?? ""}
            onChange={(e) => {
              setSelectedTeam(e.target.value || undefined);
              setSelectedAthleteId(null);
            }}
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
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
      </main>
    </div>
  );
}

export default App;
