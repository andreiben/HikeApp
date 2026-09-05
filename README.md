# HikeApp

A mobile hiking application centered around personalized and explainable risk assessment.

HikeApp helps a hiker decide whether a planned mountain route is a reasonable objective *for them, on that day*. Instead of a generic difficulty label, it produces a personalized 0-100 risk index built from route characteristics, live weather, daylight, community-reported trail conditions, and the user's own fitness and activity history. Every point in the score is traceable to a named, human-readable rule.

> The risk score is a decision-support index, not a validated prediction of accidents.

## Features

- **Route exploration** - browse hiking routes on an interactive map with distance, elevation gain, duration, difficulty and tags.
- **Hike planning** - pick a route, date, start time and pack weight, then get a full risk breakdown before departure.
- **Personalized risk assessment** - a rule-based engine scoring five domains (terrain, weather, personal readiness, trail conditions, timing), combined into a 0-100 index with explainable per-factor contributions.
- **Weather and daylight integration** - forecast, wind chill, heat index, UV, precipitation history and sunrise/sunset feed directly into the score, plus recommended departure windows.
- **Profile and history personalization** - fitness level, experience, recent training load, fatigue and pace history are derived from the user's own completed hikes and adjust the score.
- **Confidence / data quality** - every assessment reports how complete its inputs were, so a score computed with missing data is flagged as such.
- **Hike tracking** - GPS recording of an active hike with live distance, elevation, pace and off-route detection.
- **Trail condition reports** - users report trail state (dry, muddy, snowy, overgrown, blocked); reports are trust-weighted by age, altitude, verification and conflicts before affecting risk.
- **History and statistics** - completed hikes, per-hike detail, elevation profiles, notes, GPX export and long-term progress.
- **Favorites** - save routes for later.
- **Safety features** - emergency contact, solo-hiking risk factors, isolation-aware scoring and high-risk warnings.
- **Points of interest** - water sources, shelters and huts near a route.

The application interface is in Romanian.

## Architecture

```
backend/    Bun + Hono REST API, Drizzle ORM, PostgreSQL
mobile/     React Native (Expo) client
```

**Backend**
- Runtime: [Bun](https://bun.sh)
- HTTP: [Hono](https://hono.dev)
- Database: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (developed against NeonDB)
- Auth: JWT access tokens (7-day TTL), bcrypt password hashing
- Validation: Zod
- External data: WeatherAPI.com (forecast, daylight, precipitation history), OpenStreetMap (route import), OpenTopoData / Open-Meteo (elevation backfill)

**Mobile**
- [Expo](https://expo.dev) SDK 54, React Native 0.81, React 19
- Navigation: React Navigation (native stack + bottom tabs)
- Maps: `react-native-maps`
- Data: TanStack Query + Axios
- Secure token storage: `expo-secure-store`
- Location and background tracking: `expo-location`, `expo-task-manager`

**Risk engine** - `backend/src/utils/riskEngine.ts` is a single self-contained module. Rules add points into five weighted domains, each domain is normalized with a saturating curve, and a bounded additive synergy bonus accounts for compounding conditions without letting the score explode.

## Prerequisites

- [Bun](https://bun.sh) 1.x (backend)
- Node.js 20+ (Expo CLI toolchain)
- A PostgreSQL database (NeonDB or local)
- A free [WeatherAPI.com](https://www.weatherapi.com/) API key
- Expo Go on a physical device, or an Android/iOS emulator

## Setup

### 1. Backend

```bash
cd backend
bun install
cp .env.example .env      # then fill in the values
```

Required variables (see `backend/.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | Secret used to sign JWT access tokens |
| `WEATHER_API_KEY` | yes | WeatherAPI.com key for forecast and daylight |
| `PORT` | no | HTTP port, defaults to `3000` |
| `NTFY_TOPIC` | no | ntfy.sh topic for push notifications, disabled when empty |
| `DEMO_USER_PASSWORD` | no | Password for demo accounts; required only by `seed:personas` |

Apply the database schema and start the server:

```bash
bun run db:push       # apply Drizzle migrations
bun run dev           # start on http://localhost:3000
```

Optionally populate data:

```bash
bun run seed:osm      # import hiking routes from OpenStreetMap
bun run seed:tags     # derive route tags and best season
bun run seed:personas # create demo accounts (requires DEMO_USER_PASSWORD)
```

### 2. Mobile

```bash
cd mobile
bun install
cp .env.example .env      # then set EXPO_PUBLIC_API_URL
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | yes | Base URL of the backend |

When testing on a physical device, point `EXPO_PUBLIC_API_URL` at your machine's LAN address (for example `http://192.168.1.10:3000`), not `localhost`, and make sure port 3000 is reachable through your firewall.

```bash
npm start          # Expo dev server
npm run android    # open on Android
npm run ios        # open on iOS
```

Both components use Bun as the package manager, so `bun.lock` is the authoritative lockfile.

## Testing

```bash
cd backend && bun test      # backend unit tests + API integration tests
cd mobile  && npm test      # mobile unit tests (Jest)
```

The backend suite contains API integration tests that exercise the real HTTP
handlers against PostgreSQL. They are skipped automatically when `DATABASE_URL`
is not set, and run normally once it is configured.

Type checking:

```bash
cd backend && bunx tsc --noEmit
cd mobile  && bunx tsc --noEmit
```

## Risk engine evaluation

The engine ships with an offline evaluation harness that sweeps every numeric input, checks monotonicity and threshold smoothness, and computes score distributions across the whole route catalogue:

```bash
cd backend
bun run evaluate:risk       # writes risk-engine-evaluation.{md,json}
bun run expert-scenarios    # runs the expert-labelled scenario battery
```

Both commands require a populated `DATABASE_URL`. Their output files are generated artifacts and are not tracked in this repository.

## Deployment

The backend includes a `Dockerfile` and `railway.toml` for deployment on [Railway](https://railway.app). The mobile app is built with EAS (`mobile/eas.json`).

## License

Developed as a bachelor's degree project.