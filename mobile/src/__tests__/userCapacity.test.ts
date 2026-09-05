import { calculateUserCapacity, UserCapacity } from "../utils/userCapacity";

type Hike = {
  id: string;
  status: string;
  durationS: number | null;
  elevationGainM: number | null;
};

function makeHike(
  id: string,
  status: string,
  durationS: number | null,
  elevationGainM: number | null
): Hike {
  return { id, status, durationS, elevationGainM };
}

describe("calculateUserCapacity", () => {
  it("returns nulls for empty hike history", () => {
    const result = calculateUserCapacity([]);
    expect(result.learnedComfortDurationH).toBeNull();
    expect(result.learnedComfortElevationGainM).toBeNull();
  });

  it("returns nulls when all hikes are in_progress (no completed)", () => {
    const hikes: Hike[] = [
      makeHike("1", "in_progress", 7200, 300),
      makeHike("2", "in_progress", 3600, 150),
    ];
    const result = calculateUserCapacity(hikes);
    expect(result.learnedComfortDurationH).toBeNull();
    expect(result.learnedComfortElevationGainM).toBeNull();
  });

  it("computes 75th-percentile comfort duration from completed hikes", () => {
    // 3 completed hikes with durations: 1h, 2h, 3h (3600s, 7200s, 10800s)
    // Sorted: [1, 2, 3]; p=0.75 → index = floor(2 * 0.75) = 1 → value = 2h
    const hikes: Hike[] = [
      makeHike("1", "completed", 3_600, null),
      makeHike("2", "completed", 7_200, null),
      makeHike("3", "completed", 10_800, null),
    ];
    const result = calculateUserCapacity(hikes);
    // 75th percentile of [1, 2, 3] hours = 2h (floor-index method)
    expect(result.learnedComfortDurationH).toBe(2);
  });

  it("returns non-null learned values after 5 completed hikes with valid data", () => {
    const hikes: Hike[] = [
      makeHike("1", "completed", 3_600, 100),
      makeHike("2", "completed", 7_200, 200),
      makeHike("3", "completed", 10_800, 300),
      makeHike("4", "completed", 5_400, 150),
      makeHike("5", "completed", 9_000, 250),
    ];
    const result = calculateUserCapacity(hikes);
    expect(result.learnedComfortDurationH).not.toBeNull();
    expect(result.learnedComfortElevationGainM).not.toBeNull();
  });

  it("counts only completed hikes when mix of statuses are present", () => {
    // 3 completed (1h, 2h, 3h) meet the 3-sample minimum; the 2 in_progress
    // hikes carry extreme durations and must be excluded entirely.
    // Sorted [1, 2, 3]; p=0.75 → index = floor(2 * 0.75) = 1 → 2h
    const hikes: Hike[] = [
      makeHike("1", "completed", 3_600, null),
      makeHike("2", "completed", 7_200, null),
      makeHike("3", "completed", 10_800, null),
      makeHike("4", "in_progress", 360_000, null),
      makeHike("5", "in_progress", 720_000, null),
    ];
    const result = calculateUserCapacity(hikes);
    // If in_progress leaked in, the percentile would be 100h instead of 2h.
    expect(result.learnedComfortDurationH).toBe(2);
    expect(result.sampleSize).toBe(3);
  });

  it("ignores hikes with null or zero durationS when computing comfort duration", () => {
    // 5 hikes carry a valid duration (1h, 2h, 3h, 4h, 100h); one is null and
    // one is zero, and both must be dropped before the percentile is taken.
    // Sorted [1, 2, 3, 4, 100]; p=0.75 → index = floor(4 * 0.75) = 3 → 4h
    const hikes: Hike[] = [
      makeHike("1", "completed", 3_600, null),
      makeHike("2", "completed", 7_200, null),
      makeHike("3", "completed", 10_800, null),
      makeHike("4", "completed", 14_400, null),
      makeHike("5", "completed", 360_000, null),
      makeHike("6", "completed", null, null),
      makeHike("7", "completed", 0, null),
    ];
    const result = calculateUserCapacity(hikes);
    // If the zero-duration hike leaked in, the percentile would be 3h, not 4h.
    expect(result.learnedComfortDurationH).toBe(4);
  });

  it("returns null learned values when fewer than three valid samples exist", () => {
    // Two completed hikes is below the 3-sample minimum, so no learned
    // comfort value is exposed to the UI.
    const hikes: Hike[] = [
      makeHike("1", "completed", 3_600, 100),
      makeHike("2", "completed", 10_800, 300),
    ];
    const result = calculateUserCapacity(hikes);
    expect(result.learnedComfortDurationH).toBeNull();
    expect(result.learnedComfortElevationGainM).toBeNull();
    expect(result.sampleSize).toBe(2);
  });
});
