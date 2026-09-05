export function calculateCalories(
  durationS: number | null,
  distanceM: number | null,
  backpackKg: number | null
): number | null {
  if (!durationS || durationS <= 0 || !distanceM || distanceM <= 0) return null;
  const durationH = durationS / 3600;
  const distanceKm = distanceM / 1000;
  const speedKmh = distanceKm / durationH;
  // MET value based on hiking speed
  const met = speedKmh < 4 ? 3.5 : speedKmh < 5 ? 5 : speedKmh < 6 ? 6 : 7;
  const bodyWeightKg = 70;
  const totalWeightKg = bodyWeightKg + (backpackKg ?? 0);
  return Math.round(met * totalWeightKg * durationH);
}

export function formatCalories(cal: number | null): string {
  if (cal === null) return '—';
  return cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : String(cal);
}
