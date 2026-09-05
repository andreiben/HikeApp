export type ConditionType = "dry" | "muddy" | "snowy" | "overgrown" | "blocked";

export interface ConditionReport {
  id: string;
  condition: ConditionType;
  reportedAt: Date;
  isTrailVerified: boolean;
  isSuppressed: boolean;
}

export interface TrustedCondition {
  condition: ConditionType;
  riskPoints: number;
  confidence: "high" | "medium" | "low";
  label: string;
  daysOld: number;
  isTrailVerified: boolean;
}

export const CONDITION_SEVERITY: Record<ConditionType, number> = {
  blocked: 5,
  snowy: 4,
  muddy: 3,
  overgrown: 2,
  dry: 1,
};

type OpenMeteoArchiveResponse = {
  hourly?: {
    precipitation?: Array<number | null>;
    temperature_2m?: Array<number | null>;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getDaysOld(reportedAt: Date, now: Date): number {
  const diffMs = Math.max(0, now.getTime() - reportedAt.getTime());
  return Math.floor(diffMs / DAY_MS);
}

function formatDaysAgo(daysOld: number): string {
  return `${daysOld} day${daysOld === 1 ? "" : "s"} ago`;
}

function getOvergrownPoints(report: ConditionReport, now: Date): number {
  const daysOld = getDaysOld(report.reportedAt, now);
  if (daysOld > 75) {
    return 0;
  }

  const reportMonth = report.reportedAt.getUTCMonth();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();
  const isBeforeApril = reportMonth < 3;
  const isAfterMay15 = nowMonth > 4 || (nowMonth === 4 && nowDay > 15);
  const basePoints = daysOld <= 30 ? 6 : 5;

  return isBeforeApril && isAfterMay15 ? basePoints * 0.4 : basePoints;
}

function getBaseRiskPoints(
  report: ConditionReport,
  routeMaxElevationM: number | null | undefined,
  now: Date
): number {
  const daysOld = getDaysOld(report.reportedAt, now);

  switch (report.condition) {
    case "blocked":
      if (daysOld <= 2) return 28;
      if (daysOld <= 7) return 20;
      if (daysOld <= 21) return 12;
      return 0;
    case "snowy": {
      const isHighAltitude = (routeMaxElevationM ?? 0) >= 1500;
      if (daysOld <= 2) return 18;
      if (isHighAltitude) {
        if (daysOld <= 7) return 16;
        if (daysOld <= 14) return 12;
        if (daysOld <= 30) return 6;
        return 0;
      }

      if (daysOld <= 7) return 12;
      if (daysOld <= 14) return 6;
      return 0;
    }
    case "muddy":
      if (daysOld <= 2) return 10;
      if (daysOld <= 7) return 7;
      if (daysOld <= 14) return 3;
      return 0;
    case "overgrown":
      return getOvergrownPoints(report, now);
    case "dry":
      if (daysOld <= 2) return -5;
      if (daysOld <= 7) return -3;
      return 0;
  }
}

function getConfidence(
  condition: ConditionType,
  riskPoints: number,
  daysOld: number,
  isTrailVerified: boolean
): TrustedCondition["confidence"] {
  if (isTrailVerified && riskPoints > 0) {
    return "high";
  }

  if (condition === "blocked") {
    return daysOld <= 2 ? "high" : daysOld <= 7 ? "medium" : "low";
  }

  if (riskPoints >= 12) {
    return "high";
  }

  if (riskPoints >= 5 || (condition === "dry" && riskPoints < 0)) {
    return "medium";
  }

  return "low";
}

function buildLabel(
  condition: ConditionType,
  riskPoints: number,
  daysOld: number,
  confidence: TrustedCondition["confidence"]
): string {
  const ageText = formatDaysAgo(daysOld);

  if (condition === "blocked") {
    const lowConfidenceNote =
      confidence === "low" ? " Confidence is low due to report age." : "";
    return `Trail reported blocked — ${ageText}. Route may be impassable; verify before departing.${lowConfidenceNote}`;
  }

  if (condition === "snowy") {
    return `Trail reported snowy — ${ageText}. Expect icy or snow-covered sections.`;
  }

  if (condition === "muddy") {
    return `Trail reported muddy — ${ageText}. Wet trails increase slip risk and slow pace.`;
  }

  if (condition === "overgrown") {
    return `Trail reported overgrown — ${ageText}. Expect limited visibility and possible obstruction.`;
  }

  if (riskPoints < 0) {
    return `Trail conditions: dry (reported ${ageText}) — conditions are favorable.`;
  }

  return "Trail condition report expired.";
}

function isBlockedCleared(
  blockedReport: ConditionReport,
  reports: ConditionReport[],
  now: Date
): boolean {
  if (getBaseRiskPoints(blockedReport, null, now) <= 0) {
    return true;
  }

  const laterReports = reports.filter(
    report =>
      report.reportedAt.getTime() > blockedReport.reportedAt.getTime() &&
      report.condition !== "blocked"
  );

  const verifiedClear = laterReports.some(report => report.isTrailVerified);
  if (verifiedClear) {
    return true;
  }

  const threeDaysAfterBlocked = blockedReport.reportedAt.getTime() + 3 * DAY_MS;
  const quickClears = laterReports.filter(
    report => report.reportedAt.getTime() <= threeDaysAfterBlocked
  );

  return quickClears.length >= 2;
}

function buildTrustedCondition(
  report: ConditionReport,
  riskPoints: number,
  now: Date,
  _routeMaxElevationM: number | null | undefined
): TrustedCondition {
  const daysOld = getDaysOld(report.reportedAt, now);
  const confidence = getConfidence(
    report.condition,
    riskPoints,
    daysOld,
    report.isTrailVerified
  );

  return {
    condition: report.condition,
    riskPoints,
    confidence,
    label: buildLabel(report.condition, riskPoints, daysOld, confidence),
    daysOld,
    isTrailVerified: report.isTrailVerified,
  };
}

export async function isReportImplausible(
  report: ConditionReport,
  lat: number,
  lon: number,
  routeMaxElevationM: number | null | undefined
): Promise<boolean> {
  if (report.condition !== "dry" && report.condition !== "snowy") {
    return false;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    past_days: "1",
    hourly: "precipitation,temperature_2m",
  });

  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`);
  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as OpenMeteoArchiveResponse;
  const precipitation = data.hourly?.precipitation ?? [];
  const temperatures = data.hourly?.temperature_2m ?? [];

  const last24hRain = precipitation.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const currentTemp = temperatures.length > 0 ? temperatures[temperatures.length - 1] ?? null : null;

  if (report.condition === "dry" && last24hRain > 10) {
    return true;
  }

  if (
    report.condition === "snowy" &&
    (routeMaxElevationM ?? 0) < 500 &&
    currentTemp !== null &&
    currentTemp > 15
  ) {
    return true;
  }

  return false;
}

export function resolveTrustedCondition(
  reports: ConditionReport[],
  _lat: number,
  _lon: number,
  routeMaxElevationM: number | null | undefined,
  now: Date = new Date()
): TrustedCondition | null {
  const activeReports = reports
    .filter(report => !report.isSuppressed)
    .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());

  if (activeReports.length === 0) {
    return null;
  }

  const candidateReports = activeReports.filter(report => {
    if (report.condition !== "blocked") {
      return getBaseRiskPoints(report, routeMaxElevationM, now) !== 0;
    }

    return !isBlockedCleared(report, activeReports, now);
  });

  if (candidateReports.length === 0) {
    return null;
  }

  const scoredReports = candidateReports
    .map(report => {
      let riskPoints = getBaseRiskPoints(report, routeMaxElevationM, now);

      if (riskPoints > 0 && report.isTrailVerified) {
        riskPoints *= 1.3;
      }

      return {
        report,
        riskPoints,
      };
    })
    .filter(entry => entry.riskPoints !== 0);

  if (scoredReports.length === 0) {
    return null;
  }

  const negativeEntries = scoredReports.filter(entry => CONDITION_SEVERITY[entry.report.condition] > 1);
  const dryEntries = scoredReports.filter(entry => entry.report.condition === "dry" && entry.riskPoints < 0);

  const eligibleDryEntries = dryEntries.filter(dryEntry =>
    negativeEntries.every(
      negativeEntry =>
        dryEntry.report.reportedAt.getTime() - negativeEntry.report.reportedAt.getTime() >= 3 * DAY_MS
    )
  );

  const conflictPool = scoredReports.filter(entry => {
    if (entry.report.condition !== "dry") {
      return true;
    }

    return eligibleDryEntries.some(
      dryEntry => dryEntry.report.id === entry.report.id
    );
  });

  if (conflictPool.length === 0) {
    const newestDry = dryEntries[0];
    return newestDry ? buildTrustedCondition(newestDry.report, newestDry.riskPoints, now, routeMaxElevationM) : null;
  }

  conflictPool.sort((left, right) => {
    const severityDiff =
      CONDITION_SEVERITY[right.report.condition] - CONDITION_SEVERITY[left.report.condition];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    if (right.riskPoints !== left.riskPoints) {
      return right.riskPoints - left.riskPoints;
    }

    return right.report.reportedAt.getTime() - left.report.reportedAt.getTime();
  });

  const winner = conflictPool[0];
  if (!winner) {
    return null;
  }

  return buildTrustedCondition(winner.report, winner.riskPoints, now, routeMaxElevationM);
}
