import { calculateHikeMetrics, TrackedPoint } from "../utils/hikeMetrics";

// Base coordinates for tests
const BASE_LAT = 45.0;
const BASE_LON = 25.0;

// ~1km north of base (0.009 deg lat ≈ 1001m at 45°)
const POINT_1KM_NORTH_LAT = 45.009;

// ~2km north of base (0.018 deg lat ≈ 2002m at 45°)
const POINT_2KM_NORTH_LAT = 45.018;

const ONE_MINUTE_MS = 60_000;
const THIRTY_MINUTES_MS = 30 * ONE_MINUTE_MS;

describe("calculateHikeMetrics", () => {
  describe("empty and single-point edge cases", () => {
    it("returns zeros and nulls for empty points array", () => {
      const result = calculateHikeMetrics([]);
      expect(result.distanceM).toBe(0);
      expect(result.durationS).toBe(0);
      expect(result.movingTimeS).toBe(0);
      expect(result.elevationGainM).toBe(0);
      expect(result.elevationLossM).toBe(0);
      expect(result.minAltitudeM).toBeNull();
      expect(result.maxAltitudeM).toBeNull();
      expect(result.avgSpeedKmh).toBe(0);
      expect(result.avgPaceMinKm).toBe(0);
    });

    it("returns zeros and nulls for a single point", () => {
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: 100, timestamp: 0 },
      ];
      const result = calculateHikeMetrics(points);
      expect(result.distanceM).toBe(0);
      expect(result.durationS).toBe(0);
      expect(result.movingTimeS).toBe(0);
      expect(result.elevationGainM).toBe(0);
      expect(result.elevationLossM).toBe(0);
      expect(result.minAltitudeM).toBeNull();
      expect(result.maxAltitudeM).toBeNull();
      expect(result.avgSpeedKmh).toBe(0);
      expect(result.avgPaceMinKm).toBe(0);
    });
  });

  describe("distance and duration", () => {
    it("calculates ~1km distance for two points 1km apart", () => {
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: null, timestamp: 0 },
        { latitude: POINT_1KM_NORTH_LAT, longitude: BASE_LON, altitude: null, timestamp: ONE_MINUTE_MS },
      ];
      const result = calculateHikeMetrics(points);
      // Distance should be within 10% of 1000m
      expect(Math.abs(result.distanceM - 1000)).toBeLessThan(100);
      expect(result.durationS).toBe(60);
    });
  });

  describe("elevation", () => {
    it("calculates elevation gain and loss correctly (only changes >3m threshold)", () => {
      // altitudes [100, 200, 150]: gain = 100 (200-100=100 > 3), loss = 50 (200-150=50 > 3)
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: 100, timestamp: 0 },
        { latitude: POINT_1KM_NORTH_LAT, longitude: BASE_LON, altitude: 200, timestamp: ONE_MINUTE_MS },
        { latitude: POINT_2KM_NORTH_LAT, longitude: BASE_LON, altitude: 150, timestamp: 2 * ONE_MINUTE_MS },
      ];
      const result = calculateHikeMetrics(points);
      expect(result.elevationGainM).toBe(100);
      expect(result.elevationLossM).toBe(50);
    });

    it("ignores altitude changes at or below the 3m noise threshold", () => {
      // Changes of exactly 3m or less should not be counted
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: 100, timestamp: 0 },
        { latitude: POINT_1KM_NORTH_LAT, longitude: BASE_LON, altitude: 103, timestamp: ONE_MINUTE_MS },
        { latitude: POINT_2KM_NORTH_LAT, longitude: BASE_LON, altitude: 100, timestamp: 2 * ONE_MINUTE_MS },
      ];
      const result = calculateHikeMetrics(points);
      expect(result.elevationGainM).toBe(0);
      expect(result.elevationLossM).toBe(0);
    });

    it("returns min and max altitude from all points", () => {
      // altitudes [100, 300, 200] → min=100, max=300
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: 100, timestamp: 0 },
        { latitude: POINT_1KM_NORTH_LAT, longitude: BASE_LON, altitude: 300, timestamp: ONE_MINUTE_MS },
        { latitude: POINT_2KM_NORTH_LAT, longitude: BASE_LON, altitude: 200, timestamp: 2 * ONE_MINUTE_MS },
      ];
      const result = calculateHikeMetrics(points);
      expect(result.minAltitudeM).toBe(100);
      expect(result.maxAltitudeM).toBe(300);
    });

    it("ignores null altitudes when computing min/max and elevation changes", () => {
      const points: TrackedPoint[] = [
        { latitude: BASE_LAT, longitude: BASE_LON, altitude: null, timestamp: 0 },
        { latitude: POINT_1KM_NORTH_LAT, longitude: BASE_LON, altitude: 200, timestamp: ONE_MINUTE_MS },
        { latitude: POINT_2KM_NORTH_LAT, longitude: BASE_LON, altitude: null, timestamp: 2 * ONE_MINUTE_MS },
      ];
      const result = calculateHikeMetrics(points);
      // null→200 segment: prev is null, skip elevation delta
      // 200→null segment: curr is null, skip elevation delta
      expect(result.elevationGainM).toBe(0);
      expect(result.elevationLossM).toBe(0);
      // min/max only from the one non-null altitude
      expect(result.minAltitudeM).toBe(200);
      expect(result.maxAltitudeM).toBe(200);
    });
  });

  describe("speed and pace", () => {
    // 2km apart, 30 minutes (1800s) apart → avgSpeedKmh = 2 / 0.5 = 4, avgPaceMinKm = 30 / 2 = 15
    const speedTestPoints: TrackedPoint[] = [
      { latitude: BASE_LAT, longitude: BASE_LON, altitude: null, timestamp: 0 },
      { latitude: POINT_2KM_NORTH_LAT, longitude: BASE_LON, altitude: null, timestamp: THIRTY_MINUTES_MS },
    ];

    it("calculates avg speed ~4 km/h for 2km in 30 minutes", () => {
      const result = calculateHikeMetrics(speedTestPoints);
      expect(Math.abs(result.avgSpeedKmh - 4)).toBeLessThan(0.5);
    });

    it("calculates avg pace ~15 min/km for 2km in 30 minutes", () => {
      const result = calculateHikeMetrics(speedTestPoints);
      expect(Math.abs(result.avgPaceMinKm - 15)).toBeLessThan(1);
    });
  });
});
