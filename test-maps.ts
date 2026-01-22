import axios from "axios";

// Copy-paste the logic here just for the test
const GoogleMaps = {
  getTravelTime: async (origin: string, destination: string) => {
    const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
    console.log("Testing with Key:", process.env.GOOGLE_MAPS_KEY ? "EXISTS" : "MISSING");

    const response = await axios.post(
        ROUTES_API_URL,
        {
          origin: { address: origin },
          destination: { address: destination },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.staticDuration",
          },
        }
    );

    const route = response.data.routes?.[0];
    if (!route) throw new Error("No route found");
    return route.duration;
  }
};

(async () => {
  try {
    const duration = await GoogleMaps.getTravelTime("Chicago, IL", "ORD");
    console.log("Success! Duration:", duration);
  } catch (e: any) {
    console.error("Error:", e.response?.data || e.message);
  }
})();
