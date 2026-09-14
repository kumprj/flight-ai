import axios from "axios";
import { getAirportAddress } from "./airports";
import { TravelTimeInfo, MultiModalTravelTime } from "./types";
import { isChicagoAirport, getCtaAlerts, getCtaStationInfo } from "./cta";
import { isNycAirport, getMtaAlerts, getNycStationInfo } from "./mta";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

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
      ? "routes.duration,routes.distanceMeters,routes.legs.steps.transitDetails"
      : "routes.duration,routes.distanceMeters,routes.staticDuration";

    const response = await axios.post(
      ROUTES_API_URL,
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY!,
          "X-Goog-FieldMask": fieldMask,
        },
      }
    );

    const route = response.data.routes?.[0];
    if (!route) {
      throw new Error(`No ${mode.toLowerCase()} route found`);
    }

    const durationSeconds = parseInt(route.duration?.replace("s", "") || "0", 10);

    let transitLine: string | undefined;
    let transitAgency: string | undefined;

    if (mode === "TRANSIT" && route.legs) {
      for (const leg of route.legs) {
        if (leg.steps) {
          for (const step of leg.steps) {
            if (step.transitDetails?.transitLine) {
              const line = step.transitDetails.transitLine;
              transitLine = line.name || line.nameShort;
              transitAgency = line.agencies?.[0]?.name;
              break;
            }
          }
        }
        if (transitLine) break;
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
    };
  },

  /**
   * Calculate travel times for both Drive and Public Transit (when enabled),
   * including live Chicago CTA alerts and station information when applicable.
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

    // 3. If Chicago airport (ORD/MDW), fetch live CTA alerts
    const isCta = isChicagoAirport(destination);
    const ctaAlertsPromise = isCta && includeTransit
      ? getCtaAlerts(destination).catch(() => [])
      : Promise.resolve(undefined);

    // 4. If New York airport (JFK/LGA/EWR), fetch live MTA alerts
    const isNyc = isNycAirport(destination);
    const mtaAlertsPromise = isNyc && includeTransit
      ? getMtaAlerts(destination).catch(() => [])
      : Promise.resolve(undefined);

    const [drive, transit, ctaAlerts, mtaAlerts] = await Promise.all([
      drivePromise,
      transitPromise,
      ctaAlertsPromise,
      mtaAlertsPromise,
    ]);

    const stationInfo = isCta
      ? getCtaStationInfo(destination) || undefined
      : isNyc
      ? getNycStationInfo(destination) || undefined
      : undefined;

    return {
      drive,
      transit,
      ctaAlerts,
      mtaAlerts,
      stationInfo,
    };
  },
};
