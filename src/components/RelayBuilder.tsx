import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import {
  RELAY_EVENTS,
  RELAY_LEG_EVENTS,
  RELAY_LEG_LABELS,
  formatTime,
} from "../events";
import { useState } from "react";

interface AthleteWithTimes {
  _id: GenericId<"athletes">;
  name: string;
  grade?: string;
  times: { event: string; time: number }[];
}

interface RelayBuilderProps {
  athletes: AthleteWithTimes[];
}

export function RelayBuilder({ athletes }: RelayBuilderProps) {
  const [selectedRelay, setSelectedRelay] = useState<string>(RELAY_EVENTS[0]);
  const assignments = useQuery(api.relays.getAssignments, {
    relayEvent: selectedRelay,
  });
  const setRelayLeg = useMutation(api.relayMutations.setRelayLeg);
  const removeRelayLeg = useMutation(api.relayMutations.removeRelayLeg);
  const clearRelay = useMutation(api.relayMutations.clearRelay);

  const legEvents = RELAY_LEG_EVENTS[selectedRelay];
  const legLabels = RELAY_LEG_LABELS[selectedRelay];

  const getAssignmentForLeg = (leg: number) =>
    assignments?.find((a) => a.leg === leg);

  const getAthleteTime = (athlete: AthleteWithTimes, event: string) =>
    athlete.times.find((t) => t.event === event)?.time;

  // Calculate projected relay time
  const calculateRelayTime = () => {
    if (!assignments || !legEvents) return null;
    let total = 0;
    for (let leg = 1; leg <= 4; leg++) {
      const assignment = getAssignmentForLeg(leg);
      if (!assignment?.athlete) return null;
      const athlete = athletes.find((a) => a._id === assignment.athleteId);
      if (!athlete) return null;
      const legEvent = legEvents[leg - 1];
      const time = getAthleteTime(athlete, legEvent);
      if (time === undefined) return null;
      total += time;
    }
    return total;
  };

  // Simulate swapping an athlete and show impact
  const simulateSwap = (leg: number, newAthleteId: GenericId<"athletes">) => {
    if (!assignments || !legEvents) return null;
    const currentTotal = calculateRelayTime();
    if (currentTotal === null) return null;

    let newTotal = 0;
    for (let l = 1; l <= 4; l++) {
      let athleteId: GenericId<"athletes">;
      if (l === leg) {
        athleteId = newAthleteId;
      } else {
        const assignment = getAssignmentForLeg(l);
        if (!assignment?.athlete) return null;
        athleteId = assignment.athleteId;
      }
      const athlete = athletes.find((a) => a._id === athleteId);
      if (!athlete) return null;
      const time = getAthleteTime(athlete, legEvents[l - 1]);
      if (time === undefined) return null;
      newTotal += time;
    }

    return {
      newTotal,
      diff: newTotal - currentTotal,
    };
  };

  // Get athletes sorted by their time in the relevant event for a leg
  const getSortedAthletesForLeg = (legIndex: number) => {
    const event = legEvents[legIndex];
    return [...athletes]
      .map((a) => ({
        ...a,
        relevantTime: getAthleteTime(a, event),
      }))
      .sort((a, b) => {
        if (a.relevantTime === undefined && b.relevantTime === undefined) return 0;
        if (a.relevantTime === undefined) return 1;
        if (b.relevantTime === undefined) return -1;
        return a.relevantTime - b.relevantTime;
      });
  };

  const relayTime = calculateRelayTime();
  const assignedAthleteIds = assignments
    ?.map((a) => a.athleteId)
    .filter(Boolean) ?? [];

  return (
    <div className="relay-builder">
      <div className="relay-header">
        <h3>Relay Builder</h3>
        <div className="relay-controls">
          <select
            value={selectedRelay}
            onChange={(e) => setSelectedRelay(e.target.value)}
            className="relay-select"
          >
            {RELAY_EVENTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            className="clear-btn"
            onClick={() => clearRelay({ relayEvent: selectedRelay })}
          >
            Clear
          </button>
        </div>
      </div>

      {relayTime !== null && (
        <div className="relay-total">
          <span className="total-label">Projected Relay Time:</span>
          <span className="total-time">{formatTime(relayTime)}</span>
        </div>
      )}

      <div className="relay-legs">
        {[1, 2, 3, 4].map((leg) => {
          const assignment = getAssignmentForLeg(leg);
          const legLabel = legLabels[leg - 1];
          const legEvent = legEvents[leg - 1];
          const sortedAthletes = getSortedAthletesForLeg(leg - 1);

          return (
            <div key={leg} className="relay-leg">
              <div className="leg-header">
                <span className="leg-label">{legLabel}</span>
                {assignment?.athlete && (
                  <button
                    className="remove-leg-btn"
                    onClick={() =>
                      removeRelayLeg({ relayEvent: selectedRelay, leg })
                    }
                  >
                    &times;
                  </button>
                )}
              </div>

              {assignment?.athlete ? (
                <div className="leg-assignment">
                  <span className="assigned-name">
                    {assignment.athlete.name}
                  </span>
                  <span className="assigned-time">
                    {(() => {
                      const athlete = athletes.find(
                        (a) => a._id === assignment.athleteId
                      );
                      const time = athlete
                        ? getAthleteTime(athlete, legEvent)
                        : undefined;
                      return time !== undefined
                        ? formatTime(time)
                        : "No time";
                    })()}
                  </span>
                </div>
              ) : (
                <div className="leg-empty">Unassigned</div>
              )}

              <div className="leg-options">
                <select
                  value={assignment?.athleteId ?? ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setRelayLeg({
                        relayEvent: selectedRelay,
                        leg,
                        athleteId: e.target.value as GenericId<"athletes">,
                      });
                    }
                  }}
                  className="leg-select"
                >
                  <option value="">
                    {assignment?.athlete ? "Swap athlete..." : "Select athlete..."}
                  </option>
                  {sortedAthletes.map((a) => {
                    const isAssigned =
                      assignedAthleteIds.includes(a._id) &&
                      a._id !== assignment?.athleteId;
                    const sim = assignment?.athlete
                      ? simulateSwap(leg, a._id)
                      : null;
                    const timeStr = a.relevantTime !== undefined
                      ? formatTime(a.relevantTime)
                      : "no time";
                    const impactStr = sim
                      ? ` (${sim.diff > 0 ? "+" : ""}${sim.diff.toFixed(2)}s)`
                      : "";
                    return (
                      <option
                        key={a._id}
                        value={a._id}
                        disabled={isAssigned}
                      >
                        {a.name} — {timeStr}
                        {impactStr}
                        {isAssigned ? " (assigned)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {relayTime !== null && (
        <div className="swap-impact-section">
          <h4>Swap Impact Analysis</h4>
          <p className="impact-description">
            Select a different athlete in any leg dropdown to see how it would
            change the total relay time.
          </p>
          <SwapTable
            athletes={athletes}
            assignments={assignments ?? []}
            legEvents={legEvents}
            getAthleteTime={getAthleteTime}
            relayTime={relayTime}
            assignedAthleteIds={assignedAthleteIds}
          />
        </div>
      )}
    </div>
  );
}

function SwapTable({
  athletes,
  assignments,
  legEvents,
  getAthleteTime,
  relayTime,
  assignedAthleteIds,
}: {
  athletes: AthleteWithTimes[];
  assignments: { leg: number; athleteId: GenericId<"athletes">; athlete: { name: string } | null }[];
  legEvents: string[];
  getAthleteTime: (a: AthleteWithTimes, event: string) => number | undefined;
  relayTime: number;
  assignedAthleteIds: GenericId<"athletes">[];
}) {
  // For each leg, show what happens if you swap each unassigned athlete in
  const unassigned = athletes.filter((a) => !assignedAthleteIds.includes(a._id));
  if (unassigned.length === 0) return <p className="no-subs">All athletes are assigned.</p>;

  return (
    <table className="swap-table">
      <thead>
        <tr>
          <th>Athlete</th>
          {[1, 2, 3, 4].map((leg) => (
            <th key={leg}>Replace Leg {leg}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {unassigned.map((athlete) => (
          <tr key={athlete._id}>
            <td className="swap-athlete-name">{athlete.name}</td>
            {[1, 2, 3, 4].map((leg) => {
              const legEvent = legEvents[leg - 1];
              const newTime = getAthleteTime(athlete, legEvent);
              if (newTime === undefined)
                return <td key={leg} className="swap-na">—</td>;

              const currentAssignment = assignments.find((a) => a.leg === leg);
              if (!currentAssignment) return <td key={leg} className="swap-na">—</td>;

              const currentAthlete = athletes.find(
                (a) => a._id === currentAssignment.athleteId
              );
              const currentTime = currentAthlete
                ? getAthleteTime(currentAthlete, legEvent)
                : undefined;
              if (currentTime === undefined)
                return <td key={leg} className="swap-na">—</td>;

              const diff = newTime - currentTime;
              const newTotal = relayTime + diff;
              return (
                <td
                  key={leg}
                  className={`swap-cell ${diff < 0 ? "faster" : diff > 0 ? "slower" : "same"}`}
                >
                  <div className="swap-total">{formatTime(newTotal)}</div>
                  <div className="swap-diff">
                    {diff < 0 ? "" : "+"}
                    {diff.toFixed(2)}s
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
