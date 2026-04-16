import { mutation } from "./_generated/server";
import { v } from "convex/values";
export const addAthlete = mutation({
    args: { name: v.string(), grade: v.optional(v.string()), team: v.optional(v.string()) },
    handler: async (ctx, args) => {
        return await ctx.db.insert("athletes", {
            name: args.name,
            grade: args.grade,
            team: args.team,
        });
    },
});
export const removeAthlete = mutation({
    args: { athleteId: v.id("athletes") },
    handler: async (ctx, args) => {
        // Remove all times for this athlete
        const times = await ctx.db
            .query("times")
            .withIndex("by_athlete", (q) => q.eq("athleteId", args.athleteId))
            .collect();
        for (const t of times) {
            await ctx.db.delete(t._id);
        }
        // Remove relay assignments
        const assignments = await ctx.db.query("relayAssignments").collect();
        for (const a of assignments) {
            if (a.athleteId === args.athleteId) {
                await ctx.db.delete(a._id);
            }
        }
        await ctx.db.delete(args.athleteId);
    },
});
export const updateAthlete = mutation({
    args: { athleteId: v.id("athletes"), name: v.string(), grade: v.optional(v.string()) },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.athleteId, { name: args.name, grade: args.grade });
    },
});
export const setTime = mutation({
    args: {
        athleteId: v.id("athletes"),
        event: v.string(),
        time: v.number(),
    },
    handler: async (ctx, args) => {
        // Check if a time already exists for this athlete/event
        const existing = await ctx.db
            .query("times")
            .withIndex("by_athlete", (q) => q.eq("athleteId", args.athleteId))
            .collect();
        const match = existing.find((t) => t.event === args.event);
        if (match) {
            await ctx.db.patch(match._id, { time: args.time });
        }
        else {
            await ctx.db.insert("times", {
                athleteId: args.athleteId,
                event: args.event,
                time: args.time,
            });
        }
    },
});
export const removeTime = mutation({
    args: { athleteId: v.id("athletes"), event: v.string() },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("times")
            .withIndex("by_athlete", (q) => q.eq("athleteId", args.athleteId))
            .collect();
        const match = existing.find((t) => t.event === args.event);
        if (match) {
            await ctx.db.delete(match._id);
        }
    },
});
