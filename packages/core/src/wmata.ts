import axios from "axios";
import { WmataAlert, WmataStationInfo, TransitAlert } from "./types";

const WMATA_ALERTS_API_URL = "https://api.wmata.com/Incidents.svc/json/Incidents";

const DC_STATIONS: Record<string, WmataStationInfo> = {
  DCA: {
    agency: "WMATA",
    airportCode: "DCA",
    name: "Ronald Reagan Washington National Airport",
    line: "Blue / Yellow Line",
    lineColor: "#00b2e8", // Yellow and Blue
    primaryLines: ["BL", "YL"],
    stationLocation: "Connected to the concourse level of Terminals 2 and 3",
    fareDescription: "Variable based on distance (via SmarTrip card or mobile pay)",
  },
  IAD: {
    agency: "WMATA",
    airportCode: "IAD",
    name: "Washington Dulles International Airport",
    line: "Silver Line",
    lineColor: "#a0a5a9", // Silver
    primaryLines: ["SV"],
    stationLocation: "Connected to the main terminal by an indoor pedestrian tunnel",
    fareDescription: "Variable based on distance (via SmarTrip card or mobile pay)",
  },
};

/**
 * Check if the given airport code is a Washington DC airport served by WMATA
 */
export const isDcAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(DC_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, fare details, and primary lines for a DC airport
 */
export const getWmataStationInfo = (airportCode?: string): WmataStationInfo | null => {
  if (!airportCode) return null;
  return DC_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Fetch real-time WMATA Incidents for DC airport transit lines.
 */
export const getWmataAlerts = async (
  airportCode?: string
): Promise<WmataAlert[]> => {
  const airport = airportCode?.toUpperCase();
  const station = airport ? DC_STATIONS[airport] : undefined;
  const targetRoutes = new Set(station ? station.primaryLines : ["SV", "BL", "YL"]);

  try {
    const response = await axios.get(WMATA_ALERTS_API_URL, {
      headers: {
        api_key: process.env.WMATA_API_KEY || "",
      },
      timeout: 4000,
    });

    const incidents = response.data?.Incidents;
    if (!Array.isArray(incidents)) {
      return [];
    }

    const matchedAlerts: WmataAlert[] = [];

    for (const incident of incidents) {
      if (!incident.LinesAffected) continue;

      // LinesAffected is usually a semicolon-separated string, e.g., "RD;" or "BL; OR; SV;"
      const affectedLines = incident.LinesAffected.split(";")
        .map((l: string) => l.trim())
        .filter(Boolean);

      const isMatch = affectedLines.some(
        (line: string) =>
          targetRoutes.has(line) ||
          Array.from(targetRoutes).some((r) => line.includes(r))
      );

      if (!isMatch) continue;

      matchedAlerts.push({
        id: incident.IncidentID || String(Math.random()),
        headline: incident.IncidentType || "Alert",
        shortDescription: (incident.Description || "").trim(),
        linesAffected: affectedLines,
        incidentType: incident.IncidentType,
        isMajor:
          incident.DelaySeverity === "Major" ||
          incident.IncidentType === "Delay",
      });

      // Keep response lightweight - limit to top 5 most relevant alerts
      if (matchedAlerts.length >= 5) break;
    }

    return matchedAlerts;
  } catch (error) {
    console.error(
      "Failed to fetch WMATA alerts:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
};

/**
 * Format a human-readable summary of DC WMATA service status
 */
export const formatWmataAlertsSummary = (
  alerts: WmataAlert[],
  lineName: string = "WMATA Metro"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Normal service`;
  }

  const major = alerts.find((a) => a.isMajor);
  if (major) {
    return `⚠️ ${lineName}: ${major.headline} - ${major.shortDescription}`;
  }

  const first = alerts[0];
  return `ℹ️ ${lineName}: ${first.headline} - ${first.shortDescription}`;
};

/**
 * Normalise native WMATA alerts to the shared TransitAlert shape.
 */
export const wmataToTransitAlerts = (
  alerts: WmataAlert[],
  agency = "WMATA"
): TransitAlert[] =>
  alerts.map((a) => ({
    id: a.id,
    headline: `${a.headline}: ${a.shortDescription}`,
    shortDescription: a.shortDescription,
    isMajor: a.isMajor,
    agency,
    routeId: a.linesAffected.join(", "),
  }));
