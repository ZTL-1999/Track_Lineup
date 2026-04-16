import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
export const listRelayTimes = query({
    args: { event: v.string() },
    handler: async (ctx, args) => {
        const times = await ctx.db
            .query("relayTimes")
            .withIndex("by_event", (q) => q.eq("event", args.event))
            .collect();
        times.sort((a, b) => a.time - b.time);
        return times;
    },
});
// Upsert a single athlete + all their times for a team.
// Called once per athlete by the import script.
export const upsertAthlete = mutation({
    args: {
        team: v.string(),
        name: v.string(),
        grade: v.optional(v.string()),
        times: v.array(v.object({ event: v.string(), time: v.number() })),
    },
    handler: async (ctx, args) => {
        // Find existing athlete by name + team
        const existing = await ctx.db
            .query("athletes")
            .withIndex("by_team", (q) => q.eq("team", args.team))
            .collect();
        let athlete = existing.find((a) => a.name.toLowerCase() === args.name.toLowerCase());
        if (athlete) {
            // Update grade if changed
            if (athlete.grade !== args.grade) {
                await ctx.db.patch(athlete._id, { grade: args.grade });
            }
        }
        else {
            // Create new athlete
            const id = await ctx.db.insert("athletes", {
                name: args.name,
                grade: args.grade,
                team: args.team,
            });
            athlete = (await ctx.db.get(id));
        }
        // Upsert each time
        const existingTimes = await ctx.db
            .query("times")
            .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
            .collect();
        for (const { event, time } of args.times) {
            const match = existingTimes.find((t) => t.event === event);
            if (match) {
                await ctx.db.patch(match._id, { time });
            }
            else {
                await ctx.db.insert("times", {
                    athleteId: athlete._id,
                    event,
                    time,
                });
            }
        }
        return athlete._id;
    },
});
// Remove all athletes + times for a team (for full refresh)
export const clearTeam = mutation({
    args: { team: v.string() },
    handler: async (ctx, args) => {
        const athletes = await ctx.db
            .query("athletes")
            .withIndex("by_team", (q) => q.eq("team", args.team))
            .collect();
        for (const athlete of athletes) {
            // Delete times
            const times = await ctx.db
                .query("times")
                .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
                .collect();
            for (const t of times) {
                await ctx.db.delete(t._id);
            }
            // Delete relay assignments
            const assignments = await ctx.db.query("relayAssignments").collect();
            for (const a of assignments) {
                if (a.athleteId === athlete._id) {
                    await ctx.db.delete(a._id);
                }
            }
            // Delete athlete
            await ctx.db.delete(athlete._id);
        }
        // Delete relay times for this team
        const relayTimes = await ctx.db
            .query("relayTimes")
            .withIndex("by_team", (q) => q.eq("team", args.team))
            .collect();
        for (const rt of relayTimes) {
            await ctx.db.delete(rt._id);
        }
    },
});
// Upsert a relay time for a team
export const upsertRelayTime = mutation({
    args: {
        team: v.string(),
        event: v.string(),
        time: v.number(),
        athletes: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("relayTimes")
            .withIndex("by_team", (q) => q.eq("team", args.team))
            .collect();
        const match = existing.find((r) => r.event === args.event);
        if (match) {
            // Only update if this is faster
            if (args.time < match.time) {
                await ctx.db.patch(match._id, { time: args.time, athletes: args.athletes });
            }
        }
        else {
            await ctx.db.insert("relayTimes", {
                team: args.team,
                event: args.event,
                time: args.time,
                athletes: args.athletes,
            });
        }
    },
});
