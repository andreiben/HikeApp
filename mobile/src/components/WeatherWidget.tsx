import { useEffect, useState } from "react";
import { Text, View } from "react-native";

type Props = {
  latitude: number;
  longitude: number;
};

type WeatherResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weathercode: number;
    windspeed_10m: number;
    precipitation_probability: number;
    uv_index: number;
  };
};

const WMO: Record<number, string> = {
  0: "☀️ Cer senin",
  1: "🌤 Predominant senin",
  2: "⛅ Partial noros",
  3: "☁️ Acoperit",
  45: "🌫 Ceata",
  48: "🌫 Ceata cu chiciura",
  51: "🌦 Burnita usoara",
  53: "🌦 Burnita",
  55: "🌧 Burnita abundenta",
  61: "🌧 Ploaie usoara",
  63: "🌧 Ploaie",
  65: "🌧 Ploaie puternica",
  71: "❄️ Ninsoare usoara",
  73: "❄️ Ninsoare",
  75: "❄️ Ninsoare puternica",
  77: "❄️ Boabe de zapada",
  80: "🌦 Averse usoare",
  81: "🌦 Averse",
  82: "🌧 Averse puternice",
  85: "🌨 Averse de ninsoare",
  86: "🌨 Averse puternice de ninsoare",
  95: "⛈ Furtuna",
  96: "⛈ Furtuna cu grindina",
  99: "⛈ Furtuna puternica",
};

function getUvColor(uvIndex: number) {
  if (uvIndex < 3) return "#2e7d32";
  if (uvIndex <= 5) return "#f9a825";
  if (uvIndex <= 7) return "#e65100";
  if (uvIndex <= 10) return "#c62828";
  return "#6a1b9a";
}

export default function WeatherWidget({ latitude, longitude }: Props) {
  const [weather, setWeather] = useState<WeatherResponse["current"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchWeather = async () => {
      try {
        setLoading(true);
        setHasError(false);

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,precipitation_probability,uv_index&timezone=auto`
        );

        if (!response.ok) {
          throw new Error("Weather request failed");
        }

        const data = (await response.json()) as WeatherResponse;
        if (mounted) {
          setWeather(data.current);
        }
      } catch (error) {
        console.log("WEATHER WIDGET ERROR:", error);
        if (mounted) {
          setHasError(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchWeather();

    return () => {
      mounted = false;
    };
  }, [latitude, longitude]);

  if (hasError) {
    return null;
  }

  if (loading || !weather) {
    return (
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 4,
          gap: 12,
        }}
      >
        <View
          style={{
            height: 24,
            width: "65%",
            borderRadius: 8,
            backgroundColor: "#e0e0e0",
          }}
        />
        <View
          style={{
            height: 18,
            width: "90%",
            borderRadius: 8,
            backgroundColor: "#ededed",
          }}
        />
      </View>
    );
  }

  const conditionText = WMO[weather.weathercode] ?? "🌤 Vreme indisponibila";

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#1a1a1a" }}>
          {conditionText}
        </Text>
        <Text style={{ fontSize: 28, fontWeight: "700", color: "#1a1a1a" }}>
          {Math.round(weather.temperature_2m)}°C
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: 12,
          rowGap: 8,
        }}
      >
        <Text style={{ color: "#5f6368" }}>
          Simtit ca {Math.round(weather.apparent_temperature)}°C
        </Text>
        <Text style={{ color: "#5f6368" }}>
          Vant: {Math.round(weather.windspeed_10m)} km/h
        </Text>
        <Text style={{ color: "#5f6368" }}>
          Ploaie: {Math.round(weather.precipitation_probability)}%
        </Text>
        <Text style={{ color: getUvColor(weather.uv_index), fontWeight: "700" }}>
          UV: {Math.round(weather.uv_index)}
        </Text>
      </View>
    </View>
  );
}
