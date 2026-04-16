import { query } from "./_generated/server";
import { v } from "convex/values";
export const list = query({
    args: { team: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (args.team) {
            return await ctx.db
                .query("athletes")
                .withIndex("by_team", (q) => q.eq("team", args.team))
                .collect();
        }
        return await ctx.db.query("athletes").collect();
    },
});
export const getWithTimes = query({
    args: { athleteId: v.id("athletes") },
    handler: async (ctx, args) => {
        const athlete = await ctx.db.get(args.athleteId);
        if (!athlete)
            return null;
        const times = await ctx.db
            .query("times")
            .withIndex("by_athlete", (q) => q.eq("athleteId", args.athleteId))
            .collect();
        return { ...athlete, times };
    },
});
export const listWithTimes = query({
    args: { team: v.optional(v.string()) },
    handler: async (ctx, args) => {
        let athletes;
        if (args.team) {
            athletes = await ctx.db
                .query("athletes")
                .withIndex("by_team", (q) => q.eq("team", args.team))
                .collect();
        }
        else {
            athletes = await ctx.db.query("athletes").collect();
        }
        const results = await Promise.all(athletes.map(async (athlete) => {
            const times = await ctx.db
                .query("times")
                .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
                .collect();
            return { ...athlete, times };
        }));
        return results;
    },
});
