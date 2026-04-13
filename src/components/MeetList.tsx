import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { GenericId } from "convex/values";
import { MeetDetail } from "./MeetDetail";

export function MeetList() {
  const meets = useQuery(api.meets.list) ?? [];
  const createMeet = useMutation(api.meets.create);
  const deleteMeet = useMutation(api.meets.deleteMeet);

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [activeMeetId, setActiveMeetId] = useState<GenericId<"meets"> | null>(null);

  if (activeMeetId) {
    return <MeetDetail meetId={activeMeetId} onBack={() => setActiveMeetId(null)} />;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await createMeet({ name: name.trim(), date: date || undefined });
    setName("");
    setDate("");
    setShowForm(false);
    setActiveMeetId(id as GenericId<"meets">);
  }

  return (
    <div className="meets-view">
      <div className="meets-header">
        <h2>Meets</h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New Meet"}
        </button>
      </div>

      {showForm && (
        <form className="meet-create-form card" onSubmit={handleCreate}>
          <h3>Create New Meet</h3>
          <div className="form-row">
            <label>Meet Name</label>
            <input
              type="text"
              placeholder="e.g. Drake Relays Simulation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-row">
            <label>Date (optional)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>
      )}

      {meets.length === 0 && !showForm && (
        <p className="empty-msg">No meets yet. Create one to get started.</p>
      )}

      <div className="meet-cards">
        {meets.map((meet) => (
          <div key={meet._id} className="meet-card card">
            <div className="meet-card-info">
              <span className="meet-card-name">{meet.name}</span>
              {meet.date && <span className="meet-card-date">{meet.date}</span>}
              <span className="meet-card-teams">
                {meet.teamSlugs.length} team{meet.teamSlugs.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="meet-card-actions">
              <button
                className="btn-primary"
                onClick={() => setActiveMeetId(meet._id as GenericId<"meets">)}
              >
                Open
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm(`Delete "${meet.name}"?`)) {
                    deleteMeet({ meetId: meet._id });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
