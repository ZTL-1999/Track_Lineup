import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const setRelayLeg = mutation({
  args: {
    relayEvent: v.string(),
    leg: v.number(),
    athleteId: v.id("athletes"),
  },
  handler: async (ctx, args) => {
    // Remove any existing assignment for this relay+leg
    const existing = await ctx.db
      .query("relayAssignments")
      .withIndex("by_relay", (q) => q.eq("relayEvent", args.relayEvent))
      .collect();
    const legMatch = existing.find((a) => a.leg === args.leg);
    if (legMatch) {
      await ctx.db.delete(legMatch._id);
    }
    // Also remove this athlete from any other leg in this relay
    const athleteMatch = existing.find((a) => a.athleteId === args.athleteId);
    if (athleteMatch) {
      await ctx.db.delete(athleteMatch._id);
    }
    await ctx.db.insert("relayAssignments", {
      relayEvent: args.relayEvent,
      leg: args.leg,
      athleteId: args.athleteId,
    });
  },
});

export const removeRelayLeg = mutation({
  args: {
    relayEvent: v.string(),
    leg: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("relayAssignments")
      .withIndex("by_relay", (q) => q.eq("relayEvent", args.relayEvent))
      .collect();
    const match = existing.find((a) => a.leg === args.leg);
    if (match) {
      await ctx.db.delete(match._id);
    }
  },
});

export const clearRelay = mutation({
  args: { relayEvent: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("relayAssignments")
      .withIndex("by_relay", (q) => q.eq("relayEvent", args.relayEvent))
      .collect();
    for (const a of existing) {
      await ctx.db.delete(a._id);
    }
  },
});
