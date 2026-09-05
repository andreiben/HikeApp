// Romania border (simplified polygon) and mountain-region helpers.
// Used to filter imported OSM routes to Romanian territory and to assign
// each route to the nearest mountain massif.

// Polygon vertices as [lat, lon], tracing the Romanian border.
const ROMANIA_POLYGON: Array<[number, number]> = [
  [48.12, 22.88], [47.95, 23.6], [47.95, 24.2], [47.75, 24.9],
  [47.95, 25.2], [48.0, 25.45], [47.95, 26.1], [48.22, 26.6],
  [48.27, 27.0], [47.95, 27.3], [47.1, 27.55], [46.4, 28.05],
  [45.95, 28.2], [45.6, 28.55], [45.45, 28.72], [45.2, 29.69],
  [44.84, 29.65], [44.75, 28.95], [44.1, 28.65], [43.74, 28.58],
  [43.95, 27.9], [43.8, 26.5], [43.62, 25.65], [43.68, 24.4],
  [43.8, 22.95], [44.5, 22.55], [44.7, 21.55], [45.2, 21.45],
  [45.5, 20.8], [46.13, 20.26], [46.4, 20.72], [46.7, 21.05],
  [47.0, 21.3], [47.4, 21.65], [47.7, 22.0], [47.9, 22.4],
];

export function isInRomania(lat: number, lon: number): boolean {
  let inside = false;
  for (
    let i = 0, j = ROMANIA_POLYGON.length - 1;
    i < ROMANIA_POLYGON.length;
    j = i++
  ) {
    const [latI, lonI] = ROMANIA_POLYGON[i]!;
    const [latJ, lonJ] = ROMANIA_POLYGON[j]!;
    const intersect =
      latI > lat !== latJ > lat &&
      lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI;
    if (intersect) inside = !inside;
  }
  return inside;
}

const MASSIFS: Array<{ name: string; lat: number; lon: number }> = [
  { name: "Maramures/Rodna", lat: 47.55, lon: 24.7 },
  { name: "Calimani/Rarau", lat: 47.15, lon: 25.3 },
  { name: "Apuseni", lat: 46.5, lon: 22.85 },
  { name: "Ceahlau/Hasmas", lat: 46.85, lon: 25.9 },
  { name: "Fagaras", lat: 45.6, lon: 24.65 },
  { name: "Bucegi/Leaota", lat: 45.42, lon: 25.45 },
  { name: "Piatra Craiului", lat: 45.55, lon: 25.22 },
  { name: "Retezat/Mehedinti", lat: 45.3, lon: 22.8 },
  { name: "Parang/Cindrel", lat: 45.42, lon: 23.7 },
  { name: "Cozia/Vanturarita", lat: 45.3, lon: 24.25 },
  { name: "Dobrogea/Macin", lat: 45.15, lon: 28.25 },
];

export function nearestRegion(lat: number, lon: number): string {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = MASSIFS[0]!;
  let bestDist = Infinity;
  for (const massif of MASSIFS) {
    const dLat = lat - massif.lat;
    const dLon = (lon - massif.lon) * cosLat;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      best = massif;
    }
  }
  return best.name;
}
