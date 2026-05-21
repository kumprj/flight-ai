import axios from "axios";
import { getAirportAddress } from "./airports";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GoogleMaps = {
  getTravelTime: async (origin: string, destination: string, arrivalTime: Date) => {
    const destinationAddress = getAirportAddress(destination);

    console.log("Calculating route from:", origin, "to:", destinationAddress);

    // Only pass departureTime if it's more than 5 minutes in the future
    const isFutureDeparture = arrivalTime.getTime() > Date.now() + (5 * 60 * 1000);
    const body: Record<string, any> = {
      origin: {address: origin},
      destination: {address: destinationAddress},
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    };
    if (isFutureDeparture) {
      body.departureTime = arrivalTime.toISOString();
    }

    const response = await axios.post(
        ROUTES_API_URL,
        body,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY!,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.staticDuration",
          },
        }
    );

    const route = response.data.routes?.[0];
    if (!route) {
      throw new Error("No route found");
    }

    console.log("Google Maps API response:", JSON.stringify(route, null, 2));

    const durationSeconds = parseInt(route.duration.replace("s", ""));

    console.log("Parsed duration seconds:", durationSeconds);
    console.log("Duration in minutes:", Math.round(durationSeconds / 60));

    return {
      durationSeconds,
      durationText: `${Math.round(durationSeconds / 60)} mins`,
      distanceMeters: route.distanceMeters,
    };
  },
};
