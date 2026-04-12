import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
  },
});

export const upsert = mutation({
  args: { slug: v.string(), name: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, url: args.url });
      return existing._id;
    }
    return await ctx.db.insert("teams", {
      slug: args.slug,
      name: args.name,
      url: args.url,
    });
  },
});

export const markImported = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (team) {
      await ctx.db.patch(team._id, { lastImported: Date.now() });
    }
  },
});
