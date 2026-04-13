import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
  const athletes = await client.query(api.athletes.listWithTimes, { team: "ankeny" });

  const eventCounts: Record<string, number> = {};
  for (const a of athletes) {
    for (const t of (a as any).times) {
      eventCounts[t.event] = (eventCounts[t.event] || 0) + 1;
    }
  }
  console.log("Events in DB:", JSON.stringify(eventCounts, null, 2));

  const SHORT = new Set(["100 Meters","200 Meters","400 Meters","100 Meter Hurdles","400 Meter Hurdles"]);
  const LONG = new Set(["800 Meters","1500 Meters","3000 Meters"]);
  let s = 0, l = 0, n = 0;
  for (const a of athletes) {
    const sc = (a as any).times.filter((t: any) => SHORT.has(t.event)).length;
    const lc = (a as any).times.filter((t: any) => LONG.has(t.event)).length;
    if (sc === 0 && lc === 0) n++;
    else if (lc > sc) {
      l++;
      console.log("LONG:", a.name, (a as any).times.map((t: any) => t.event));
    } else {
      s++;
      if (lc > 0) console.log("SPRINT (has long too):", a.name, { sc, lc }, (a as any).times.map((t: any) => t.event));
    }
  }
  console.log(`\nSprints: ${s}, Distance: ${l}, None: ${n}`);
}
main().catch(console.error);
