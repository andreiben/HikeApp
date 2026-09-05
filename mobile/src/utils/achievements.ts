// Types
export type AchievementId = 'first_summit' | 'trailblazer_10k' | 'altitude_hunter' | 'explorer' | 'storm_chaser';

export interface Achievement {
  id: AchievementId;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
}

export interface HikeSummary {
  elevationGainM: number | null;
  distanceM: number | null;
  routeId: string | null;
  weatherCode?: number | null;
}

// Compute which achievements are earned
export function computeAchievements(hikes: HikeSummary[]): Achievement[] {
  const totalDistanceKm = hikes.reduce((sum, h) => sum + ((h.distanceM ?? 0) / 1000), 0);
  const uniqueRoutes = new Set(hikes.map(h => h.routeId).filter(Boolean));
  const hasAltitudeHunt = hikes.some(h => (h.elevationGainM ?? 0) >= 500);
  // Storm chaser: completed a hike with thunderstorm weather code (95-99)
  const stormCodes = [95, 96, 99];
  const hasStormHike = hikes.some(h => stormCodes.includes(h.weatherCode ?? -1));

  return [
    {
      id: 'first_summit',
      label: 'First Summit',
      description: 'Complete your first hike',
      icon: '🏔️',
      earned: hikes.length >= 1,
    },
    {
      id: 'trailblazer_10k',
      label: '10K Trailblazer',
      description: '10 km total distance',
      icon: '🛤️',
      earned: totalDistanceKm >= 10,
    },
    {
      id: 'altitude_hunter',
      label: 'Altitude Hunter',
      description: '500m elevation in a single hike',
      icon: '⛰️',
      earned: hasAltitudeHunt,
    },
    {
      id: 'explorer',
      label: 'Explorer',
      description: 'Complete 5 different routes',
      icon: '🗺️',
      earned: uniqueRoutes.size >= 5,
    },
    {
      id: 'storm_chaser',
      label: 'Storm Chaser',
      description: 'Hike during a thunderstorm',
      icon: '⚡',
      earned: hasStormHike,
    },
  ];
}
