const weatherApiBaseUrl = "https://api.weatherapi.com/v1";
const cacheTtlMs = 30 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

type WeatherApiHour = {
  time?: string;
  temp_c?: number;
  humidity?: number;
  chance_of_rain?: number;
  wind_kph?: number;
  uv?: number;
  condition?: {
    code?: number;
  };
};

type WeatherApiForecastDay = {
  astro?: {
    sunrise?: string;
    sunset?: string;
  };
  day?: {
    totalprecip_mm?: number;
  };
  hour?: WeatherApiHour[];
};

type WeatherApiForecastResponse = {
  forecast?: {
    forecastday?: WeatherApiForecastDay[];
  };
};

function getWeatherApiKey(): string | null {
  const key = process.env.WEATHER_API_KEY?.trim();
  return key ? key : null;
}

function roundCoordinate(value: number): string {
  return value.toFixed(4);
}

function buildCacheKey(
  endpoint: string,
  latitude: number,
  longitude: number,
  dateKey: string
): string {
  return `${endpoint}:${roundCoordinate(latitude)}:${roundCoordinate(longitude)}:${dateKey}`;
}

async function fetchWeatherApi<T>(
  endpoint: string,
  params: Record<string, string>,
  cacheKey: string
): Promise<T | null> {
  const apiKey = getWeatherApiKey();

  if (!apiKey) {
    return null;
  }

  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
    return cached.data as T;
  }

  const query = new URLSearchParams({
    key: apiKey,
    ...params,
  });

  try {
    const response = await fetch(`${weatherApiBaseUrl}${endpoint}?${query.toString()}`);

    if (!response.ok) {
      console.error(`WeatherAPI request failed for ${endpoint} with ${response.status}`);
      return null;
    }

    const data = (await response.json()) as T;
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function convertTo24h(t: string): string | null {
  const match = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  const [, hourText, minute, meridiemText] = match;

  if (!hourText || !minute || !meridiemText) {
    return null;
  }

  const hour = Number(hourText);
  const meridiem = meridiemText.toUpperCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
    return null;
  }

  const hour24 =
    meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;

  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

function weatherApiCodeToWmo(code: number): number {
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) {
    return 95;
  }

  if (
    [
      1066, 1069, 1072, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237,
      1255, 1258, 1261, 1264,
    ].includes(code)
  ) {
    return 73;
  }

  if (
    [
      1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195,
      1198, 1201, 1240, 1243, 1246,
    ].includes(code)
  ) {
    return 80;
  }

  return 1;
}

function normalizeWeatherApiTime(time: string): string {
  return time.replace(" ", "T");
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(dateString: string, days: number): string | null {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchForecastForDate(
  latitude: number,
  longitude: number,
  startDate: string
): Promise<WeatherApiForecastResponse | null> {
  return fetchWeatherApi<WeatherApiForecastResponse>(
    "/forecast.json",
    {
      q: `${latitude},${longitude}`,
      dt: startDate,
      aqi: "no",
      alerts: "no",
    },
    buildCacheKey("/forecast.json", latitude, longitude, startDate)
  );
}

export async function fetchDaylight(
  latitude: number,
  longitude: number,
  startDate: string
): Promise<{ sunrise: string | null; sunset: string | null }> {
  const data = await fetchForecastForDate(latitude, longitude, startDate);
  const astro = data?.forecast?.forecastday?.[0]?.astro;

  return {
    sunrise: astro?.sunrise ? convertTo24h(astro.sunrise) : null,
    sunset: astro?.sunset ? convertTo24h(astro.sunset) : null,
  };
}

export async function fetchHourlyWeather(
  latitude: number,
  longitude: number,
  startDate: string,
  startTime: string
): Promise<{
  precipitationProbability: number | null;
  windspeedKmh: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  uvIndex: number | null;
  weatherCode: number | null;
}> {
  const data = await fetchForecastForDate(latitude, longitude, startDate);
  const hours = data?.forecast?.forecastday?.[0]?.hour ?? [];
  const targetHour = startTime.slice(0, 2);
  const hour = hours.find((entry) => entry.time?.slice(11, 13) === targetHour);
  const weatherApiCode = hour?.condition?.code;

  return {
    precipitationProbability: numberOrNull(hour?.chance_of_rain),
    windspeedKmh: numberOrNull(hour?.wind_kph),
    temperatureC: numberOrNull(hour?.temp_c),
    humidityPercent: numberOrNull(hour?.humidity),
    uvIndex: numberOrNull(hour?.uv),
    weatherCode:
      typeof weatherApiCode === "number" ? weatherApiCodeToWmo(weatherApiCode) : null,
  };
}

export async function fetchForecastWindows(
  latitude: number,
  longitude: number
): Promise<{
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  windspeed_10m: number[];
  weathercode: number[];
}> {
  const data = await fetchWeatherApi<WeatherApiForecastResponse>(
    "/forecast.json",
    {
      q: `${latitude},${longitude}`,
      days: "3",
      aqi: "no",
      alerts: "no",
    },
    buildCacheKey("/forecast.json", latitude, longitude, "days=3")
  );
  const forecastDays = data?.forecast?.forecastday ?? [];
  const hours = forecastDays.flatMap((day) => day.hour ?? []);

  return {
    time: hours.map((hour) => (hour.time ? normalizeWeatherApiTime(hour.time) : "")),
    temperature_2m: hours.map((hour) => hour.temp_c ?? 0),
    precipitation_probability: hours.map((hour) => hour.chance_of_rain ?? 0),
    windspeed_10m: hours.map((hour) => hour.wind_kph ?? 0),
    weathercode: hours.map((hour) =>
      typeof hour.condition?.code === "number" ? weatherApiCodeToWmo(hour.condition.code) : 1
    ),
  };
}

export async function fetchPrecipitationHistory(
  latitude: number,
  longitude: number,
  startDate: string
): Promise<number | null> {
  const historyStartDate = shiftDate(startDate, -7);
  const historyEndDate = shiftDate(startDate, -1);

  if (!historyStartDate || !historyEndDate) {
    return null;
  }

  const data = await fetchWeatherApi<WeatherApiForecastResponse>(
    "/history.json",
    {
      q: `${latitude},${longitude}`,
      dt: historyStartDate,
      end_dt: historyEndDate,
    },
    buildCacheKey(
      "/history.json",
      latitude,
      longitude,
      `${historyStartDate}:${historyEndDate}`
    )
  );
  const forecastDays = data?.forecast?.forecastday;

  if (!forecastDays || forecastDays.length === 0) {
    return null;
  }

  return forecastDays.reduce((sum, day) => sum + (day.day?.totalprecip_mm ?? 0), 0);
}
