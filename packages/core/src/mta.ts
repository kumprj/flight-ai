import axios from "axios";
import { MtaAlert, NycTransitStationInfo, TransitAlert } from "./types";

const MTA_ALL_ALERTS_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json";

const NYC_STATIONS: Record<string, NycTransitStationInfo> = {
  JFK: {
    agency: "MTA",
    airportCode: "JFK",
    name: "John F. Kennedy International Airport",
    line: "A / E Subway + AirTrain JFK",
    lineColor: "#0039A6", // MTA Blue
    primaryLines: ["A", "E", "J", "Z"],
    stationLocation: "AirTrain JFK connects Howard Beach (A train) and Jamaica Station (E, J, Z, LIRR) to all terminals",
    fareDescription: "$2.90 Subway + $8.50 AirTrain (via OMNY contactless or MetroCard)",
  },
  LGA: {
    agency: "MTA",
    airportCode: "LGA",
    name: "LaGuardia Airport",
    line: "7 / E / F / M / R Subway + LaGuardia Link Q70-SBS",
    lineColor: "#B933AD", // MTA Purple / SBS
    primaryLines: ["7", "E", "F", "M", "R", "Q70", "M60"],
    stationLocation: "LaGuardia Link Q70-SBS connects 74th St/Roosevelt Ave & Woodside to Terminals B & C",
    fareDescription: "$2.90 Subway + FREE LaGuardia Link Q70-SBS (or M60-SBS from Manhattan)",
  },
  EWR: {
    agency: "MTA",
    airportCode: "EWR",
    name: "Newark Liberty International Airport",
    line: "NJ Transit / Amtrak + AirTrain Newark",
    lineColor: "#ff5500",
    primaryLines: ["NJ Transit", "Amtrak", "PATH"],
    stationLocation: "AirTrain Newark connects Newark Airport Railroad Station to all terminals",
    fareDescription: "~$16.00 NJ Transit + AirTrain unified ticket from NY Penn Station",
  },
};

/**
 * Check if the given airport code is a New York area airport served by MTA / Port Authority
 */
export const isNycAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(NYC_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, OMNY fare details, and primary lines for a NYC airport
 */
export const getNycStationInfo = (airportCode?: string): NycTransitStationInfo | null => {
  if (!airportCode) return null;
  return NYC_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Fetch real-time MTA Service Alerts for NYC airport subway and transit lines.
 * The MTA GTFS-RT all-alerts JSON feed is publicly accessible without an API key.
 */
export const getMtaAlerts = async (
  airportCode?: string
): Promise<MtaAlert[]> => {
  const airport = airportCode?.toUpperCase();
  const station = airport ? NYC_STATIONS[airport] : undefined;
  const targetRoutes = new Set(station ? station.primaryLines : ["A", "E", "J", "Z", "7", "F", "M", "R"]);

  try {
    const response = await axios.get(MTA_ALL_ALERTS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 MakeMyFlight/1.0",
      },
      timeout: 4000,
    });

    const entities = response.data?.entity;
    if (!Array.isArray(entities)) {
      return [];
    }

    const matchedAlerts: MtaAlert[] = [];
    const seenIds = new Set<string>();

    for (const item of entities) {
      const alert = item.alert;
      if (!alert) continue;

      // Check if alert affects one of the airport routes
      const matchedRoute = alert.informed_entity?.find((ie: any) => {
        if (!ie.route_id) return false;
        // Check direct match or partial match (e.g. Q70 in MTA NYCT_Q70)
        return targetRoutes.has(ie.route_id) || Array.from(targetRoutes).some((r) => ie.route_id.includes(r));
      });

      if (!matchedRoute) continue;

      const alertId = item.id || alert["transit_realtime.mercury_alert"]?.id || String(Math.random());
      if (seenIds.has(alertId)) continue;
      seenIds.add(alertId);

      const headerEn = alert.header_text?.translation?.find((t: any) => t.language === "en")?.text || "";
      const descEn = alert.description_text?.translation?.find((t: any) => t.language === "en")?.text || "";
      const alertType = alert["transit_realtime.mercury_alert"]?.alert_type || "Notice";

      matchedAlerts.push({
        id: alertId,
        headline: headerEn.replace(/\n+/g, " ").trim(),
        shortDescription: descEn.replace(/\n+/g, " ").trim() || headerEn.trim(),
        routeId: matchedRoute.route_id,
        agency: matchedRoute.agency_id || "MTA",
        isMajor: alertType === "Delays" || alertType === "Suspension" || headerEn.includes("delays"),
        url: alert.url?.translation?.find((t: any) => t.language === "en")?.text,
      });

      // Keep response lightweight - limit to top 5 most relevant alerts
      if (matchedAlerts.length >= 5) break;
    }

    return matchedAlerts;
  } catch (error) {
    console.error("Failed to fetch MTA alerts:", error instanceof Error ? error.message : error);
    return [];
  }
};

/**
 * Format a human-readable summary of NYC MTA service status
 */
export const formatMtaAlertsSummary = (
  alerts: MtaAlert[],
  lineName: string = "MTA Subway"
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
