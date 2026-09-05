import { View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";

type Props = {
  points: Array<{ altitude: number | null; distanceFromStartM?: number }>;
  width?: number;
  height?: number;
};

const DEFAULT_WIDTH = 340;
const DEFAULT_HEIGHT = 100;

export default function ElevationProfile({
  points,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Props) {
  const validPoints = points.filter(
    (point): point is { altitude: number; distanceFromStartM?: number } =>
      point.altitude != null
  );

  if (validPoints.length < 2) {
    return null;
  }

  const minAlt = Math.min(...validPoints.map((point) => point.altitude));
  const maxAlt = Math.max(...validPoints.map((point) => point.altitude));
  const altitudeRange = maxAlt - minAlt || 1;
  const chartTop = 10;
  const chartBottom = height - 10;
  const chartHeight = chartBottom - chartTop;

  const hasDistanceForAll = validPoints.every(
    (point) => typeof point.distanceFromStartM === "number"
  );
  const minDistance = hasDistanceForAll
    ? Math.min(...validPoints.map((point) => point.distanceFromStartM as number))
    : 0;
  const maxDistance = hasDistanceForAll
    ? Math.max(...validPoints.map((point) => point.distanceFromStartM as number))
    : 0;
  const distanceRange = maxDistance - minDistance || 1;

  const normalizedPoints = validPoints.map((point, index) => {
    const x = hasDistanceForAll
      ? (((point.distanceFromStartM as number) - minDistance) / distanceRange) * width
      : (index / (validPoints.length - 1)) * width;
    const y =
      height - ((point.altitude - minAlt) / altitudeRange) * chartHeight - chartTop;

    return { x, y };
  });

  const pathD = normalizedPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    )
    .join(" ");
  const fillPath = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1="0"
          y1={height}
          x2={String(width)}
          y2={height}
          stroke="#e3f2fd"
          strokeWidth={1}
        />
        <Path d={fillPath} fill="#bbdefb" />
        <Path d={pathD} fill="none" stroke="#1976d2" strokeWidth={2} />
        <SvgText x={4} y={height - 4} fontSize="10" fill="#546e7a">
          {Math.round(minAlt)} m
        </SvgText>
        <SvgText
          x={width - 4}
          y={12}
          fontSize="10"
          fill="#546e7a"
          textAnchor="end"
        >
          {Math.round(maxAlt)} m
        </SvgText>
      </Svg>
    </View>
  );
}
