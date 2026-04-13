import { ConvexHttpClient } from "convex/browser";
import * as cheerio from "cheerio";
import { teams } from "./teams.js";

// Event name mapping: gobound heading → our DB event name
const EVENT_MAP: Record<string, string> = {
  "100 Meter Dash": "100 Meters",
  "200 Meter Dash": "200 Meters",
  "400 Meter Dash": "400 Meters",
  "800 Meter Run": "800 Meters",
  "1500 Meter Run": "1500 Meters",
  "3000 Meter Run": "3000 Meters",
  "100 Meter Hurdles": "100 Meter Hurdles",
  "400 Meter Hurdles": "400 Meter Hurdles",
  "Long Jump": "Long Jump",
  "High Jump": "High Jump",
  "Shot Put": "Shot Put",
  "Discus": "Discus Throw",
};

// Field events store marks in meters (converted from inches)
const FIELD_EVENTS = new Set(["Long Jump", "High Jump", "Shot Put", "Discus"]);

// Grade abbreviation mapping
const GRADE_MAP: Record<string, string> = {
  FR: "9",
  SO: "10",
  JR: "11",
  SR: "12",
};

function parseTime(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  // M:SS.ss format
  const colonMatch = trimmed.match(/^(\d+):(\d{2}\.\d{1,2})$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 60 + parseFloat(colonMatch[2]);
  }
  // SS.ss format
  const secMatch = trimmed.match(/^\d+\.\d{1,2}$/);
  if (secMatch) {
    return parseFloat(trimmed);
  }
  return null;
}

interface AthleteData {
  name: string;
  grade?: string;
  times: { event: string; time: number }[];
}

interface RelayData {
  event: string;
  time: number;
  athletes: string[];
}

// Relay event name mapping: gobound heading → our DB event name
const RELAY_EVENT_MAP: Record<string, string> = {
  "4x100 Meter Relay": "4x100 Meter Relay",
  "4x200 Meter Relay": "4x200 Meter Relay",
  "4x400 Meter Relay": "4x400 Meter Relay",
  "4x800 Meter Relay": "4x800 Meter Relay",
  "800 Medley Relay": "Sprint Medley Relay",
  "1600 Medley Relay": "Distance Medley Relay",
  "4x100 Meter Shuttle Hurdle Relay": "Shuttle Hurdle Relay",
};

async function scrapeTeam(url: string): Promise<AthleteData[]> {
  console.log(`  Fetching ${url}...`);
  const fetchHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };
  const response = await fetch(url, { headers: fetchHeaders });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Collect all athlete data keyed by name
  const athleteMap = new Map<string, AthleteData>();

  // Each event is in a .card with h4 heading + table
  const allH4 = $("h4");
  allH4.each((_, heading) => {
    const eventTitle = $(heading).text().trim();
    const dbEvent = EVENT_MAP[eventTitle];
    if (!dbEvent) {
      return;
    }

    // h4 is in card-header; table is in sibling card-body, both inside .card
    const card = $(heading).closest(".card");
    const table = card.find("table").first();
    if (!table.length) {
      console.log(`  No table found for event: ${eventTitle}`);
      return;
    }

    table.find("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const nameCell = $(cells[0]).text().trim();
      // Use data-sort-value for the numeric time when available
      const timeCell = $(cells[1]);
      const sortValue = timeCell.attr("data-sort-value");
      const timeText = sortValue || timeCell.text().trim();

      if (!nameCell || !timeText) return;

      // Parse "Katie Willits, SR" → name + grade
      const nameMatch = nameCell.match(/^(.+),\s*(FR|SO|JR|SR)$/);
      let name: string;
      let grade: string | undefined;
      if (nameMatch) {
        name = nameMatch[1].trim().replace(/\s+/g, " "); // normalize whitespace
        grade = GRADE_MAP[nameMatch[2]];
      } else {
        name = nameCell.replace(/\s+/g, " ");
      }

      let time: number | null;
      if (FIELD_EVENTS.has(eventTitle)) {
        // Field event: sort value is inches, convert to meters
        const inches = parseFloat(timeText);
        time = !isNaN(inches) && inches > 0 ? inches * 0.0254 : null;
      } else {
        time = parseTime(timeText);
      }
      if (time === null) return;

      if (!athleteMap.has(name)) {
        athleteMap.set(name, { name, grade, times: [] });
      }
      const athlete = athleteMap.get(name)!;
      if (grade && !athlete.grade) {
        athlete.grade = grade;
      }
      athlete.times.push({ event: dbEvent, time });
    });
  });

  // Also scrape the roster page to pick up athletes who only ran relays
  const rosterUrl = url.replace(/\/stats\?.*$/, "/roster");
  console.log(`  Fetching roster ${rosterUrl}...`);
  try {
    const rosterResp = await fetch(rosterUrl, { headers: fetchHeaders });
    if (rosterResp.ok) {
      const rosterHtml = await rosterResp.text();
      const $r = cheerio.load(rosterHtml);
      $r("table tr").each((_, row) => {
        const cells = $r(row).find("td");
        if (cells.length < 2) return;
        const nameText = $r(cells[0]).text().trim().replace(/\s+/g, " ");
        const gradeText = $r(cells[1]).text().trim();
        if (!nameText) return;
        const grade = GRADE_MAP[gradeText];
        if (!athleteMap.has(nameText)) {
          athleteMap.set(nameText, { name: nameText, grade, times: [] });
        } else if (grade && !athleteMap.get(nameText)!.grade) {
          athleteMap.get(nameText)!.grade = grade;
        }
      });
    }
  } catch (e) {
    console.log(`  Warning: Could not fetch roster page`);
  }

  return Array.from(athleteMap.values());
}

async function scrapeRelays(url: string): Promise<RelayData[]> {
  // Switch from individual stats to team/relay stats
  const relayUrl = url.replace("competitor=athlete", "competitor=team");
  console.log(`  Fetching relays ${relayUrl}...`);
  const fetchHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };

  try {
    const resp = await fetch(relayUrl, { headers: fetchHeaders });
    if (!resp.ok) return [];
    const html = await resp.text();
    const $ = cheerio.load(html);

    const relays: RelayData[] = [];

    $("h4").each((_, heading) => {
      const title = $(heading).text().trim();
      const dbEvent = RELAY_EVENT_MAP[title];
      if (!dbEvent) return;

      const card = $(heading).closest(".card");
      const table = card.find("table").first();
      if (!table.length) return;

      // Take only the first data row (skip header row with th)
      let foundRow = false;
      table.find("tr").each((_, row) => {
        if (foundRow) return;
        const cells = $(row).find("td");
        if (cells.length < 3) return;

        foundRow = true;

        // Cell 1: athlete names (comma-separated)
        const athleteText = $(cells[1]).text().trim();
        const athletes = athleteText.split(",").map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);

        // Cell 2: time
        const timeCell = $(cells[2]);
        const sortValue = timeCell.attr("data-sort-value");
        const timeText = sortValue || timeCell.text().trim();
        const time = parseTime(timeText);

        if (time && athletes.length > 0) {
          relays.push({ event: dbEvent, time, athletes });
        }
      });
    });

    return relays;
  } catch (e) {
    console.log(`  Warning: Could not fetch relay page`);
    return [];
  }
}

async function main() {
  const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    // Try loading from .env.local
    const fs = await import("fs");
    const path = await import("path");
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const match = envContent.match(/VITE_CONVEX_URL=(.+)/);
      if (match) {
        process.env.VITE_CONVEX_URL = match[1].trim();
      }
    }
  }

  const url = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) {
    console.error("Error: No Convex URL found. Set VITE_CONVEX_URL in .env.local");
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);

  // Parse CLI args
  const args = process.argv.slice(2);
  const slugFilter = args.find((a) => a.startsWith("--team="))?.split("=")[1];
  const clearFirst = args.includes("--clear");

  const teamsToImport = slugFilter
    ? teams.filter((t) => t.slug === slugFilter)
    : teams;

  if (teamsToImport.length === 0) {
    console.error(
      `No teams found${slugFilter ? ` matching "${slugFilter}"` : ""}. Check scripts/teams.ts`
    );
    process.exit(1);
  }

  console.log(
    `Importing ${teamsToImport.length} team(s): ${teamsToImport.map((t) => t.name).join(", ")}`
  );

  for (const team of teamsToImport) {
    console.log(`\n--- ${team.name} (${team.slug}) ---`);

    // Upsert team record
    await client.mutation("teams:upsert" as any, {
      slug: team.slug,
      name: team.name,
      url: team.url,
    });

    if (clearFirst) {
      console.log("  Clearing existing data...");
      await client.mutation("importData:clearTeam" as any, { team: team.slug });
    }

    try {
      const athletes = await scrapeTeam(team.url);
      console.log(`  Found ${athletes.length} athletes`);

      let totalTimes = 0;
      for (const athlete of athletes) {
        await client.mutation("importData:upsertAthlete" as any, {
          team: team.slug,
          name: athlete.name,
          grade: athlete.grade,
          times: athlete.times,
        });
        totalTimes += athlete.times.length;
      }

      await client.mutation("teams:markImported" as any, { slug: team.slug });
      console.log(
        `  ✅ Imported ${athletes.length} athletes with ${totalTimes} times`
      );

      // Scrape relay times
      const relays = await scrapeRelays(team.url);
      for (const relay of relays) {
        await client.mutation("importData:upsertRelayTime" as any, {
          team: team.slug,
          event: relay.event,
          time: relay.time,
          athletes: relay.athletes,
        });
      }
      if (relays.length > 0) {
        console.log(`  ✅ Imported ${relays.length} relay times`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to import ${team.name}:`, err);
    }
  }

  console.log("\nDone!");
}

main();
