import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    url: v.string(),
    lastImported: v.optional(v.number()),
  }).index("by_slug", ["slug"]),
  athletes: defineTable({
    name: v.string(),
    grade: v.optional(v.string()),
    team: v.optional(v.string()), // team slug
  }).index("by_team", ["team"]),
  times: defineTable({
    athleteId: v.id("athletes"),
    event: v.string(),
    time: v.number(), // time in seconds
  }).index("by_athlete", ["athleteId"])
    .index("by_event", ["event"]),
  relayAssignments: defineTable({
    relayEvent: v.string(),
    leg: v.number(), // 1-4
    athleteId: v.id("athletes"),
    team: v.optional(v.string()), // team slug
  }).index("by_relay", ["relayEvent"])
    .index("by_relay_team", ["relayEvent", "team"]),
});
