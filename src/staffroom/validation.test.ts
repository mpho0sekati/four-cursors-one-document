import { describe, expect, it } from "vitest";
import { checkLessonDuration, computeTotal, draftLevel, levelFromPercent, rebalanceMinutes } from "./validation";

describe("lesson timing", () => {
  it("flags 55 minutes of activities in a 40-minute lesson", () => {
    expect(checkLessonDuration([10, 20, 15, 10], 40)).toEqual({ ok: false, total: 55, over: 15 });
  });
  it("rebalances timings to exactly the lesson duration", () => {
    const fixed = rebalanceMinutes([10, 20, 15, 10], 40);
    expect(fixed).toEqual([7, 15, 11, 7]);
    expect(checkLessonDuration(fixed, 40).ok).toBe(true);
  });
});

describe("marks", () => {
  it("adds question marks", () => {
    expect(computeTotal([3, 3, 7, 4])).toBe(17);
  });
  it("does not invent a total when a mark is missing", () => {
    expect(computeTotal([5, 5, null, 4])).toBeNull();
  });
});

describe("achievement levels", () => {
  it("maps 92% to level 7 while the draft heuristic gives invalid 8", () => {
    expect(levelFromPercent(92)).toBe(7);
    expect(draftLevel(92)).toBe(8);
  });
});
