/**
 * Fetches each team's show page and extracts the slug-based stats URL.
 * Usage: npx tsx scripts/discover_teams.ts
 * Outputs a teams.ts-ready array to stdout.
 */

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// All Class 4A teams from the teams listing page
const TEAMS_4A: { name: string; hash: string }[] = [
  { name: "Ames Little Cyclones",                hash: "h2022217513114f9ae9b93bc1487fbaa" },
  { name: "Ankeny Hawks",                        hash: "h202221751311fa0fee8494524173980" },
  { name: "Ankeny Centennial Jaguars",           hash: "h202221751311cbcc3d08c99445cc8ae" },
  { name: "Bettendorf Bulldogs",                 hash: "h20222175131115acccbce06d47c5b39" },
  { name: "Cedar Falls Tigers",                  hash: "h2022217513115ba6efd39d764f89b17" },
  { name: "Cedar Rapids Jefferson J-Hawks",      hash: "h202221751311e121d6d0f7994c1699f" },
  { name: "Cedar Rapids Kennedy Cougars",        hash: "h2022217513116a9da73481d54e31870" },
  { name: "Cedar Rapids Washington Warriors",    hash: "h20222175131197d063c30ddc42a2946" },
  { name: "Clinton River Queens",                hash: "h2022217513111eea520f71e444519e0" },
  { name: "Council Bluffs Jefferson Yellow Jackets", hash: "h202221751311d930f6467a124aa9a8e" },
  { name: "Council Bluffs Lincoln Lynx",         hash: "h20222175131158da80b9d2a94cd2bf4" },
  { name: "Dallas Center-Grimes Mustangs",       hash: "h202221751311e1f43805dd7e44328f4" },
  { name: "Davenport Central Blue Devils",       hash: "h20222175131190373f37ebcc48618d1" },
  { name: "Davenport North Wildcats",            hash: "h20222175131109feba73cd0840e6a8e" },
  { name: "Davenport West Falcons",              hash: "h202221751311117844a6e0cb45cf936" },
  { name: "Des Moines East Scarlets",            hash: "h2022217513110f702cdf60bd4e2798d" },
  { name: "Des Moines Lincoln Railsplitters",    hash: "h202221751311a760f4b60fc94280bd2" },
  { name: "Des Moines North Polar Bears",        hash: "h202221751311415aefe36bd046f2b37" },
  { name: "Des Moines Roosevelt Roughriders",    hash: "h2022217513115ba16a3d7f6b4fa6864" },
  { name: "Dowling Catholic Maroons",            hash: "h202221751311c831d4f0db51455babe" },
  { name: "Dubuque Hempstead Mustangs",          hash: "h2022217513116d02f029ea154b21a16" },
  { name: "Dubuque Senior Rams",                 hash: "h202221751311287096b56cde453299c" },
  { name: "Fort Dodge Dodgers",                  hash: "h20222175131113d56b783ad94fe3bde" },
  { name: "Indianola Indians",                   hash: "h2022217513116f41d2f82d3a4b109e6" },
  { name: "Iowa City High Little Hawks",         hash: "h202221751311adb8909e3a664aadb2a" },
  { name: "Iowa City Liberty Lightning",         hash: "h2022217513114dff9c86efd3417c981" },
  { name: "Iowa City West Trojans",              hash: "h202221751311550866623d7e48558d2" },
  { name: "Johnston Dragons",                    hash: "h202221751311044c64d5e0d74e18988" },
  { name: "Lewis Central Titans",                hash: "h202221751311e5340b0027cd4ab1a00" },
  { name: "Linn-Mar Lions",                      hash: "h202221751311e70fb078d80b481885f" },
  { name: "Marshalltown Bobcats",                hash: "h2022217513116f52a6f1ed1f476ebd6" },
  { name: "Mason City Riverhawks",               hash: "h202221751311e2f6c4e9895a4e9d9a7" },
  { name: "Muscatine Muskies",                   hash: "h2022217513114e65006e42ce415593c" },
  { name: "North Scott Lady Lancers",            hash: "h2022217513114aa90d8f92ce46c59d3" },
  { name: "Norwalk Warriors",                    hash: "h2022217513118e38b06062df4548966" },
  { name: "Ottumwa Bulldogs",                    hash: "h202221751311364a05b587824634a19" },
  { name: "Pleasant Valley Spartans",            hash: "h2022217513113bdf1ae9d66044c496b" },
  { name: "Prairie Hawks",                       hash: "h2022217513111d58abb5a6e04fb0856" },
  { name: "Sioux City East Black Raiders",       hash: "h20222175131183c44a75e56e4cbf936" },
  { name: "Sioux City North Stars",              hash: "h20222175131111a648cea503405f87c" },
  { name: "Sioux City West Wolverines",          hash: "h20222175131130b42885222b4aa197a" },
  { name: "Southeast Polk Rams",                 hash: "h2022217513117acbe6ed89c848bc992" },
  { name: "Urbandale J-Hawks",                   hash: "h20222175131121e06e616f644a1faa2" },
  { name: "Valley Tigers",                       hash: "h2022217513118d8d6142fe7c42758b0" },
  { name: "Waterloo East Trojans",               hash: "h202221751311e4de1e80eb9b40da911" },
  { name: "Waterloo West Wahawks",               hash: "h2022217513114b7a302ff31544e7916" },
  { name: "Waukee Warriors",                     hash: "h202221751311a606b6e1f68d47eaab1" },
  { name: "Waukee Northwest Wolves",             hash: "h202221751311b731648dc02a46e2a2b" },
];

async function getSlug(hash: string): Promise<string | null> {
  const url = `https://www.gobound.com/direct/teams/${hash}/show`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);

  // Look for the stats anchor link containing /ia/ighsau/girlstrack/2025-26/{slug}/v/stats
  let slug: string | null = null;
  $("a[href*='/ia/ighsau/girlstrack/2025-26/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/ia\/ighsau\/girlstrack\/2025-26\/([^/]+)\/v/);
    if (m) {
      slug = m[1];
      return false; // break
    }
  });
  return slug;
}

async function main() {
  const results: { name: string; slug: string; url: string }[] = [];

  for (const team of TEAMS_4A) {
    process.stdout.write(`Fetching ${team.name}... `);
    const slug = await getSlug(team.hash);
    if (!slug) {
      console.log(`FAILED (no slug found)`);
      continue;
    }
    const url = `https://www.gobound.com/ia/ighsau/girlstrack/2025-26/${slug}/v/stats?competitor=athlete&range=season&block=total`;
    results.push({ name: team.name, slug, url });
    console.log(`slug="${slug}"`);
    // Polite delay
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n\n--- TEAMS CONFIG OUTPUT ---\n");
  console.log("export const teams = [");
  for (const t of results) {
    console.log(`  {`);
    console.log(`    slug: "${t.slug}",`);
    console.log(`    name: "${t.name}",`);
    console.log(`    url: "${t.url}",`);
    console.log(`  },`);
  }
  console.log("];");
}

main().catch(console.error);
