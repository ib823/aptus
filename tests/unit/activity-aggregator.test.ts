import { describe, it, expect } from "vitest";
import { aggregateActivities, type RawActivity } from "@/lib/collaboration/activity-aggregator";

describe("aggregateActivities", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateActivities([])).toEqual([]);
  });

  it("returns single entry for single activity", () => {
    const activities: RawActivity[] = [
      {
        actorId: "user1",
        actionType: "classified_steps",
        entityType: "STEP",
        areaCode: "FI",
        timestamp: 1000,
      },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      actorId: "user1",
      actionType: "classified_steps",
      entityType: "STEP",
      areaCode: "FI",
      count: 1,
      firstTimestamp: 1000,
      lastTimestamp: 1000,
    });
  });

  it("aggregates activities within the 30s window", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 5000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 10000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(3);
    expect(result[0]?.firstTimestamp).toBe(1000);
    expect(result[0]?.lastTimestamp).toBe(10000);
  });

  it("creates separate groups when window expires", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 5000 },
      // Gap > 30s from last activity
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 40000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(2);
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.count).toBe(1);
  });

  it("separates different actors", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user2", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 2000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(2);
  });

  it("separates different action types", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "added_gap", entityType: "STEP", areaCode: "FI", timestamp: 2000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(2);
  });

  it("separates different entity types", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "GAP", areaCode: "FI", timestamp: 2000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(2);
  });

  it("separates different area codes", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "MM", timestamp: 2000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(2);
  });

  it("handles null area codes consistently", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: null, timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: null, timestamp: 2000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(2);
  });

  it("sorts unsorted input before aggregating", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 5000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000 },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 3000 },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(3);
    expect(result[0]?.firstTimestamp).toBe(1000);
    expect(result[0]?.lastTimestamp).toBe(5000);
  });

  it("preserves metadata from the first activity in a group", () => {
    const activities: RawActivity[] = [
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 1000, metadata: { key: "first" } },
      { actorId: "user1", actionType: "classified_steps", entityType: "STEP", areaCode: "FI", timestamp: 2000, metadata: { key: "second" } },
    ];
    const result = aggregateActivities(activities);
    expect(result).toHaveLength(1);
    expect(result[0]?.metadata).toEqual({ key: "first" });
  });
});
