import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { TIMED_EVENTS, formatTime, parseTime } from "../events";

interface AthleteTimesProps {
  athlete: {
    _id: GenericId<"athletes">;
    name: string;
    grade?: string;
    times: { event: string; time: number }[];
  };
  onClose: () => void;
}

export function AthleteTimes({ athlete, onClose }: AthleteTimesProps) {
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const setTime = useMutation(api.mutations.setTime);
  const removeTime = useMutation(api.mutations.removeTime);

  const getTime = (event: string) =>
    athlete.times.find((t) => t.event === event);

  const handleSave = async (event: string) => {
    const parsed = parseTime(timeInput);
    if (parsed === null || parsed <= 0) {
      alert("Invalid time format. Use SS.ss or M:SS.ss");
      return;
    }
    await setTime({ athleteId: athlete._id, event, time: parsed });
    setEditingEvent(null);
    setTimeInput("");
  };

  const handleRemove = async (event: string) => {
    await removeTime({ athleteId: athlete._id, event });
  };

  return (
    <div className="athlete-times-panel">
      <div className="panel-header">
        <h3>
          {athlete.name}
          {athlete.grade && <span className="grade"> (Gr. {athlete.grade})</span>}
        </h3>
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>
      </div>
      <table className="times-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {TIMED_EVENTS.map((event) => {
            const existing = getTime(event);
            const isEditing = editingEvent === event;
            return (
              <tr key={event}>
                <td>{event}</td>
                <td>
                  {isEditing ? (
                    <input
                      type="text"
                      className="time-input"
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      placeholder="SS.ss or M:SS.ss"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(event);
                        if (e.key === "Escape") {
                          setEditingEvent(null);
                          setTimeInput("");
                        }
                      }}
                      autoFocus
                    />
                  ) : existing ? (
                    formatTime(existing.time)
                  ) : (
                    <span className="no-time">—</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <>
                      <button className="save-btn" onClick={() => handleSave(event)}>
                        Save
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={() => {
                          setEditingEvent(null);
                          setTimeInput("");
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="edit-btn"
                        onClick={() => {
                          setEditingEvent(event);
                          setTimeInput(existing ? formatTime(existing.time) : "");
                        }}
                      >
                        {existing ? "Edit" : "Add"}
                      </button>
                      {existing && (
                        <button
                          className="remove-btn"
                          onClick={() => handleRemove(event)}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
