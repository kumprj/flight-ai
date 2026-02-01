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
  timezone: string;
}

/**
 * Aviation Stack returns times in UTC format but they represent LOCAL time
 * Extract just the time portion and combine with date to treat as local
 */
const parseAsLocalTime = (isoString: string, timezone: string): string => {
  if (!isoString) return '';

  // Extract date and time parts: "2026-02-01T16:25:00+00:00" -> "2026-02-01T16:25:00"
  const withoutTimezone = isoString.split('+')[0].split('Z')[0];

  // Return in simple ISO format to be interpreted as local
  return withoutTimezone;
};

export const Flights = {
  search: async (flightIata: string, date?: string): Promise<FlightResult[]> => {
    console.log(`Searching for flight: ${flightIata}`, date ? `on ${date}` : '');

    try {
      const params: any = {
        access_key: process.env.AVIATION_STACK_KEY,
        flight_iata: flightIata,
        limit: 20
      };

      if (date) {
        params.flight_date = date;
      }

      const res = await axios.get(API_URL, {params});

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
        // Strip timezone suffix to treat as local time
        departureTime: parseAsLocalTime(f.departure.scheduled, f.departure.timezone),
        arrivalTime: parseAsLocalTime(f.arrival.scheduled, f.arrival.timezone),
        status: f.flight_status,
        timezone: f.departure.timezone || 'UTC'
      }));

      // Filter by date if provided
      if (date && mapped.length > 0) {
        const filtered = mapped.filter((f: FlightResult) =>
            f.departureTime.startsWith(date)
        );
        return filtered.length > 0 ? filtered : mapped;
      }

      return mapped;

    } catch (error) {
      console.error("Flight Search Exception:", error);
      return [];
    }
  }
};
