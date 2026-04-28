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
    meets: defineTable({
        name: v.string(),
        date: v.optional(v.string()),
        teamSlugs: v.array(v.string()),
    }).index("by_name", ["name"]),
    meetEntries: defineTable({
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        // Individual: [athleteId], Relay: [leg1Id, leg2Id, leg3Id, leg4Id]
        athleteIds: v.array(v.id("athletes")),
        // Relay only: client-computed adjusted predicted time (seconds)
        predictedRelayTime: v.optional(v.number()),
    }).index("by_meet", ["meetId"])
        .index("by_meet_team", ["meetId", "teamSlug"]),
    meetFieldMarks: defineTable({
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        athleteId: v.id("athletes"),
        mark: v.number(), // meters for field events
    }).index("by_meet", ["meetId"])
        .index("by_meet_team", ["meetId", "teamSlug"]),
    meetTimeOverrides: defineTable({
        meetId: v.id("meets"),
        teamSlug: v.string(),
        event: v.string(),
        athleteId: v.id("athletes"),
        time: v.number(), // seconds
    }).index("by_meet", ["meetId"])
        .index("by_meet_team", ["meetId", "teamSlug"]),
    relayTimes: defineTable({
        team: v.string(), // team slug
        event: v.string(), // e.g. "4x100 Meter Relay"
        time: v.number(), // seconds (best time)
        athletes: v.array(v.string()), // athlete names in leg order
    }).index("by_team", ["team"])
        .index("by_event", ["event"]),
    meetTeamProjections: defineTable({
        meetId: v.id("meets"),
        teamSlug: v.string(),
        total: v.number(),
    }).index("by_meet", ["meetId"])
        .index("by_meet_team", ["meetId", "teamSlug"]),
    meetSimulations: defineTable({
        meetId: v.id("meets"),
        name: v.string(),
        eventOverrides: v.array(v.object({
            event: v.string(),
            places: v.array(v.object({
                place: v.number(),
                athleteId: v.string(),
                athleteName: v.string(),
                teamSlug: v.string(),
                value: v.number(),
                estimated: v.boolean(),
                points: v.number(),
            })),
        })),
    }).index("by_meet", ["meetId"]),
});
