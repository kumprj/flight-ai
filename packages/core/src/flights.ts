import axios from "axios";

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
  search: async (flightIata: string, date?: string): Promise<FlightResult[]> => {
    console.log(`Searching for flight: ${flightIata}`, date ? `on ${date}` : '');

    try {
      const params: any = {
        access_key: process.env.AVIATION_STACK_KEY,
        flight_iata: flightIata,
        limit: 20 // Increase limit to get more results
      };

      // Add date if provided (format: YYYY-MM-DD)
      // NOTE: Free tier may not support this well, but we try
      if (date) {
        params.flight_date = date;
      }

      const res = await axios.get(API_URL, { params });

      if (res.data.error) {
        console.error("Aviationstack Error:", res.data.error);
        throw new Error(res.data.error.info || "Flight API Error");
      }

      const data = res.data.data || [];

      // Map the response
      const mapped = data.map((f: any) => ({
        flightNumber: f.flight.iata,
        airline: f.airline.name,
        origin: f.departure.iata,
        destination: f.arrival.iata,
        departureTime: f.departure.scheduled,
        arrivalTime: f.arrival.scheduled,
        status: f.flight_status
      }));

      // CLIENT-SIDE FILTER as backup if API doesn't respect date param
      if (date && mapped.length > 0) {
        const filtered = mapped.filter((f: FlightResult) =>
            f.departureTime.startsWith(date)
        );

        // If we got matches, return them, otherwise return all (maybe API ignored date)
        return filtered.length > 0 ? filtered : mapped;
      }

      return mapped;

    } catch (error) {
      console.error("Flight Search Exception:", error);
      return [];
    }
  }
};
