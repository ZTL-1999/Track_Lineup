import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";

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

export function AthleteList({ athletes, selectedAthleteId, onSelect }: AthleteListProps) {
  const removeAthlete = useMutation(api.mutations.removeAthlete);

  return (
    <div className="athlete-list">
      <h3>Roster ({athletes.length})</h3>
      {athletes.length === 0 ? (
        <p className="empty-msg">No athletes added yet.</p>
      ) : (
        <ul>
          {athletes.map((a) => (
            <li
              key={a._id}
              className={`athlete-item ${selectedAthleteId === a._id ? "selected" : ""}`}
              onClick={() => onSelect(a._id)}
            >
              <div className="athlete-info">
                <span className="athlete-name">{a.name}</span>
                {a.grade && <span className="athlete-grade">Gr. {a.grade}</span>}
                <span className="athlete-event-count">
                  {a.times.length} event{a.times.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                className="remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove ${a.name} from the roster?`)) {
                    removeAthlete({ athleteId: a._id });
                  }
                }}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
