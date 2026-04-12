import { INDIVIDUAL_EVENTS, formatTime } from "../events";
import type { GenericId } from "convex/values";

interface EventRankingsProps {
  athletes: {
    _id: GenericId<"athletes">;
    name: string;
    grade?: string;
    times: { event: string; time: number }[];
  }[];
}

export function EventRankings({ athletes }: EventRankingsProps) {
  return (
    <div className="event-rankings">
      <h3>Event Rankings</h3>
      <div className="rankings-grid">
        {INDIVIDUAL_EVENTS.map((event) => {
          const ranked = athletes
            .map((a) => ({
              name: a.name,
              grade: a.grade,
              time: a.times.find((t) => t.event === event)?.time,
            }))
            .filter((a) => a.time !== undefined)
            .sort((a, b) => a.time! - b.time!)
            .slice(0, 8);

          if (ranked.length === 0) return null;

          return (
            <div key={event} className="ranking-card">
              <h4>{event}</h4>
              <ol>
                {ranked.map((a, i) => (
                  <li key={i}>
                    <span className="rank-name">{a.name}</span>
                    <span className="rank-time">{formatTime(a.time!)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
