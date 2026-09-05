import { View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

type Props = {
  score: number;
  level: string;
};

const COLORS: Record<string, string> = {
  Low: "#2e7d32",
  Moderate: "#f57c00",
  High: "#c62828",
  "Very High": "#6a1b9a",
};

const LEVEL_LABELS: Record<string, string> = {
  Low: 'Scăzut',
  Moderate: 'Moderat',
  High: 'Ridicat',
  'Very High': 'Foarte ridicat',
};

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy - r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy - r * Math.sin(toRad(endAngle));
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function RiskGauge({ score, level }: Props) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = COLORS[level] ?? "#1976d2";
  const backgroundArc = describeArc(80, 90, 60, 180, 0);
  const foregroundArc = describeArc(80, 90, 60, 180, 180 - clampedScore * 1.8);

  return (
    <View
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`${level} risk, score ${Math.round(clampedScore)} out of 100`}
    >
      <Svg width={160} height={90}>
        <Path
          d={backgroundArc}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <Path
          d={foregroundArc}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
        />
        <SvgText
          x="80"
          y="58"
          fontSize="28"
          fontWeight="700"
          fill="#212121"
          textAnchor="middle"
        >
          {Math.round(clampedScore)}
        </SvgText>
        <SvgText
          x="80"
          y="78"
          fontSize="12"
          fontWeight="600"
          fill={color}
          textAnchor="middle"
        >
          {LEVEL_LABELS[level] ?? level}
        </SvgText>
      </Svg>
    </View>
  );
}
