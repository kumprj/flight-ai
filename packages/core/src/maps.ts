import axios from "axios";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GoogleMaps = {
  getTravelTime: async (origin: string, destination: string, arrivalTime: Date) => {
    // Convert airport code to actual airport address
    const AIRPORT_ADDRESSES: Record<string, string> = {
      'ORD': "O'Hare International Airport, Chicago, IL",
      'MDW': "Midway International Airport, Chicago, IL",
      'LAX': "Los Angeles International Airport, CA",
      'JFK': "John F. Kennedy International Airport, New York, NY",
      // Add more as needed
    };

    const destinationAddress = AIRPORT_ADDRESSES[destination.toUpperCase()] || `${destination} Airport`;

    console.log("Calculating route from:", origin, "to:", destinationAddress);

    const response = await axios.post(
        ROUTES_API_URL,
        {
          origin: {address: origin},
          destination: {address: destinationAddress}, // Use the formatted address
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        },
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
