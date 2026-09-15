import axios from "axios";
import { getAirportAddress } from "./airports";
import { TravelTimeInfo, MultiModalTravelTime, TransitAlert, TransitStep, TransitStationInfo } from "./types";
import { isChicagoAirport, getCtaAlerts, getCtaStationInfo, formatCtaAlertsSummary, ctaToTransitAlerts } from "./cta";
import { isNycAirport, getMtaAlerts, getNycStationInfo, formatMtaAlertsSummary, mtaToTransitAlerts } from "./mta";
import { isLondonAirport, getTflAlerts, getLondonStationInfo, formatTflAlertsSummary, tflToTransitAlerts } from "./tfl";
import { isBartAirport, getBartAlerts, getBartStationInfo, formatBartAlertsSummary, bartToTransitAlerts } from "./bart";
import { isDcAirport, getWmataAlerts, getWmataStationInfo, formatWmataAlertsSummary, wmataToTransitAlerts } from "./wmata";
import { isBostonAirport, getMbtaAlerts, getMbtaStationInfo, formatMbtaAlertsSummary, mbtaToTransitAlerts } from "./mbta";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

// ---------------------------------------------------------------------------
// Transit agency registry
// ---------------------------------------------------------------------------
// Each entry describes one supported transit agency. To add a new city:
//   1. Create a module following the cta/mta/tfl/bart pattern.
//   2. Add a single entry here — no other files need to change.
// ---------------------------------------------------------------------------

export interface TransitAgencyConfig {
  /** Human-readable agency name used as fallback display label. */
  name: string;
  /** Returns true when the destination airport code is served by this agency. */
  isMatch: (airportCode: string) => boolean;
  /** Fetches live alerts; resolves to [] on any error. */
  fetchAlerts: (airportCode: string) => Promise<any[]>;
  /** Returns static station / fare info for the airport, or null if unsupported. */
  getStationInfo: (airportCode: string) => TransitStationInfo | null;
  /** Formats a human-readable one-line summary from native alert objects. */
  formatSummary: (alerts: any[], lineName: string) => string;
  /** Normalises native alert objects to the shared TransitAlert shape. */
  toTransitAlerts: (alerts: any[]) => TransitAlert[];
}

export const TRANSIT_REGISTRY: TransitAgencyConfig[] = [
  {
    name: "CTA",
    isMatch: isChicagoAirport,
    fetchAlerts: getCtaAlerts,
    getStationInfo: getCtaStationInfo,
    formatSummary: formatCtaAlertsSummary,
    toTransitAlerts: ctaToTransitAlerts,
  },
  {
    name: "MTA",
    isMatch: isNycAirport,
    fetchAlerts: getMtaAlerts,
    getStationInfo: getNycStationInfo,
    formatSummary: formatMtaAlertsSummary,
    toTransitAlerts: mtaToTransitAlerts,
  },
  {
    name: "TfL",
    isMatch: isLondonAirport,
    fetchAlerts: getTflAlerts,
    getStationInfo: getLondonStationInfo,
    formatSummary: formatTflAlertsSummary,
    toTransitAlerts: tflToTransitAlerts,
  },
  {
    name: "BART",
    isMatch: isBartAirport,
    fetchAlerts: getBartAlerts,
    getStationInfo: getBartStationInfo,
    formatSummary: formatBartAlertsSummary,
    toTransitAlerts: bartToTransitAlerts,
  },
  {
    name: "WMATA",
    isMatch: isDcAirport,
    fetchAlerts: getWmataAlerts,
    getStationInfo: getWmataStationInfo,
    formatSummary: formatWmataAlertsSummary,
    toTransitAlerts: wmataToTransitAlerts,
  },
  {
    name: "MBTA",
    isMatch: isBostonAirport,
    fetchAlerts: getMbtaAlerts,
    getStationInfo: getMbtaStationInfo,
    formatSummary: formatMbtaAlertsSummary,
    toTransitAlerts: mbtaToTransitAlerts,
  },
];

export const GoogleMaps = {
  /**
   * Calculate travel time for a specific mode ("DRIVE" or "TRANSIT")
   */
  getTravelTime: async (
    origin: string,
    destination: string,
    arrivalTime: Date,
    mode: "DRIVE" | "TRANSIT" = "DRIVE"
  ): Promise<TravelTimeInfo> => {
    const destinationAddress = getAirportAddress(destination);

    console.log(`Calculating ${mode} route from: ${origin} to: ${destinationAddress}`);

    // Only pass departureTime if it's more than 5 minutes in the future
    const isFutureDeparture = arrivalTime.getTime() > Date.now() + (5 * 60 * 1000);
    const body: Record<string, any> = {
      origin: { address: origin },
      destination: { address: destinationAddress },
      travelMode: mode,
    };

    // Note: routingPreference is only valid for DRIVE in Routes API
    if (mode === "DRIVE") {
      body.routingPreference = "TRAFFIC_AWARE";
    }

    if (isFutureDeparture) {
      body.departureTime = arrivalTime.toISOString();
    }

    const fieldMask = mode === "TRANSIT"
      ? "routes.duration,routes.distanceMeters,routes.legs.steps,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails,routes.legs.steps.transitDetails.transitLine,routes.legs.steps.transitDetails.stopDetails"
      : "routes.duration,routes.distanceMeters,routes.staticDuration";

    let response;
    try {
      response = await axios.post(
        ROUTES_API_URL,
        body,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY!,
            "X-Goog-FieldMask": fieldMask,
            "X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1",
          },
        }
      );
    } catch (err: any) {
      if (isFutureDeparture) {
        console.warn(`[GoogleMaps] Request failed with departureTime ${body.departureTime}, retrying with current time:`, err.message);
        const fallbackBody = { ...body };
        delete fallbackBody.departureTime;
        response = await axios.post(
          ROUTES_API_URL,
          fallbackBody,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY!,
              "X-Goog-FieldMask": fieldMask,
              "X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1",
            },
          }
        );
      } else {
        throw err;
      }
    }

    const route = response.data.routes?.[0];
    if (!route) {
      throw new Error(`No ${mode.toLowerCase()} route found`);
    }

    const durationSeconds = parseInt(route.duration?.replace("s", "") || "0", 10);

    let transitLine: string | undefined;
    let transitAgency: string | undefined;
    let transitSteps: TransitStep[] | undefined;

    if (mode === "TRANSIT" && route.legs) {
      transitSteps = [];
      const transitLines: string[] = [];
      for (const leg of route.legs) {
        if (leg.steps) {
          for (const step of leg.steps) {
            const instruction = step.navigationInstruction?.instructions || step.instruction;
            const stepInfo: TransitStep = {
              instruction,
              distanceMeters: step.distanceMeters,
              durationSeconds: parseInt(step.duration?.replace("s", "") || "0", 10),
            };

            if (step.transitDetails) {
              const line = step.transitDetails.transitLine;
              const vehicleType = typeof line?.vehicle?.name === "object" ? line.vehicle.name.text : line?.vehicle?.name;
              const isBus = line?.vehicle?.type === "BUS" || vehicleType?.toLowerCase()?.includes("bus");

              let lineName: string | undefined;
              if (line?.nameShort && line?.name) {
                if (line.name.toLowerCase().includes(line.nameShort.toLowerCase())) {
                  lineName = line.name;
                } else if (isBus) {
                  lineName = `${line.nameShort} - ${line.name}`;
                } else {
                  lineName = line.name;
                }
              } else {
                lineName = line?.nameShort || line?.name;
              }

              if (!transitLine && lineName) {
                transitLine = lineName;
                transitAgency = line?.agencies?.[0]?.name;
              }

              // Collect all unique transit lines for the full route
              if (lineName && !transitLines.includes(lineName)) {
                transitLines.push(lineName);
              }

              const departureStop = step.transitDetails.stopDetails?.departureStop?.name;
              const arrivalStop = step.transitDetails.stopDetails?.arrivalStop?.name;

              stepInfo.transitLine = lineName;
              stepInfo.lineShortName = line?.nameShort;
              stepInfo.transitAgency = line?.agencies?.[0]?.name;
              stepInfo.departureStop = departureStop;
              stepInfo.arrivalStop = arrivalStop;
              stepInfo.stopName = departureStop || arrivalStop || step.transitDetails.stopDetails?.name;
              stepInfo.vehicleType = vehicleType;
              stepInfo.numStops = step.transitDetails.numStops;
            }

            transitSteps.push(stepInfo);
          }
        }
      }

      // Create a combined route string like "7 / E / F / M / R Subway + LaGuardia Link Q70-SBS"
      if (transitLines.length > 0) {
        transitLine = transitLines.join(' / ');
      }
    }

    return {
      durationSeconds,
      durationText: `${Math.round(durationSeconds / 60)} mins`,
      distanceMeters: route.distanceMeters,
      mode,
      transitLine,
      transitAgency,
      summary: transitLine ? `${transitLine} (${transitAgency || "CTA"})` : undefined,
      transitSteps,
    };
  },

  /**
   * Calculate travel times for both Drive and Public Transit (when enabled),
   * including live transit alerts and station information for any supported agency.
   */
  getMultiModalTravelTime: async (
    origin: string,
    destination: string,
    arrivalTime: Date,
    includeTransit: boolean = false
  ): Promise<MultiModalTravelTime> => {
    // 1. Always calculate Drive
    const drivePromise = GoogleMaps.getTravelTime(origin, destination, arrivalTime, "DRIVE");

    // 2. If transit enabled, calculate Transit in parallel
    const transitPromise = includeTransit
      ? GoogleMaps.getTravelTime(origin, destination, arrivalTime, "TRANSIT").catch((err) => {
          console.warn("Public transit route lookup failed:", err.message);
          return undefined;
        })
      : Promise.resolve(undefined);

    // 3. Match destination to a registered transit agency (at most one will match)
    const matchedAgency = TRANSIT_REGISTRY.find((a) => a.isMatch(destination));

    // 4. Fetch live alerts and static station info from the matched agency, if any
    const alertsPromise: Promise<any[] | undefined> =
      matchedAgency && includeTransit
        ? matchedAgency.fetchAlerts(destination).catch(() => [])
        : Promise.resolve(undefined);

    const [drive, transit, nativeAlerts] = await Promise.all([
      drivePromise,
      transitPromise,
      alertsPromise,
    ]);

    const stationInfo = matchedAgency
      ? matchedAgency.getStationInfo(destination) || undefined
      : undefined;

    const alerts =
      nativeAlerts && nativeAlerts.length > 0
        ? matchedAgency!.toTransitAlerts(nativeAlerts)
        : nativeAlerts !== undefined
        ? [] // agency matched but returned no alerts
        : undefined; // no agency matched (non-transit airport)

    return { drive, transit, alerts, stationInfo };
  },
};

/**
 * Resolves transit agency name, line display name, and formatted alert summary
 * for a multimodal travel time estimate.
 */
export const resolveTransitAlertSummary = (travelEstimate: MultiModalTravelTime): {
  transitAgency: string;
  transitLineName: string;
  transitAlertsSummary?: string;
} => {
  const agency = travelEstimate.stationInfo?.agency ?? "Public Transit";
  const lineName = travelEstimate.stationInfo?.line;

  const transitAgency = agency;
  const transitLineName =
    lineName ||
    (travelEstimate.transit?.transitLine
      ? `${travelEstimate.transit.transitLine} (${agency})`
      : `${agency} Public Transit`);

  let transitAlertsSummary: string | undefined;

  if (travelEstimate.alerts && travelEstimate.alerts.length > 0) {
    const alerts = travelEstimate.alerts;
    const major = alerts.find((a) => a.isMajor);
    const displayLine = lineName || alerts[0].agency;
    if (major) {
      transitAlertsSummary = `⚠️ ${displayLine}: ${major.headline}`;
    } else {
      transitAlertsSummary = `ℹ️ ${displayLine}: ${alerts[0].headline}`;
    }
  }

  return { transitAgency, transitLineName, transitAlertsSummary };
};

/**
 * Formats the stop segment portion of a transit step label, e.g. " - 79th to O'Hare".
 * Returns an empty string when neither departure nor arrival stop is known.
 */
export const formatStopSegment = (step: { departureStop?: string; arrivalStop?: string }): string => {
  if (step.departureStop && step.arrivalStop) return ` - ${step.departureStop} to ${step.arrivalStop}`;
  if (step.departureStop) return ` - from ${step.departureStop}`;
  if (step.arrivalStop) return ` - to ${step.arrivalStop}`;
  return '';
};
