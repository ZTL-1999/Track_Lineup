import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function AddAthlete({ team }: { team?: string }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const addAthlete = useMutation(api.mutations.addAthlete);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addAthlete({ name: name.trim(), grade: grade.trim() || undefined, team });
    setName("");
    setGrade("");
  };

  return (
    <form onSubmit={handleSubmit} className="add-athlete-form">
      <input
        type="text"
        placeholder="Athlete name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select value={grade} onChange={(e) => setGrade(e.target.value)}>
        <option value="">Grade</option>
        <option value="9">Freshman</option>
        <option value="10">Sophomore</option>
        <option value="11">Junior</option>
        <option value="12">Senior</option>
      </select>
      <button type="submit">Add Athlete</button>
    </form>
  );
}
