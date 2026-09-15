import axios from "axios";
import { TflAlert, LondonTransitStationInfo } from "./types";

const TFL_STATUS_API_URL = "https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,dlr,overground,national-rail/Status";

const LONDON_STATIONS: Record<string, LondonTransitStationInfo> = {
  LHR: {
    agency: "TfL",
    airportCode: "LHR",
    name: "Heathrow Airport",
    line: "Piccadilly Line / Elizabeth Line / Heathrow Express",
    lineColor: "#0019A8", // Piccadilly Line Blue
    primaryLines: ["piccadilly", "elizabeth", "heathrow-express"],
    stationLocation: "Underground stations at Terminals 2 & 3, Terminal 4, and Terminal 5",
    fareDescription: "Variable depending on service and origin (via Contactless/Oyster)",
  },
  LGW: {
    agency: "TfL",
    airportCode: "LGW",
    name: "Gatwick Airport",
    line: "Thameslink / Southern / Gatwick Express",
    lineColor: "#E32017", // National Rail redish / Gatwick Express
    primaryLines: ["thameslink", "southern", "gatwick-express"],
    stationLocation: "South Terminal (short shuttle to North Terminal)",
    fareDescription: "Variable depending on service and origin (via Contactless/Oyster/Paper)",
  },
  STN: {
    agency: "TfL",
    airportCode: "STN",
    name: "Stansted Airport",
    line: "Stansted Express / Greater Anglia",
    lineColor: "#0072bc", // Stansted Express Blue
    primaryLines: ["stansted-express", "greater-anglia"],
    stationLocation: "Directly below the main terminal building",
    fareDescription: "Variable depending on origin",
  },
  LTN: {
    agency: "TfL",
    airportCode: "LTN",
    name: "Luton Airport",
    line: "Thameslink / East Midlands Railway (plus Luton DART)",
    lineColor: "#872B88", // Thameslink Pink/Purple
    primaryLines: ["thameslink", "east-midlands-railway"],
    stationLocation: "Luton Airport Parkway (via Luton DART to terminal)",
    fareDescription: "Variable depending on origin (DART often included)",
  },
  LCY: {
    agency: "TfL",
    airportCode: "LCY",
    name: "London City Airport",
    line: "DLR (Docklands Light Railway)",
    lineColor: "#00AFAD", // DLR Teal
    primaryLines: ["dlr"],
    stationLocation: "Elevated station connected to the terminal",
    fareDescription: "Standard TfL Zone 3 fare (via Contactless/Oyster)",
  },
};

/**
 * Check if the given airport code is a London area airport served by TfL / National Rail
 */
export const isLondonAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(LONDON_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, fare details, and primary lines for a London airport
 */
export const getLondonStationInfo = (airportCode?: string): LondonTransitStationInfo | null => {
  if (!airportCode) return null;
  return LONDON_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Fetch real-time TfL Service Alerts for London airport tube and transit lines.
 * The TfL API is publicly accessible.
 */
export const getTflAlerts = async (
  airportCode?: string
): Promise<TflAlert[]> => {
  const airport = airportCode?.toUpperCase();
  const station = airport ? LONDON_STATIONS[airport] : undefined;
  const targetRoutes = new Set(station ? station.primaryLines : [
    "piccadilly", "elizabeth", "heathrow-express", "thameslink", "southern",
    "gatwick-express", "stansted-express", "greater-anglia", "east-midlands-railway", "dlr"
  ]);

  try {
    const response = await axios.get(TFL_STATUS_API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 MakeMyFlight/1.0",
      },
      timeout: 4000,
    });

    const lines = response.data;
    if (!Array.isArray(lines)) {
      return [];
    }

    const matchedAlerts: TflAlert[] = [];
    const seenIds = new Set<string>();

    for (const line of lines) {
      if (!targetRoutes.has(line.id)) continue;

      const lineStatuses = line.lineStatuses;
      if (!Array.isArray(lineStatuses) || lineStatuses.length === 0) continue;

      for (const status of lineStatuses) {
        // statusSeverity 10 means "Good Service", anything else is a disruption
        if (status.statusSeverity === 10) continue;

        const alertId = `${line.id}-${status.id}`;
        if (seenIds.has(alertId)) continue;
        seenIds.add(alertId);

        matchedAlerts.push({
          id: alertId,
          headline: `${line.name}: ${status.statusSeverityDescription}`,
          shortDescription: status.reason || status.statusSeverityDescription || "",
          routeId: line.id,
          agency: "TfL",
          isMajor: status.statusSeverity < 10 || status.statusSeverity > 10,
          url: undefined,
        });

        // Limit to top 5 alerts
        if (matchedAlerts.length >= 5) break;
      }
      if (matchedAlerts.length >= 5) break;
    }

    return matchedAlerts;
  } catch (error) {
    console.error("Failed to fetch TfL alerts:", error instanceof Error ? error.message : error);
    return [];
  }
};

/**
 * Format a human-readable summary of TfL service status
 */
export const formatTflAlertsSummary = (
  alerts: TflAlert[],
  lineName: string = "TfL Transit"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Good Service`;
  }

  const major = alerts.find((a) => a.isMajor);
  if (major) {
    return `⚠️ ${lineName}: ${major.headline}`;
  }

  const first = alerts[0];
  return `ℹ️ ${lineName}: ${first.headline}`;
};
