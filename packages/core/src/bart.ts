import axios from "axios";
import { BartAlert, BartStationInfo } from "./types";
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
    fareDescription: "Fares vary by distance (via Clipper card or paper ticket)",
  },
  OAK: {
    agency: "BART",
    airportCode: "OAK",
    name: "Oakland International Airport",
    line: "Oakland Airport - Coliseum Line (BART to OAK)",
    lineColor: "#d5d0ce", // Beige/Grey line
    stationLocation: "Directly across from Terminals 1 and 2",
    fareDescription: "Fares vary by distance (via Clipper card or paper ticket)",
  },
};

export const isBartAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(BART_STATIONS[airportCode.toUpperCase()]);
};

export const getBartStationInfo = (airportCode?: string): BartStationInfo | null => {
  if (!airportCode) return null;
  return BART_STATIONS[airportCode.toUpperCase()] || null;
};

export const getBartAlerts = async (): Promise<BartAlert[]> => {
  try {
    const response = await axios.get(BART_ALERTS_URL, {
      responseType: "arraybuffer",
      timeout: 4000,
    });

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(response.data));
    const matchedAlerts: BartAlert[] = [];

    for (const entity of feed.entity) {
      if (!entity.alert) continue;

      const headerEn = entity.alert.headerText?.translation?.find((t: any) => t.language === "en-US" || t.language === "en")?.text || "";
      const descEn = entity.alert.descriptionText?.translation?.find((t: any) => t.language === "en-US" || t.language === "en")?.text || "";

      // Ignore normal service advisories if they say "No delays reported"
      if (descEn.toLowerCase().includes("no delays reported") || headerEn.toLowerCase().includes("no delays reported")) {
        continue;
      }

      matchedAlerts.push({
        id: entity.id,
        station: "BART",
        type: "INFO",
        description: descEn || headerEn,
        sms_text: headerEn,
        posted: "",
        expires: "",
      });
    }

    return matchedAlerts;
  } catch (error) {
    console.error("Failed to fetch BART alerts:", error instanceof Error ? error.message : error);
    return [];
  }
};

export const formatBartAlertsSummary = (
  alerts: BartAlert[],
  lineName: string = "BART"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Normal service`;
  }

  const first = alerts[0];
  const isMajor = first.description?.toLowerCase().includes("delay") || first.sms_text?.toLowerCase().includes("delay");
  const icon = isMajor ? "⚠️" : "ℹ️";

  let msg = first.sms_text || first.description;
  if (msg.length > 100) {
     msg = msg.substring(0, 97) + "...";
  }

  return `${icon} ${lineName}: ${msg}`;
};
