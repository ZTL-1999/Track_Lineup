import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAssignments = query({
  args: { relayEvent: v.string() },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("relayAssignments")
      .withIndex("by_relay", (q) => q.eq("relayEvent", args.relayEvent))
      .collect();
    // Fetch athlete info for each assignment
    const result = await Promise.all(
      assignments.map(async (a) => {
        const athlete = await ctx.db.get(a.athleteId);
        const times = await ctx.db
          .query("times")
          .withIndex("by_athlete", (q) => q.eq("athleteId", a.athleteId))
          .collect();
        return { ...a, athlete, times };
      })
    );
    return result.sort((a, b) => a.leg - b.leg);
  },
});

export const getAllAssignments = query({
  args: {},
  handler: async (ctx) => {
    const assignments = await ctx.db.query("relayAssignments").collect();
    const result = await Promise.all(
      assignments.map(async (a) => {
        const athlete = await ctx.db.get(a.athleteId);
        return { ...a, athlete };
      })
    );
    return result;
  },
});
