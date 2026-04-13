import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import * as dotenv from "dotenv";
import { predictEventTime, EVENT_DISTANCES, formatTime } from "../src/events.js";
dotenv.config({ path: ".env.local" });

async function main() {
  const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
  const athletes = await client.query(api.athletes.listWithTimes, { team: "northwest" });
  const katie = athletes.find((a: any) => a.name.toLowerCase().includes("willits"));
  if (!katie) { console.log("Not found"); return; }
  console.log(`${katie.name} — stored times:`);
  for (const t of (katie as any).times) console.log(`  ${t.event}: ${formatTime(t.time)}`);
  console.log("\nPredictions:");
  for (const ev of Object.keys(EVENT_DISTANCES)) {
    const p = predictEventTime((katie as any).times, ev);
    if (p) console.log(`  ${ev}: ${formatTime(p.time)}${p.estimated ? " (est.)" : ""}`);
    else console.log(`  ${ev}: — (no data)`);
  }
}
main().catch(console.error);
