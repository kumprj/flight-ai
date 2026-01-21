import axios from "axios";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GoogleMaps = {
  getTravelTime: async (origin: string, destination: string, arrivalTime: Date) => {
    // We want to arrive 2 hours before the flight.
    // Note: The Routes API works best with 'departureTime', but for strict arrival
    // we often estimate or subtract duration. For simplicity here, we ask for
    // traffic conditions assuming we leave *now* (at the trigger time).

    const response = await axios.post(
        ROUTES_API_URL,
        {
          origin: { address: origin },
          destination: { address: destination },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          // 'computeRoutes' requires a field mask to return specific data
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.staticDuration",
          },
        }
    );

    const route = response.data.routes[0];
    if (!route) throw new Error("No route found");

    // Duration comes as "3600s". We parse it to seconds.
    const durationSeconds = parseInt(route.duration.replace("s", ""));

    return {
      durationSeconds,
      durationText: `${Math.round(durationSeconds / 60)} mins`,
      distanceMeters: route.distanceMeters
    };
  }
};
