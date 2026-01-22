import axios from "axios";

// Aviationstack uses HTTP for the free tier
const API_URL = "http://api.aviationstack.com/v1/flights";

export interface FlightResult {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  status: string;
}

export const Flights = {
  search: async (flightIata: string): Promise<FlightResult[]> => {
    console.log(`Searching for flight: ${flightIata}`);

    try {
      const res = await axios.get(API_URL, {
        params: {
          access_key: process.env.AVIATION_STACK_KEY,
          flight_iata: flightIata,
          // Limit to avoid huge payloads
          limit: 10
        }
      });

      if (res.data.error) {
        console.error("Aviationstack Error:", res.data.error);
        throw new Error(res.data.error.info || "Flight API Error");
      }

      const data = res.data.data || [];

      // Map the messy API response to our clean interface
      return data.map((f: any) => ({
        flightNumber: f.flight.iata,
        airline: f.airline.name,
        origin: f.departure.iata,
        destination: f.arrival.iata,
        departureTime: f.departure.scheduled,
        arrivalTime: f.arrival.scheduled,
        status: f.flight_status
      }));

    } catch (error) {
      console.error("Flight Search Exception:", error);
      return [];
    }
  }
};
