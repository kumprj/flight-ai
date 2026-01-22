import axios from "axios";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GoogleMaps = {
  getTravelTime: async (origin: string, destination: string, arrivalTime: Date) => {
    // Note: 'arrivalTime' isn't used in the API call below, which means
    // it calculates traffic for "right now". This is correct for your
    // Worker, which runs 4 hours before the flight (at the moment you want to leave).

    const response = await axios.post(
        ROUTES_API_URL,
        { // <--- WRAP BODY IN OBJECT
          origin: { address: origin },
          destination: { address: destination },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          // Optional: Add 'departureTime' if you want predictive traffic,
          // but omitting it defaults to "now", which is what you want.
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.staticDuration",
          },
        }
    );

    const route = response.data.routes?.[0]; // Add safety check
    if (!route) throw new Error("No route found");

    const durationSeconds = parseInt(route.duration.replace("s", ""));

    return {
      durationSeconds,
      durationText: `${Math.round(durationSeconds / 60)} mins`,
      distanceMeters: route.distanceMeters
    };
  }
};
