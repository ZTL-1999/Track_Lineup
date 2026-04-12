import type { GenericId } from "convex/values";

const EVENT_ABBREV: Record<string, string> = {
  "100 Meters": "100",
  "200 Meters": "200",
  "400 Meters": "400",
  "800 Meters": "800",
  "1500 Meters": "1500",
  "3000 Meters": "3000",
  "100 Meter Hurdles": "100H",
  "400 Meter Hurdles": "400H",
  "Long Jump": "LJ",
  "Triple Jump": "TJ",
  "High Jump": "HJ",
  "Pole Vault": "PV",
  "Shot Put": "SP",
  "Discus Throw": "DT",
  "Javelin Throw": "JT",
  "4x100 Meter Relay": "4×100",
  "4x200 Meter Relay": "4×200",
  "4x400 Meter Relay": "4×400",
  "4x800 Meter Relay": "4×800",
  "Sprint Medley Relay": "SMR",
  "Distance Medley Relay": "DMR",
};

const SHORT_DISTANCE_EVENTS = new Set([
  "100 Meters",
  "200 Meters",
  "400 Meters",
  "100 Meter Hurdles",
  "400 Meter Hurdles",
]);

const LONG_DISTANCE_EVENTS = new Set([
  "800 Meters",
  "1500 Meters",
  "3000 Meters",
]);

function classifyAthlete(times: { event: string }[]): "short" | "long" | "none" {
  const shortCount = times.filter((t) => SHORT_DISTANCE_EVENTS.has(t.event)).length;
  const longCount = times.filter((t) => LONG_DISTANCE_EVENTS.has(t.event)).length;
  if (shortCount === 0 && longCount === 0) return "none";
  // Ties favor distance — sprinters rarely run 800m+, but distance runners often have a 400m entry
  if (longCount > 0 && longCount >= shortCount) return "long";
  return "short";
}

interface AthleteListProps {
  athletes: {
    _id: GenericId<"athletes">;
    name: string;
    grade?: string;
    times: { event: string; time: number }[];
  }[];
  selectedAthleteId: GenericId<"athletes"> | null;
  onSelect: (id: GenericId<"athletes">) => void;
}

function AthleteRow({
  athlete,
  selected,
  onSelect,
}: {
  athlete: AthleteListProps["athletes"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  const abbrevs = athlete.times
    .map((t) => EVENT_ABBREV[t.event] ?? t.event)
    .join(" · ");
  return (
    <li
      className={`athlete-item ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="athlete-info">
        <div className="athlete-name-row">
          <span className="athlete-name">{athlete.name}</span>
          {athlete.grade && <span className="athlete-grade">Gr. {athlete.grade}</span>}
        </div>
        <span className="athlete-event-count">
          {athlete.times.length} event{athlete.times.length !== 1 ? "s" : ""}
          {abbrevs && <span className="athlete-event-tags">{abbrevs}</span>}
        </span>
      </div>
    </li>
  );
}

export function AthleteList({ athletes, selectedAthleteId, onSelect }: AthleteListProps) {
  const shortRunners = athletes.filter((a) => classifyAthlete(a.times) === "short");
  const longRunners = athletes.filter((a) => classifyAthlete(a.times) === "long");
  const otherRunners = athletes.filter((a) => classifyAthlete(a.times) === "none");

  const renderList = (group: typeof athletes) =>
    group.map((a) => (
      <AthleteRow
        key={a._id}
        athlete={a}
        selected={selectedAthleteId === a._id}
        onSelect={() => onSelect(a._id)}
      />
    ));

  return (
    <div className="athlete-list">
      {athletes.length === 0 ? (
        <p className="empty-msg">No athletes added yet.</p>
      ) : (
        <>
          <div className="athlete-list-columns">
            <div className="athlete-list-section">
              <h4 className="athlete-list-section-header">
                ⚡ Sprints &amp; Hurdles
                <span className="section-count">{shortRunners.length}</span>
              </h4>
              {shortRunners.length === 0 ? (
                <p className="empty-msg">None yet.</p>
              ) : (
                <ul>{renderList(shortRunners)}</ul>
              )}
            </div>

            <div className="athlete-list-section">
              <h4 className="athlete-list-section-header">
                🏃 Distance
                <span className="section-count">{longRunners.length}</span>
              </h4>
              {longRunners.length === 0 ? (
                <p className="empty-msg">None yet.</p>
              ) : (
                <ul>{renderList(longRunners)}</ul>
              )}
            </div>
          </div>

          {otherRunners.length > 0 && (
            <div className="athlete-list-section">
              <h4 className="athlete-list-section-header">
                Other
                <span className="section-count">{otherRunners.length}</span>
              </h4>
              <ul>{renderList(otherRunners)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
