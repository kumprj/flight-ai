import axios from "axios";
import { BartAlert, BartStationInfo, TransitAlert } from "./types";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const BART_ALERTS_URL = "https://api.bart.gov/gtfsrt/alerts.aspx";

const BART_STATIONS: Record<string, BartStationInfo> = {
  SFO: {
    agency: "BART",
    airportCode: "SFO",
    name: "San Francisco International Airport",
    line: "Antioch - SFO/Millbrae Line",
    lineColor: "#ffe800", // Yellow line
    stationLocation: "International Terminal, Level 3",
    fareDescription: "Fares vary by distance (via Clipper card or contactless payment)",
  },
  OAK: {
    agency: "BART",
    airportCode: "OAK",
    name: "Oakland International Airport",
    line: "Oakland Airport - Coliseum Line (BART to OAK)",
    lineColor: "#d5d0ce", // Beige/Grey line
    stationLocation: "Directly across from Terminals 1 and 2",
    fareDescription: "Fares vary by distance (via Clipper card or contactless payment)",
  },
};

const SFO_KEYWORDS = ["sfo", "sfia", "san francisco", "antioch", "millbrae", "yellow", "red line", "richmond", "daly city"];
const OAK_KEYWORDS = ["oak", "oakl", "oakland", "coliseum", "beige", "connector"];
const SYSTEM_KEYWORDS = ["systemwide", "all lines", "all trains", "entire system", "major delay", "system-wide"];

/**
 * Check if the given airport code is a SF Bay Area airport served by BART
 */
export const isBartAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(BART_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, fare details, and line info for a BART airport
 */
export const getBartStationInfo = (airportCode?: string): BartStationInfo | null => {
  if (!airportCode) return null;
  return BART_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Helper to determine if an alert text or entity relates to the specified airport.
 */
const alertMatchesAirport = (
  airportCode: string,
  text: string,
  entities: any[] = []
): boolean => {
  const upper = airportCode.toUpperCase();
  const lowerText = text.toLowerCase();

  // If the alert is marked system-wide, it applies to all airports
  if (SYSTEM_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    return true;
  }

  const targetKeywords = upper === "SFO" ? SFO_KEYWORDS : upper === "OAK" ? OAK_KEYWORDS : [];
  if (targetKeywords.some((kw) => lowerText.includes(kw))) {
    return true;
  }

  // Check informedEntity route IDs and stop IDs
  for (const entity of entities) {
    const routeId = (entity.routeId || "").toLowerCase();
    const stopId = (entity.stopId || "").toLowerCase();

    if (targetKeywords.some((kw) => routeId.includes(kw) || stopId.includes(kw))) {
      return true;
    }
  }

  // If text specifically mentions other lines only (e.g. only Dublin/Pleasanton or Warm Springs/Berryessa), exclude it
  const otherKeywords = upper === "SFO" ? OAK_KEYWORDS : SFO_KEYWORDS;
  const mentionsOther = otherKeywords.some((kw) => lowerText.includes(kw));
  if (mentionsOther) {
    return false;
  }

  // Default: if no specific routes are mentioned, treat as general BART notice
  return true;
};

/**
 * Fetch real-time BART Service Advisories via GTFS-RT protocol buffers API.
 * Optionally filters alerts relevant to the target airport (SFO or OAK).
 */
export const getBartAlerts = async (airportCode?: string): Promise<BartAlert[]> => {
  try {
    const response = await axios.get(BART_ALERTS_URL, {
      responseType: "arraybuffer",
      timeout: 4000,
    });

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));
    const matchedAlerts: BartAlert[] = [];

    for (const entity of feed.entity) {
      if (!entity.alert) continue;

      const headerEn = (entity.alert.headerText?.translation?.find((t: any) => t.language === "en-US" || t.language === "en")?.text || "").trim();
      const descEn = (entity.alert.descriptionText?.translation?.find((t: any) => t.language === "en-US" || t.language === "en")?.text || "").trim();

      // Ignore normal service advisories if they say "No delays reported"
      if (descEn.toLowerCase().includes("no delays reported") || headerEn.toLowerCase().includes("no delays reported")) {
        continue;
      }

      const combinedText = `${headerEn} ${descEn}`;

      // Filter by airport when airportCode is provided
      if (airportCode && !alertMatchesAirport(airportCode, combinedText, entity.alert.informedEntity || [])) {
        continue;
      }

      // If header is boilerplate ("BART.gov Alert"), prefer description for display/SMS text
      const isBoilerplate = !headerEn || headerEn.toLowerCase() === "bart.gov alert" || headerEn.toLowerCase() === "bart alert";
      const displayText = isBoilerplate ? (descEn || headerEn) : headerEn;

      matchedAlerts.push({
        id: entity.id,
        station: "BART",
        type: "INFO",
        description: descEn || headerEn,
        smsText: displayText,
      });
    }

    return matchedAlerts;
  } catch (error) {
    console.error("Failed to fetch BART alerts:", error instanceof Error ? error.message : error);
    return [];
  }
};

/**
 * Format BART alerts into a concise summary string for notifications and UI display.
 */
export const formatBartAlertsSummary = (
  alerts: BartAlert[],
  lineName: string = "BART"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Normal service`;
  }

  const first = alerts[0];
  const isMajor = first.description?.toLowerCase().includes("delay") || first.smsText?.toLowerCase().includes("delay");
  const icon = isMajor ? "⚠️" : "ℹ️";

  // If smsText is generic boilerplate, use description
  let msg = first.smsText || first.description;
  if (msg.toLowerCase() === "bart.gov alert" && first.description) {
    msg = first.description;
  }

  if (msg.length > 120) {
     msg = msg.substring(0, 117) + "...";
  }

  return `${icon} ${lineName}: ${msg}`;
};

/**
 * Normalise native BART alerts to the shared TransitAlert shape.
 */
export const bartToTransitAlerts = (alerts: BartAlert[], agency = "BART"): TransitAlert[] =>
  alerts.map((a) => {
    const text = a.smsText && a.smsText.toLowerCase() !== "bart.gov alert"
      ? a.smsText
      : a.description;
    const isMajor =
      a.description?.toLowerCase().includes("delay") ||
      a.smsText?.toLowerCase().includes("delay");
    return {
      id: a.id,
      headline: text,
      shortDescription: a.description,
      isMajor: isMajor ?? false,
      agency,
    };
  });

