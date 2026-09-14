import axios from "axios";
import { CtaAlert, CtaStationInfo } from "./types";

const CTA_ALERTS_API_URL = "https://www.transitchicago.com/api/1.0/alerts.aspx";
const CTA_TRAIN_TRACKER_URL = "http://lapi.transitchicago.com/api/1.0/ttarrivals.aspx";

const CHICAGO_STATIONS: Record<string, CtaStationInfo> = {
  ORD: {
    agency: "CTA",
    airportCode: "ORD",
    name: "O'Hare",
    line: "Blue Line",
    lineColor: "#00a1de",
    stationLocation: "Lower level of Terminals 1, 2, and 3 (accessible via pedestrian walkways)",
    fareDescription: "$5.00 from O'Hare / $2.50 to O'Hare (via Ventra card or contactless pay)",
    mapId: "40890",
  },
  MDW: {
    agency: "CTA",
    airportCode: "MDW",
    name: "Midway",
    line: "Orange Line",
    lineColor: "#f9461c",
    stationLocation: "East of terminal, connected via enclosed walkway",
    fareDescription: "$2.50 (via Ventra card or contactless pay)",
    mapId: "40930",
  },
};

/**
 * Check if the given airport code is a Chicago airport served by the CTA
 */
export const isChicagoAirport = (airportCode?: string): boolean => {
  if (!airportCode) return false;
  return Boolean(CHICAGO_STATIONS[airportCode.toUpperCase()]);
};

/**
 * Get station metadata, Ventra fare, and line details for a Chicago airport
 */
export const getCtaStationInfo = (airportCode?: string): CtaStationInfo | null => {
  if (!airportCode) return null;
  return CHICAGO_STATIONS[airportCode.toUpperCase()] || null;
};

/**
 * Fetch real-time CTA Customer Alerts for airport train routes (Blue Line for ORD, Orange Line for MDW).
 * The CTA Customer Alerts API is publicly accessible without an API key.
 */
export const getCtaAlerts = async (
  airportCodeOrRoute?: string
): Promise<CtaAlert[]> => {
  let routeId = "blue,orange";
  if (airportCodeOrRoute) {
    const upper = airportCodeOrRoute.toUpperCase();
    if (upper === "ORD" || upper === "BLUE") {
      routeId = "blue";
    } else if (upper === "MDW" || upper === "ORANGE") {
      routeId = "orange";
    }
  }

  try {
    const response = await axios.get(CTA_ALERTS_API_URL, {
      params: {
        outputType: "JSON",
        routeid: routeId,
      },
      timeout: 4000,
    });

    const rawAlerts = response.data?.CTAAlerts?.Alert;
    if (!rawAlerts) {
      return [];
    }

    const alertList = Array.isArray(rawAlerts) ? rawAlerts : [rawAlerts];

    return alertList.map((a: any): CtaAlert => {
      const impacted = a.ImpactedService?.Service;
      const serviceName = Array.isArray(impacted)
        ? impacted.map((s: any) => s.ServiceName).join(", ")
        : impacted?.ServiceName || "CTA Service";

      return {
        id: a.AlertId || String(Math.random()),
        headline: a.Headline || "",
        shortDescription: (a.ShortDescription || "").trim(),
        impact: a.Impact || "Service Notice",
        severityScore: parseInt(a.SeverityScore || "0", 10),
        isMajor: a.MajorAlert === "1",
        routeId: a.ImpactedService?.Service?.ServiceId || routeId,
        serviceName,
        url: a.AlertURL?.["#cdata-section"] || a.AlertURL || undefined,
      };
    });
  } catch (error) {
    console.error("Failed to fetch CTA alerts:", error instanceof Error ? error.message : error);
    return [];
  }
};

/**
 * Format a human-readable summary of CTA service status
 */
export const formatCtaAlertsSummary = (
  alerts: CtaAlert[],
  lineName: string = "CTA Transit"
): string => {
  if (!alerts || alerts.length === 0) {
    return `${lineName}: Normal service`;
  }

  const major = alerts.find((a) => a.isMajor || a.severityScore >= 50);
  if (major) {
    return `⚠️ ${lineName}: ${major.headline} - ${major.shortDescription}`;
  }

  const first = alerts[0];
  return `ℹ️ ${lineName}: ${first.headline}`;
};

/**
 * Fetch real-time train arrival predictions if a CTA Train Tracker API key is configured.
 */
