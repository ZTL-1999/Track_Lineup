import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
// ---------------------------------------------------------------------------
// Relay leg distances (meters) — mirrors src/events.ts RELAY_LEG_EVENTS
// ---------------------------------------------------------------------------
const RELAY_LEG_DISTANCES = {
    "4x100 Meter Relay": [100, 100, 100, 100],
    "4x200 Meter Relay": [200, 200, 200, 200],
    "4x400 Meter Relay": [400, 400, 400, 400],
    "4x800 Meter Relay": [800, 800, 800, 800],
    "Sprint Medley Relay": [100, 100, 200, 400],
    "Distance Medley Relay": [200, 200, 400, 800], // Iowa standard
    "Shuttle Hurdle Relay": [100, 100, 100, 100],
};
const FIELD_EVENTS = new Set([
    "High Jump",
    "Long Jump",
    "Shot Put",
    "Discus Throw",
]);
const RELAY_EVENTS = new Set(Object.keys(RELAY_LEG_DISTANCES));
// Points awarded for places 1-8
const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
// ---------------------------------------------------------------------------
// Riegel time prediction
// T2 = T1 * (D2 / D1)^1.06
// ---------------------------------------------------------------------------
function riegelPredict(knownDistMeters, knownTimeSeconds, targetDistMeters) {
    return knownTimeSeconds * Math.pow(targetDistMeters / knownDistMeters, 1.06);
}
// event name → distance in meters (for Riegel)
const EVENT_DISTANCES = {
    "100 Meters": 100,
    "200 Meters": 200,
    "400 Meters": 400,
    "800 Meters": 800,
    "1500 Meters": 1500,
    "3000 Meters": 3000,
    "100 Meter Hurdles": 100,
    "400 Meter Hurdles": 400,
};
const HURDLE_EVENTS = new Set(["100 Meter Hurdles", "400 Meter Hurdles"]);
const HURDLE_RELAYS = new Set(["Shuttle Hurdle Relay"]);
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export const list = query({
    args: {},
    handler: async (ctx) => {
        return ctx.db.query("meets").collect();
    },
});
export const get = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        return ctx.db.get(args.meetId);
    },
});
export const getEntries = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        return ctx.db
            .query("meetEntries")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
    },
});
export const getFieldMarks = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        return ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
    },
});
export const getTimeOverrides = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        return ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
    },
});
// Only allow estimates for 100m and 200m (same rule as frontend)
const ESTIMATE_OK_EVENTS = new Set(["100 Meters", "200 Meters"]);
function predictEventTime(athleteTimes, targetEvent) {
    const targetDist = EVENT_DISTANCES[targetEvent];
    if (!targetDist)
        return null;
    const targetIsHurdle = HURDLE_EVENTS.has(targetEvent);
    // Check for exact match first
    const exact = athleteTimes.find((t) => t.event === targetEvent);
    if (exact)
        return { time: exact.time, estimated: false };
    // Only estimate for 100m/200m
    if (!ESTIMATE_OK_EVENTS.has(targetEvent))
        return null;
    const predictions = [];
    for (const t of athleteTimes) {
        const knownDist = EVENT_DISTANCES[t.event];
        if (!knownDist || knownDist === targetDist)
            continue;
        if (HURDLE_EVENTS.has(t.event) !== targetIsHurdle)
            continue;
        const ratio = knownDist > targetDist ? knownDist / targetDist : targetDist / knownDist;
        if (ratio > 3)
            continue;
        const pred = riegelPredict(knownDist, t.time, targetDist);
        const weight = 1 / Math.abs(Math.log(knownDist / targetDist));
        predictions.push({ pred, weight });
    }
    if (predictions.length === 0)
        return null;
    const totalWeight = predictions.reduce((s, p) => s + p.weight, 0);
    const weighted = predictions.reduce((s, p) => s + p.pred * p.weight, 0) / totalWeight;
    return { time: weighted, estimated: true };
}
// Apply 2-per-team limit and return top N
function applyTeamLimit(rows, limit) {
    const teamCounts = new Map();
    const filtered = [];
    for (const r of rows) {
        const count = teamCounts.get(r.teamSlug) ?? 0;
        if (count >= 2)
            continue;
        teamCounts.set(r.teamSlug, count + 1);
        filtered.push(r);
        if (filtered.length >= limit)
            break;
    }
    return filtered;
}
async function computeEventTop8(ctx, event, meetId, teamNameMap) {
    // Pre-fetch meet entries for submitted-team filtering
    let allMeetEntries = [];
    const submittedTeams = new Set();
    const enteredAthletesForEvent = new Set();
    if (meetId) {
        allMeetEntries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet", (q) => q.eq("meetId", meetId))
            .collect();
        for (const e of allMeetEntries) {
            submittedTeams.add(e.teamSlug);
            if (e.event === event) {
                for (const id of e.athleteIds)
                    enteredAthletesForEvent.add(id);
            }
        }
    }
    const isField = FIELD_EVENTS.has(event);
    const directTimes = await ctx.db
        .query("times")
        .withIndex("by_event", (q) => q.eq("event", event))
        .collect();
    directTimes.sort((a, b) => isField ? b.time - a.time : a.time - b.time);
    const topDirect = directTimes.slice(0, 24);
    const rows = [];
    const seenAthletes = new Set();
    for (const t of topDirect) {
        const athlete = await ctx.db.get(t.athleteId);
        if (!athlete || !athlete.team)
            continue;
        seenAthletes.add(t.athleteId);
        rows.push({
            athleteId: t.athleteId,
            athleteName: athlete.name,
            teamSlug: athlete.team,
            teamName: teamNameMap.get(athlete.team) ?? athlete.team,
            time: t.time,
            estimated: false,
        });
    }
    if (ESTIMATE_OK_EVENTS.has(event)) {
        const targetDist = EVENT_DISTANCES[event];
        const targetIsHurdle = HURDLE_EVENTS.has(event);
        const sourceEvents = Object.entries(EVENT_DISTANCES).filter(([name, dist]) => {
            if (name === event)
                return false;
            if (HURDLE_EVENTS.has(name) !== targetIsHurdle)
                return false;
            const ratio = dist > targetDist ? dist / targetDist : targetDist / dist;
            return ratio <= 3;
        });
        for (const [srcEvent] of sourceEvents) {
            const srcTimes = await ctx.db
                .query("times")
                .withIndex("by_event", (q) => q.eq("event", srcEvent))
                .collect();
            srcTimes.sort((a, b) => a.time - b.time);
            for (const t of srcTimes.slice(0, 24)) {
                if (seenAthletes.has(t.athleteId))
                    continue;
                seenAthletes.add(t.athleteId);
                const athlete = await ctx.db.get(t.athleteId);
                if (!athlete || !athlete.team)
                    continue;
                const allTimes = await ctx.db
                    .query("times")
                    .withIndex("by_athlete", (q) => q.eq("athleteId", t.athleteId))
                    .collect();
                const pred = predictEventTime(allTimes.map((at) => ({ event: at.event, time: at.time })), event);
                if (!pred)
                    continue;
                rows.push({
                    athleteId: t.athleteId,
                    athleteName: athlete.name,
                    teamSlug: athlete.team,
                    teamName: teamNameMap.get(athlete.team) ?? athlete.team,
                    time: pred.time,
                    estimated: pred.estimated,
                });
            }
        }
    }
    // Include meet overrides for entered athletes
    if (meetId) {
        const overrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet", (q) => q.eq("meetId", meetId))
            .collect();
        for (const o of overrides.filter((o) => o.event === event && enteredAthletesForEvent.has(o.athleteId))) {
            if (seenAthletes.has(o.athleteId))
                continue;
            seenAthletes.add(o.athleteId);
            const athlete = await ctx.db.get(o.athleteId);
            if (!athlete || !athlete.team)
                continue;
            rows.push({
                athleteId: o.athleteId,
                athleteName: athlete.name,
                teamSlug: athlete.team,
                teamName: teamNameMap.get(athlete.team) ?? athlete.team,
                time: o.time,
                estimated: false,
            });
        }
    }
    // Filter out submitted-but-not-entered athletes
    const filtered = meetId
        ? rows.filter((r) => !submittedTeams.has(r.teamSlug) || enteredAthletesForEvent.has(r.athleteId))
        : rows;
    filtered.sort((a, b) => isField ? b.time - a.time : a.time - b.time);
    return applyTeamLimit(filtered, 8);
}
// Returns top 8 times for a specific event across all 4A schools
// Includes estimated times for 100m/200m, enforces 2-per-team limit
export const eventRankings = query({
    args: { event: v.string(), meetId: v.optional(v.id("meets")) },
    handler: async (ctx, args) => {
        const teams = await ctx.db.query("teams").collect();
        const teamNameMap = new Map();
        for (const t of teams) {
            const words = t.name.split(" ");
            teamNameMap.set(t.slug, words.length > 1 ? words.slice(0, -1).join(" ") : t.name);
        }
        return computeEventTop8(ctx, args.event, args.meetId, teamNameMap);
    },
});
// Returns top 8 relay times for a specific relay event across all 4A schools
export const relayRankings = query({
    args: { event: v.string(), meetId: v.optional(v.id("meets")) },
    handler: async (ctx, args) => {
        const teams = await ctx.db.query("teams").collect();
        const teamNameMap = new Map();
        for (const t of teams) {
            const words = t.name.split(" ");
            const schoolName = words.length > 1 ? words.slice(0, -1).join(" ") : t.name;
            teamNameMap.set(t.slug, schoolName);
        }
        const relayTimes = await ctx.db
            .query("relayTimes")
            .withIndex("by_event", (q) => q.eq("event", args.event))
            .collect();
        relayTimes.sort((a, b) => a.time - b.time);
        // 1 entry per team (no early break — need all teams to apply predictions)
        const seen = new Set();
        const rows = [];
        for (const r of relayTimes) {
            if (seen.has(r.team))
                continue;
            seen.add(r.team);
            rows.push({
                teamSlug: r.team,
                teamName: teamNameMap.get(r.team) ?? r.team,
                time: r.time,
            });
        }
        // Apply meet-specific predicted times: use min(actual, predicted)
        // Also remove teams that submitted a roster but didn't enter this relay
        if (args.meetId) {
            const entries = await ctx.db
                .query("meetEntries")
                .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
                .collect();
            // Teams that have submitted ANY entry for this meet
            const submittedTeams = new Set(entries.map((e) => e.teamSlug));
            // Teams that specifically entered this relay
            const enteredTeams = new Set(entries.filter((e) => e.event === args.event).map((e) => e.teamSlug));
            const predMap = new Map(entries
                .filter((e) => e.event === args.event && e.predictedRelayTime != null)
                .map((e) => [e.teamSlug, e.predictedRelayTime]));
            // Apply predicted times and filter out submitted-but-not-entered teams
            const afterFilter = [];
            for (const row of rows) {
                if (submittedTeams.has(row.teamSlug) && !enteredTeams.has(row.teamSlug))
                    continue;
                const pred = predMap.get(row.teamSlug);
                if (pred != null)
                    row.time = Math.min(row.time, pred);
                afterFilter.push(row);
                predMap.delete(row.teamSlug);
            }
            // Teams with a predicted time but no actual gobound time
            for (const [slug, pred] of predMap) {
                afterFilter.push({ teamSlug: slug, teamName: teamNameMap.get(slug) ?? slug, time: pred });
            }
            afterFilter.sort((a, b) => a.time - b.time);
            return afterFilter.slice(0, 8);
        }
        return rows.slice(0, 8);
    },
});
// Returns top-8 rankings for ALL individual, field, and relay events in one query.
// Use this instead of calling eventRankings/relayRankings 20 times separately.
const ALL_INDIVIDUAL_EVENTS = [
    "100 Meters", "200 Meters", "400 Meters", "800 Meters",
    "1500 Meters", "3000 Meters", "100 Meter Hurdles", "400 Meter Hurdles",
    "High Jump", "Long Jump", "Shot Put", "Discus Throw",
];
const ALL_RELAY_EVENTS = [
    "4x100 Meter Relay", "4x200 Meter Relay", "4x400 Meter Relay", "4x800 Meter Relay",
    "Sprint Medley Relay", "Distance Medley Relay", "Shuttle Hurdle Relay",
];
export const allRankings = query({
    args: { meetId: v.optional(v.id("meets")) },
    handler: async (ctx, args) => {
        const teams = await ctx.db.query("teams").collect();
        const teamNameMap = new Map();
        for (const t of teams) {
            const words = t.name.split(" ");
            teamNameMap.set(t.slug, words.length > 1 ? words.slice(0, -1).join(" ") : t.name);
        }
        const result = {};
        // ---- Individual + field events ----
        for (const event of ALL_INDIVIDUAL_EVENTS) {
            result[event] = await computeEventTop8(ctx, event, args.meetId, teamNameMap);
        }
        // ---- Relay events — fetch meetEntries once, reuse across all relays ----
        let allMeetEntries = [];
        if (args.meetId) {
            allMeetEntries = await ctx.db
                .query("meetEntries")
                .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
                .collect();
        }
        const submittedRelayTeams = new Set(allMeetEntries.map((e) => e.teamSlug));
        for (const event of ALL_RELAY_EVENTS) {
            const relayTimes = await ctx.db
                .query("relayTimes")
                .withIndex("by_event", (q) => q.eq("event", event))
                .collect();
            relayTimes.sort((a, b) => a.time - b.time);
            const seen = new Set();
            const rows = [];
            for (const r of relayTimes) {
                if (seen.has(r.team))
                    continue;
                seen.add(r.team);
                rows.push({ teamSlug: r.team, teamName: teamNameMap.get(r.team) ?? r.team, time: r.time });
            }
            if (args.meetId) {
                const enteredTeams = new Set(allMeetEntries.filter((e) => e.event === event).map((e) => e.teamSlug));
                const predMap = new Map(allMeetEntries
                    .filter((e) => e.event === event && e.predictedRelayTime != null)
                    .map((e) => [e.teamSlug, e.predictedRelayTime]));
                const afterFilter = [];
                for (const row of rows) {
                    if (submittedRelayTeams.has(row.teamSlug) && !enteredTeams.has(row.teamSlug))
                        continue;
                    const pred = predMap.get(row.teamSlug);
                    if (pred != null)
                        row.time = Math.min(row.time, pred);
                    afterFilter.push(row);
                    predMap.delete(row.teamSlug);
                }
                for (const [slug, pred] of predMap) {
                    afterFilter.push({ teamSlug: slug, teamName: teamNameMap.get(slug) ?? slug, time: pred });
                }
                afterFilter.sort((a, b) => a.time - b.time);
                result[event] = afterFilter.slice(0, 8);
            }
            else {
                result[event] = rows.slice(0, 8);
            }
        }
        return result;
    },
});
export const setRelayPrediction = mutation({
    args: {
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        predictedTime: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .filter((q) => q.eq(q.field("event"), args.event))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { predictedRelayTime: args.predictedTime });
        }
    },
});
// Returns projected points per event for a team's entries
// Lightweight: uses by_event index, no athlete lookups, no estimates
export const projectedPoints = query({
    args: { meetId: v.id("meets"), teamSlug: v.string() },
    handler: async (ctx, args) => {
        const entries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .collect();
        const overrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .collect();
        const result = {};
        for (const entry of entries) {
            if (RELAY_EVENTS.has(entry.event) || FIELD_EVENTS.has(entry.event))
                continue;
            // One indexed query per event — no athlete lookups needed
            const allTimes = await ctx.db
                .query("times")
                .withIndex("by_event", (q) => q.eq("event", entry.event))
                .collect();
            let eventPoints = 0;
            for (const athleteId of entry.athleteIds) {
                if (!athleteId)
                    continue;
                const athleteTime = allTimes.find((t) => t.athleteId === athleteId);
                // Use manual override if no actual time exists
                const override = !athleteTime
                    ? overrides.find((o) => o.event === entry.event && o.athleteId === athleteId)
                    : undefined;
                let time = athleteTime?.time ?? override?.time;
                // If still no time, try Riegel prediction from other events
                if (time == null) {
                    const athleteAllTimes = await ctx.db
                        .query("times")
                        .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
                        .collect();
                    const pred = predictEventTime(athleteAllTimes.map((t) => ({ event: t.event, time: t.time })), entry.event);
                    if (pred)
                        time = pred.time;
                }
                if (time == null)
                    continue;
                // Approximate rank = count of faster times
                const fasterCount = allTimes.filter((t) => t.time < time).length;
                const pts = PLACE_POINTS[fasterCount] ?? 0;
                eventPoints += pts;
            }
            if (eventPoints > 0)
                result[entry.event] = eventPoints;
        }
        return result;
    },
});
// ---------------------------------------------------------------------------
// meetProjectedScores — scores each team against ALL 4A schools using the
// exact same algorithm as the LineupEditor (computeEventTop8 helper).
// ---------------------------------------------------------------------------
export const meetProjectedScores = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        const meet = await ctx.db.get(args.meetId);
        if (!meet)
            return {};
        const allEntries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        const timeOverrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        const fieldMarks = await ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        const teams = await ctx.db.query("teams").collect();
        const teamNameMap = new Map();
        for (const t of teams) {
            const words = t.name.split(" ");
            teamNameMap.set(t.slug, words.length > 1 ? words.slice(0, -1).join(" ") : t.name);
        }
        const submittedTeams = new Set(allEntries.map((e) => e.teamSlug));
        const teamPoints = new Map();
        for (const slug of meet.teamSlugs)
            teamPoints.set(slug, 0);
        // ---- Individual track events ----
        const allIndividualEvents = new Set(allEntries
            .filter((e) => !RELAY_EVENTS.has(e.event) && !FIELD_EVENTS.has(e.event))
            .map((e) => e.event));
        for (const event of allIndividualEvents) {
            // Get the same top-8 competing list that the LineupEditor uses
            const top8 = await computeEventTop8(ctx, event, args.meetId, teamNameMap);
            const rankedTimes = top8.map((r) => r.time);
            // Get direct times for override/prediction lookup
            const allTimes = await ctx.db
                .query("times")
                .withIndex("by_event", (q) => q.eq("event", event))
                .collect();
            const teamEntries = allEntries.filter((e) => e.event === event);
            for (const entry of teamEntries) {
                const ourAthletes = [];
                for (const athleteId of entry.athleteIds) {
                    if (!athleteId)
                        continue;
                    const override = timeOverrides.find((o) => o.event === event && o.athleteId === athleteId && o.teamSlug === entry.teamSlug);
                    let time;
                    if (override) {
                        time = override.time;
                    }
                    else {
                        const t = allTimes.find((t) => t.athleteId === athleteId);
                        if (t) {
                            time = t.time;
                        }
                        else if (ESTIMATE_OK_EVENTS.has(event)) {
                            const athleteAllTimes = await ctx.db
                                .query("times")
                                .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
                                .collect();
                            const pred = predictEventTime(athleteAllTimes.map((t) => ({ event: t.event, time: t.time })), event);
                            if (pred)
                                time = pred.time;
                        }
                    }
                    if (time != null)
                        ourAthletes.push(time);
                }
                ourAthletes.sort((a, b) => a - b);
                const usedPlaces = new Set();
                for (const time of ourAthletes) {
                    const betterCount = rankedTimes.filter((t) => t < time).length;
                    let place = betterCount;
                    while (usedPlaces.has(place))
                        place++;
                    if (place >= 8)
                        continue;
                    usedPlaces.add(place);
                    teamPoints.set(entry.teamSlug, (teamPoints.get(entry.teamSlug) ?? 0) + (PLACE_POINTS[place] ?? 0));
                }
            }
        }
        // ---- Field events ----
        const allFieldEvents = new Set(fieldMarks.map((m) => m.event));
        for (const event of allFieldEvents) {
            const top8 = await computeEventTop8(ctx, event, args.meetId, teamNameMap);
            const rankedMarks = top8.map((r) => r.time);
            const eventMarks = fieldMarks.filter((m) => m.event === event);
            const byTeam = new Map();
            for (const m of eventMarks) {
                const arr = byTeam.get(m.teamSlug) ?? [];
                arr.push(m.mark);
                byTeam.set(m.teamSlug, arr);
            }
            for (const [slug, marks] of byTeam) {
                marks.sort((a, b) => b - a);
                const usedPlaces = new Set();
                for (const mark of marks) {
                    const betterCount = rankedMarks.filter((m) => m > mark).length;
                    let place = betterCount;
                    while (usedPlaces.has(place))
                        place++;
                    if (place >= 8)
                        continue;
                    usedPlaces.add(place);
                    teamPoints.set(slug, (teamPoints.get(slug) ?? 0) + (PLACE_POINTS[place] ?? 0));
                }
            }
        }
        // ---- Relay events ----
        const allRelayEvents = new Set(allEntries.filter((e) => RELAY_EVENTS.has(e.event)).map((e) => e.event));
        for (const event of allRelayEvents) {
            const allRelayTimes = await ctx.db
                .query("relayTimes")
                .withIndex("by_event", (q) => q.eq("event", event))
                .collect();
            const enteredTeams = new Set(allEntries.filter((e) => e.event === event).map((e) => e.teamSlug));
            const teamBestTime = new Map();
            for (const r of allRelayTimes) {
                if (submittedTeams.has(r.team) && !enteredTeams.has(r.team))
                    continue;
                const cur = teamBestTime.get(r.team);
                if (cur == null || r.time < cur)
                    teamBestTime.set(r.team, r.time);
            }
            const relayEntries = allEntries.filter((e) => e.event === event);
            for (const entry of relayEntries) {
                if (entry.predictedRelayTime != null) {
                    const cur = teamBestTime.get(entry.teamSlug);
                    const best = cur != null ? Math.min(cur, entry.predictedRelayTime) : entry.predictedRelayTime;
                    teamBestTime.set(entry.teamSlug, best);
                }
            }
            for (const entry of relayEntries) {
                const ourTime = teamBestTime.get(entry.teamSlug);
                if (ourTime == null)
                    continue;
                const fasterCount = [...teamBestTime.entries()]
                    .filter(([slug, t]) => slug !== entry.teamSlug && t < ourTime).length;
                if (fasterCount < 8) {
                    teamPoints.set(entry.teamSlug, (teamPoints.get(entry.teamSlug) ?? 0) + (PLACE_POINTS[fasterCount] ?? 0));
                }
            }
        }
        return Object.fromEntries(teamPoints);
    },
});
// ---------------------------------------------------------------------------
// simulate — pure query, returns results without persisting anything
// ---------------------------------------------------------------------------
export const simulate = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        const meet = await ctx.db.get(args.meetId);
        if (!meet)
            return null;
        const entries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        const fieldMarks = await ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        const timeOverrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        // Fetch all unique athletes referenced
        const athleteIdSet = new Set();
        for (const e of entries) {
            for (const id of e.athleteIds)
                athleteIdSet.add(id);
        }
        for (const m of fieldMarks)
            athleteIdSet.add(m.athleteId);
        // athlete times keyed by athleteId
        const timesMap = new Map();
        const athleteNames = new Map();
        for (const id of athleteIdSet) {
            const athlete = await ctx.db.get(id);
            if (athlete && "name" in athlete)
                athleteNames.set(id, athlete.name);
            const times = await ctx.db
                .query("times")
                .withIndex("by_athlete", (q) => q.eq("athleteId", id))
                .collect();
            timesMap.set(id, times.map((t) => ({ event: t.event, time: t.time })));
        }
        // Group entries by event
        const entriesByEvent = new Map();
        for (const e of entries) {
            const list = entriesByEvent.get(e.event) ?? [];
            list.push(e);
            entriesByEvent.set(e.event, list);
        }
        // Group field marks by event
        const marksByEvent = new Map();
        for (const m of fieldMarks) {
            const list = marksByEvent.get(m.event) ?? [];
            list.push(m);
            marksByEvent.set(m.event, list);
        }
        // Collect all events present across entries + field marks
        const allEventNames = new Set([
            ...entriesByEvent.keys(),
            ...marksByEvent.keys(),
        ]);
        // Team points accumulator
        const teamPoints = new Map();
        for (const slug of meet.teamSlugs)
            teamPoints.set(slug, 0);
        const byEvent = [];
        for (const event of allEventNames) {
            if (FIELD_EVENTS.has(event)) {
                // Field event — highest mark wins
                const marks = marksByEvent.get(event) ?? [];
                const sorted = [...marks].sort((a, b) => b.mark - a.mark);
                const places = sorted.map((m, i) => {
                    const pts = PLACE_POINTS[i] ?? 0;
                    teamPoints.set(m.teamSlug, (teamPoints.get(m.teamSlug) ?? 0) + pts);
                    return {
                        place: i + 1,
                        athleteId: m.athleteId,
                        athleteName: athleteNames.get(m.athleteId) ?? "Unknown",
                        teamSlug: m.teamSlug,
                        value: m.mark,
                        estimated: false,
                        points: pts,
                    };
                });
                byEvent.push({ event, places });
            }
            else if (RELAY_EVENTS.has(event)) {
                // Relay — sum predicted/actual leg times
                const legDistances = RELAY_LEG_DISTANCES[event] ?? [];
                const eventEntries = entriesByEvent.get(event) ?? [];
                const relayTimes = [];
                for (const entry of eventEntries) {
                    let total = 0;
                    let estimated = false;
                    let valid = true;
                    for (let i = 0; i < legDistances.length; i++) {
                        const athleteId = entry.athleteIds[i];
                        if (!athleteId) {
                            valid = false;
                            break;
                        }
                        const targetDist = legDistances[i];
                        const athleteTimes = timesMap.get(athleteId) ?? [];
                        // Look for exact event match first
                        // For hurdle relays, match hurdle events; for flat relays, match flat
                        const legIsHurdle = HURDLE_RELAYS.has(event);
                        const exactEventName = Object.entries(EVENT_DISTANCES).find(([name, d]) => d === targetDist && HURDLE_EVENTS.has(name) === legIsHurdle)?.[0];
                        const exact = exactEventName
                            ? athleteTimes.find((t) => t.event === exactEventName)
                            : undefined;
                        if (exact) {
                            total += exact.time;
                        }
                        else {
                            // Check for manual override before trying prediction
                            const override = timeOverrides.find((o) => o.event === event && o.athleteId === athleteId && o.teamSlug === entry.teamSlug);
                            if (override) {
                                total += override.time;
                            }
                            else {
                                // Only estimate for legs ≤ 200m — longer legs are too unreliable
                                if (targetDist > 200) {
                                    valid = false;
                                    break;
                                }
                                // Riegel prediction — weighted by closeness in log-distance
                                // For hurdle relays, only use hurdle times; for flat relays, only flat
                                // Cap at 3x distance ratio to avoid unreliable extrapolations
                                const legIsHurdle = HURDLE_RELAYS.has(event);
                                const predictions = [];
                                for (const t of athleteTimes) {
                                    const knownDist = EVENT_DISTANCES[t.event];
                                    if (!knownDist)
                                        continue;
                                    if (HURDLE_EVENTS.has(t.event) !== legIsHurdle)
                                        continue;
                                    const ratio = knownDist > targetDist ? knownDist / targetDist : targetDist / knownDist;
                                    if (ratio > 3)
                                        continue;
                                    const pred = riegelPredict(knownDist, t.time, targetDist);
                                    const weight = 1 / Math.abs(Math.log(knownDist / targetDist));
                                    predictions.push({ pred, weight });
                                }
                                if (predictions.length === 0) {
                                    valid = false;
                                    break;
                                }
                                const totalWeight = predictions.reduce((s, p) => s + p.weight, 0);
                                const weighted = predictions.reduce((s, p) => s + p.pred * p.weight, 0) / totalWeight;
                                total += weighted;
                                estimated = true;
                            }
                        }
                    }
                    if (valid)
                        relayTimes.push({ teamSlug: entry.teamSlug, totalTime: total, estimated });
                }
                const sorted = relayTimes.sort((a, b) => a.totalTime - b.totalTime);
                const places = sorted.map((r, i) => {
                    const pts = PLACE_POINTS[i] ?? 0;
                    teamPoints.set(r.teamSlug, (teamPoints.get(r.teamSlug) ?? 0) + pts);
                    return {
                        place: i + 1,
                        athleteId: "",
                        athleteName: `${r.teamSlug} relay`,
                        teamSlug: r.teamSlug,
                        value: r.totalTime,
                        estimated: r.estimated,
                        points: pts,
                    };
                });
                byEvent.push({ event, places });
            }
            else {
                // Individual track event — lowest time wins
                // Each entry can have up to 2 athleteIds (2 per team per event)
                const eventEntries = entriesByEvent.get(event) ?? [];
                const rows = [];
                for (const entry of eventEntries) {
                    for (const athleteId of entry.athleteIds) {
                        if (!athleteId)
                            continue;
                        // Check for a manual time override first
                        const override = timeOverrides.find((o) => o.event === event && o.athleteId === athleteId && o.teamSlug === entry.teamSlug);
                        if (override) {
                            rows.push({ athleteId, teamSlug: entry.teamSlug, time: override.time });
                        }
                        else {
                            const athleteTimes = timesMap.get(athleteId) ?? [];
                            const t = athleteTimes.find((t) => t.event === event);
                            if (t)
                                rows.push({ athleteId, teamSlug: entry.teamSlug, time: t.time });
                        }
                    }
                }
                const sorted = rows.sort((a, b) => a.time - b.time);
                const places = sorted.map((r, i) => {
                    const pts = PLACE_POINTS[i] ?? 0;
                    teamPoints.set(r.teamSlug, (teamPoints.get(r.teamSlug) ?? 0) + pts);
                    return {
                        place: i + 1,
                        athleteId: r.athleteId,
                        athleteName: athleteNames.get(r.athleteId) ?? "Unknown",
                        teamSlug: r.teamSlug,
                        value: r.time,
                        estimated: false,
                        points: pts,
                    };
                });
                byEvent.push({ event, places });
            }
        }
        // Sort by event order — use the ALL_EVENTS order from events.ts
        const EVENT_ORDER = [
            "100 Meters", "200 Meters", "400 Meters", "800 Meters", "1500 Meters", "3000 Meters",
            "100 Meter Hurdles", "400 Meter Hurdles",
            "High Jump", "Long Jump", "Shot Put", "Discus Throw",
            "4x100 Meter Relay", "4x200 Meter Relay", "4x400 Meter Relay", "4x800 Meter Relay",
            "Sprint Medley Relay", "Distance Medley Relay", "Shuttle Hurdle Relay",
        ];
        byEvent.sort((a, b) => (EVENT_ORDER.indexOf(a.event) ?? 99) - (EVENT_ORDER.indexOf(b.event) ?? 99));
        // Build team standings
        const teamStandings = [...teamPoints.entries()]
            .map(([slug, points]) => ({ teamSlug: slug, points }))
            .sort((a, b) => b.points - a.points);
        return { byEvent, teamStandings };
    },
});
// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export const recalculateAllProjectedTotals = action({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        // Reuse the existing meetProjectedScores query which has all the scoring logic
        const scores = await ctx.runQuery(api.meets.meetProjectedScores, { meetId: args.meetId });
        for (const [teamSlug, total] of Object.entries(scores)) {
            await ctx.runMutation(api.meets.saveProjectedTotal, {
                meetId: args.meetId,
                teamSlug,
                total: total,
            });
        }
    },
});
export const saveProjectedTotal = mutation({
    args: { meetId: v.id("meets"), teamSlug: v.string(), total: v.number() },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("meetTeamProjections")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { total: args.total });
        }
        else {
            await ctx.db.insert("meetTeamProjections", {
                meetId: args.meetId,
                teamSlug: args.teamSlug,
                total: args.total,
            });
        }
    },
});
export const getProjectedTotals = query({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("meetTeamProjections")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        return Object.fromEntries(rows.map((r) => [r.teamSlug, r.total]));
    },
});
export const create = mutation({
    args: { name: v.string(), date: v.optional(v.string()) },
    handler: async (ctx, args) => {
        return ctx.db.insert("meets", {
            name: args.name,
            date: args.date,
            teamSlugs: [],
        });
    },
});
export const addTeam = mutation({
    args: { meetId: v.id("meets"), teamSlug: v.string() },
    handler: async (ctx, args) => {
        const meet = await ctx.db.get(args.meetId);
        if (!meet)
            throw new Error("Meet not found");
        if (meet.teamSlugs.includes(args.teamSlug))
            return;
        await ctx.db.patch(args.meetId, {
            teamSlugs: [...meet.teamSlugs, args.teamSlug],
        });
    },
});
export const removeTeam = mutation({
    args: { meetId: v.id("meets"), teamSlug: v.string() },
    handler: async (ctx, args) => {
        const meet = await ctx.db.get(args.meetId);
        if (!meet)
            throw new Error("Meet not found");
        await ctx.db.patch(args.meetId, {
            teamSlugs: meet.teamSlugs.filter((s) => s !== args.teamSlug),
        });
        // Remove all entries and marks for this team in this meet
        const entries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .collect();
        for (const e of entries)
            await ctx.db.delete(e._id);
        const marks = await ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .collect();
        for (const m of marks)
            await ctx.db.delete(m._id);
        const overrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .collect();
        for (const o of overrides)
            await ctx.db.delete(o._id);
    },
});
export const setEntry = mutation({
    args: {
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        athleteIds: v.array(v.id("athletes")),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .filter((q) => q.eq(q.field("event"), args.event))
            .first();
        if (existing) {
            // Clean up overrides for athletes removed from this entry
            const oldIds = new Set(existing.athleteIds.map(String));
            const newIds = new Set(args.athleteIds.map(String));
            for (const oldId of oldIds) {
                if (!newIds.has(oldId)) {
                    const override = await ctx.db
                        .query("meetTimeOverrides")
                        .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
                        .filter((q) => q.and(q.eq(q.field("event"), args.event), q.eq(q.field("athleteId"), oldId)))
                        .first();
                    if (override)
                        await ctx.db.delete(override._id);
                }
            }
            if (args.athleteIds.length === 0) {
                await ctx.db.delete(existing._id);
            }
            else {
                await ctx.db.patch(existing._id, { athleteIds: args.athleteIds });
            }
        }
        else if (args.athleteIds.length > 0) {
            await ctx.db.insert("meetEntries", {
                meetId: args.meetId,
                teamSlug: args.teamSlug,
                event: args.event,
                athleteIds: args.athleteIds,
            });
        }
    },
});
export const setFieldMark = mutation({
    args: {
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        athleteId: v.id("athletes"),
        mark: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .filter((q) => q.and(q.eq(q.field("event"), args.event), q.eq(q.field("athleteId"), args.athleteId)))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { mark: args.mark });
        }
        else {
            await ctx.db.insert("meetFieldMarks", {
                meetId: args.meetId,
                teamSlug: args.teamSlug,
                event: args.event,
                athleteId: args.athleteId,
                mark: args.mark,
            });
        }
    },
});
export const setTimeOverride = mutation({
    args: {
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        athleteId: v.id("athletes"),
        time: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet_team", (q) => q.eq("meetId", args.meetId).eq("teamSlug", args.teamSlug))
            .filter((q) => q.and(q.eq(q.field("event"), args.event), q.eq(q.field("athleteId"), args.athleteId)))
            .first();
        if (args.time != null) {
            if (existing) {
                await ctx.db.patch(existing._id, { time: args.time });
            }
            else {
                await ctx.db.insert("meetTimeOverrides", {
                    meetId: args.meetId,
                    teamSlug: args.teamSlug,
                    event: args.event,
                    athleteId: args.athleteId,
                    time: args.time,
                });
            }
        }
        else if (existing) {
            await ctx.db.delete(existing._id);
        }
    },
});
export const deleteMeet = mutation({
    args: { meetId: v.id("meets") },
    handler: async (ctx, args) => {
        // Delete all entries
        const entries = await ctx.db
            .query("meetEntries")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        for (const e of entries)
            await ctx.db.delete(e._id);
        // Delete all field marks
        const marks = await ctx.db
            .query("meetFieldMarks")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        for (const m of marks)
            await ctx.db.delete(m._id);
        // Delete all time overrides
        const overrides = await ctx.db
            .query("meetTimeOverrides")
            .withIndex("by_meet", (q) => q.eq("meetId", args.meetId))
            .collect();
        for (const o of overrides)
            await ctx.db.delete(o._id);
        await ctx.db.delete(args.meetId);
    },
});
