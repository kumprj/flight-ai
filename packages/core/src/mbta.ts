import axios from "axios";
import { MbtaAlert, MbtaStationInfo, TransitAlert } from "./types";

const MBTA_ALERTS_API_URL = "https://api-v3.mbta.com/alerts";

const BOSTON_STATIONS: Record<string, MbtaStationInfo> = {
  BOS: {
    agency: "MBTA",
    airportCode: "BOS",
    name: "Boston Logan International Airport",
    line: "Silver Line (SL1) / Blue Line",
    lineColor: "#7C878E", // Silver (and Blue #003DA5)
    primaryLines: ["SL1", "SL3", "Blue"],
    stationLocation: "Silver Line SL1 stops at all terminals; Blue Line via shuttle bus",
    fareDescription: "Free from Logan Airport; standard MBTA fare to Logan (via CharlieCard or contactless pay)",
  },
};

/**
 * Check if the given airport code is a Boston airport served by the MBTA
 */
export const isBostonAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(BOSTON_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, fare details, and primary lines for a Boston airport
 */
export const getMbtaStationInfo = (airportCode?: string): MbtaStationInfo | null => {
  if (!airportCode) return null;
  return BOSTON_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Fetch real-time MBTA Alerts for Boston airport transit lines.
 */
export const getMbtaAlerts = async (
  airportCode?: string
): Promise<MbtaAlert[]> => {
  const airport = airportCode?.toUpperCase();
  const station = airport ? BOSTON_STATIONS[airport] : undefined;
  // Default to SL1 and Blue line if no specific station matched
  const targetRoutes = station ? station.primaryLines : ["SL1", "SL3", "Blue"];

  try {
    const response = await axios.get(MBTA_ALERTS_API_URL, {
      params: {
        "filter[route]": targetRoutes.join(","),
      },
      timeout: 4000,
    });

    const alerts = response.data?.data;
    if (!Array.isArray(alerts)) {
      return [];
    }

    const matchedAlerts: MbtaAlert[] = [];

    for (const alert of alerts) {
      const attributes = alert.attributes;
      if (!attributes) continue;

      const informedEntities = attributes.informed_entity || [];
      const affectedLines = informedEntities
        .map((ie: any) => ie.route)
        .filter(Boolean);

      const isMatch = affectedLines.some(
        (line: string) => targetRoutes.includes(line)
      );

      // MBTA might not have a route explicitly in informed_entity for system-wide alerts,
      // but the filter[route] usually guarantees relevance.
      // Still, checking isMatch if affectedLines is not empty.
      if (affectedLines.length > 0 && !isMatch) continue;

      matchedAlerts.push({
        id: alert.id,
        headline: attributes.header || "Alert",
        shortDescription: (attributes.description || attributes.short_header || "").trim(),
        severity: attributes.severity || 0,
        lifecycle: attributes.lifecycle,
        isMajor: attributes.severity >= 5 || attributes.effect === "DELAY" || attributes.effect === "DETOUR" || attributes.effect === "SUSPENSION",
        effect: attributes.effect,
      });

      // Limit to top 5 alerts
      if (matchedAlerts.length >= 5) break;
    }

    return matchedAlerts;
  } catch (error) {
    console.error(
      "Failed to fetch MBTA alerts:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
};

/**
 * Format a human-readable summary of Boston MBTA service status
 */
export const formatMbtaAlertsSummary = (
  alerts: MbtaAlert[],
  lineName: string = "MBTA Transit"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Normal service`;
  }

  const major = alerts.find((a) => a.isMajor);
  if (major) {
    return `⚠️ ${lineName}: ${major.headline}`;
  }

  const first = alerts[0];
  return `ℹ️ ${lineName}: ${first.headline}`;
};

/**
 * Normalise native MBTA alerts to the shared TransitAlert shape.
 */
export const mbtaToTransitAlerts = (
  alerts: MbtaAlert[],
  agency = "MBTA"
): TransitAlert[] =>
  alerts.map((a) => ({
    id: a.id,
    headline: a.headline,
    shortDescription: a.shortDescription,
    isMajor: a.isMajor,
    agency,
    routeId: "MBTA",
  }));
