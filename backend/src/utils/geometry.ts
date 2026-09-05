type CoordinatePoint = {
  lat: number;
  lon: number;
};

function parseCoordinatePoint(value: unknown): CoordinatePoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    lat?: unknown;
    lon?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };

  const latValue = candidate.lat ?? candidate.latitude;
  const lonValue = candidate.lon ?? candidate.longitude;

  if (typeof latValue !== "number" || typeof lonValue !== "number") {
    return null;
  }

  return { lat: latValue, lon: lonValue };
}

function decimateGeometry(points: unknown, maxPoints: number): CoordinatePoint[] {
  if (!Array.isArray(points) || maxPoints <= 0) {
    return [];
  }

  const validPoints = points
    .map(parseCoordinatePoint)
    .filter((point): point is CoordinatePoint => point !== null);

  if (validPoints.length <= maxPoints) {
    return validPoints;
  }

  if (maxPoints === 1) {
    return [validPoints[validPoints.length - 1]!];
  }

  const sampled: CoordinatePoint[] = [];
  const lastIndex = validPoints.length - 1;
  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(validPoints[Math.floor((i * lastIndex) / (maxPoints - 1))]!);
  }
  sampled.push(validPoints[lastIndex]!);

  return sampled;
}

export { decimateGeometry, parseCoordinatePoint };
export type { CoordinatePoint };
