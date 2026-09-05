import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';

interface HUDStat {
  label: string;
  value: string;
  unit?: string;
}

interface FloatingHUDProps {
  stats: HUDStat[];
  isRecording?: boolean;
  isPaused?: boolean;
  weather?: { tempC: number; weatherCode: number } | null;
}

function getWeatherIconName(weatherCode: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (weatherCode === 0) return 'sunny';
  if (weatherCode >= 1 && weatherCode <= 3) return 'partly-sunny';
  if (weatherCode >= 45 && weatherCode <= 48) return 'cloud';
  if (weatherCode >= 51 && weatherCode <= 67) return 'rainy';
  if (weatherCode >= 71 && weatherCode <= 77) return 'snow';
  if (weatherCode >= 80 && weatherCode <= 82) return 'rainy';
  if (weatherCode >= 95 && weatherCode <= 99) return 'thunderstorm';
  return 'cloud';
}

export function FloatingHUD({ stats, isRecording = false, isPaused = false, weather = null }: FloatingHUDProps) {
  const totalStatCount = stats.length + (weather ? 1 : 0);
  const recordingStatus = isRecording && !isPaused ? 'Inregistrare' : isPaused ? 'Pauza' : 'Inactiv';

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View
          accessible={true}
          accessibilityLabel={recordingStatus}
          style={[styles.statusDot, isRecording && !isPaused ? styles.dotRecording : isPaused ? styles.dotPaused : styles.dotIdle]}
        />
        <Text style={styles.statusText}>
          {recordingStatus}
        </Text>
      </View>
      <View style={styles.statsRow}>
        {stats.map((stat, i) => (
          <View
            key={i}
            accessible={true}
            accessibilityLabel={`${stat.label}: ${stat.value}${stat.unit ? ` ${stat.unit}` : ''}`}
            style={[styles.statItem, i < totalStatCount - 1 && styles.statDivider]}
          >
            <Text style={styles.statValue}>{stat.value}</Text>
            {stat.unit && <Text style={styles.statUnit}>{stat.unit}</Text>}
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
        {weather ? (
          <View style={[styles.statItem, styles.weatherItem]}>
            <View style={styles.weatherValueRow}>
              <Ionicons
                name={getWeatherIconName(weather.weatherCode)}
                size={18}
                color={Colors.textOnDark}
              />
              <Text style={styles.statValue}>{`${Math.round(weather.tempC)}\u00B0C`}</Text>
            </View>
            <Text style={styles.statLabel}>Vreme</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(27,67,50,0.85)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotRecording: { backgroundColor: '#FF3B30' },
  dotPaused: { backgroundColor: '#FF9F0A' },
  dotIdle: { backgroundColor: Colors.textTertiary },
  statusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  statValue: {
    color: Colors.textOnDark,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    letterSpacing: -0.5,
  },
  statUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: Typography.size.xs,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: Typography.size.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weatherItem: {
    justifyContent: 'center',
  },
  weatherValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
