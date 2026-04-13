// Quick script to inspect the relay page HTML structure
import * as cheerio from "cheerio";

const RELAY_EVENT_MAP: Record<string, string> = {
  "4x100 Meter Relay": "4x100 Meter Relay",
  "4x200 Meter Relay": "4x200 Meter Relay",
  "4x400 Meter Relay": "4x400 Meter Relay",
  "4x800 Meter Relay": "4x800 Meter Relay",
  "800 Medley Relay": "Sprint Medley Relay",
  "1600 Medley Relay": "Distance Medley Relay",
  "4x100 Meter Shuttle Hurdle Relay": "Shuttle Hurdle Relay",
};

function parseTime(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  const colonMatch = trimmed.match(/^(\d+):(\d{2}\.\d{1,2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseFloat(colonMatch[2]);
  const secMatch = trimmed.match(/^\d+\.\d{1,2}$/);
  if (secMatch) return parseFloat(trimmed);
  return null;
}

async function main() {
  const url = "https://www.gobound.com/ia/ighsau/girlstrack/2025-26/northwest/v/stats?competitor=team&range=season&block=total";
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html",
    },
  });
  const html = await resp.text();
  const $ = cheerio.load(html);

  console.log("All H4 headings:");
  $("h4").each((_, el) => console.log("  ", $(el).text().trim()));

  console.log("\nProcessing relay events:");
  $("h4").each((_, heading) => {
    const title = $(heading).text().trim();
    const dbEvent = RELAY_EVENT_MAP[title];
    console.log(`  H4: "${title}" → mapped: ${dbEvent ?? "SKIP"}`);
    if (!dbEvent) return;

    const card = $(heading).closest(".card");
    console.log(`    card found: ${card.length > 0}`);
    const table = card.find("table").first();
    console.log(`    table found: ${table.length > 0}`);
    if (!table.length) return;

    const rows = table.find("tr");
    console.log(`    total rows: ${rows.length}`);
    rows.each((ri, row) => {
      const tds = $(row).find("td");
      const ths = $(row).find("th");
      console.log(`    row${ri}: ${tds.length} td, ${ths.length} th`);
      if (tds.length >= 2) {
        tds.each((ci, c) => console.log(`      td${ci}: "${$(c).text().trim().substring(0, 80)}"`));
      }
      if (ri >= 2) return false; // only first 3 rows
    });
  });
}
main();
