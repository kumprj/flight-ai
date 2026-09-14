import axios from "axios";

const AERODATABOX_BASE_URL = "https://aerodatabox.p.rapidapi.com";

// Simple in-memory cache to avoid rate limiting
const cache = new Map<string, { data: FlightResult[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface FlightResult {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: string; // Effective departure time (revised if present, else scheduled)
  scheduledDepartureTime?: string;
  revisedDepartureTime?: string;
  arrivalTime: string; // Effective arrival time (revised if present, else scheduled)
  scheduledArrivalTime?: string;
  revisedArrivalTime?: string;
  delayMinutes?: number;
  status: string;
  timezone: string;
}

const aeroHeaders = () => ({
  'X-RapidAPI-Key': process.env.AERODATABOX_API_KEY!,
  'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
});

/**
 * AeroDataBox returns times as "YYYY-MM-DD HH:mm+HH:mm" (local time with offset).
 * Strip the offset to get a naive local time string for storage.
 */
export const parseLocalTime = (timeStr: string): string => {
  if (!timeStr) return '';
  // "2026-05-21 17:45-05:00" -> "2026-05-21T17:45:00"
  const withoutOffset = timeStr.replace(/[+-]\d{2}:\d{2}$/, '').trim();
  return withoutOffset.replace(' ', 'T') + (withoutOffset.includes(':') && withoutOffset.split(':').length === 2 ? ':00' : '');
};

export const mapFlight = (f: any): FlightResult => {
  const scheduledDep = parseLocalTime(f.departure?.scheduledTime?.local || '');
  const revisedDep = parseLocalTime(
    f.departure?.revisedTime?.local ||
    f.departure?.predictedTime?.local ||
    f.departure?.actualTime?.local || ''
  );

  const scheduledArr = parseLocalTime(f.arrival?.scheduledTime?.local || '');
  const revisedArr = parseLocalTime(
    f.arrival?.revisedTime?.local ||
    f.arrival?.predictedTime?.local ||
    f.arrival?.actualTime?.local || ''
  );

  // Determine delay in minutes
  let delayMinutes: number | undefined;
  if (typeof f.departure?.delay === 'number') {
    delayMinutes = f.departure.delay;
  } else if (scheduledDep && revisedDep) {
    const schedMs = new Date(scheduledDep).getTime();
    const revMs = new Date(revisedDep).getTime();
    if (!isNaN(schedMs) && !isNaN(revMs)) {
      const diff = Math.round((revMs - schedMs) / (60 * 1000));
      if (diff !== 0) {
        delayMinutes = diff;
      }
    }
  }

  // Derive status if status string is missing or generic
  let status = f.status || 'Unknown';
  if (status === 'Unknown' || status === 'Scheduled') {
    if (delayMinutes && delayMinutes > 0) {
      status = 'Delayed';
    }
  }

  return {
    flightNumber: f.number?.replace(/ /g, '') || '',
    airline: f.airline?.name || '',
    origin: f.departure?.airport?.iata || '',
    destination: f.arrival?.airport?.iata || '',
    // Prioritize revised departure time over scheduled departure time
    departureTime: revisedDep || scheduledDep,
    scheduledDepartureTime: scheduledDep || undefined,
    revisedDepartureTime: revisedDep || undefined,
    arrivalTime: revisedArr || scheduledArr,
    scheduledArrivalTime: scheduledArr || undefined,
    revisedArrivalTime: revisedArr || undefined,
    delayMinutes: delayMinutes && delayMinutes > 0 ? delayMinutes : undefined,
    status,
    timezone: f.departure?.airport?.timeZone || 'UTC',
  };
};

export const Flights = {
  search: async (flightIata: string, date?: string): Promise<FlightResult[]> => {
    const today = new Date().toISOString().split('T')[0];
    const searchDate = date || today;
    const cacheKey = `flight:${flightIata}:${searchDate}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Returning cached results for flight: ${flightIata} on ${searchDate}`);
      return cached.data;
    }

    console.log(`Searching AeroDataBox for flight: ${flightIata} on ${searchDate}`);

    try {
      const res = await axios.get(
        `${AERODATABOX_BASE_URL}/flights/number/${encodeURIComponent(flightIata)}/${searchDate}`,
        { headers: aeroHeaders() }
      );

      const data: any[] = Array.isArray(res.data) ? res.data : [];
      console.log(`AeroDataBox returned ${data.length} results`);
      const results = data.map(mapFlight);
      
      // Cache the results
      cache.set(cacheKey, { data: results, timestamp: Date.now() });
      
      return results;
    } catch (error: any) {
      console.error("AeroDataBox Flight Search Exception:", error?.response?.data || error?.message || error);
      return [];
    }
  },

  checkStatus: async (flightIata: string, dateStr: string): Promise<FlightResult | null> => {
    try {
      // dateStr should be YYYY-MM-DD
      const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const results = await Flights.search(flightIata, cleanDate);
      if (!results || results.length === 0) return null;

      const normalizedInput = flightIata.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const match = results.find(
        r => r.flightNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === normalizedInput
      ) || results[0];

      return match;
    } catch (error: any) {
      console.error(`Failed to check status for ${flightIata} on ${dateStr}:`, error?.message || error);
      return null;
    }
  },

  searchByRoute: async (depIata: string, arrIata: string, date: string): Promise<FlightResult[]> => {
    const cacheKey = `route:${depIata}:${arrIata}:${date}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Returning cached results for route: ${depIata} -> ${arrIata} on ${date}`);
      return cached.data;
    }

    console.log(`Searching AeroDataBox for route: ${depIata} -> ${arrIata} on ${date}`);

    try {
      // AeroDataBox limits airport queries to 12-hour windows, so split the day into AM and PM halves
      const [amRes, pmRes] = await Promise.all([
        axios.get(
          `${AERODATABOX_BASE_URL}/flights/airports/iata/${depIata}/${date}T00:00/${date}T11:59`,
          { params: { direction: 'Departure', withLeg: true }, headers: aeroHeaders() }
        ),
        axios.get(
          `${AERODATABOX_BASE_URL}/flights/airports/iata/${depIata}/${date}T12:00/${date}T23:59`,
          { params: { direction: 'Departure', withLeg: true }, headers: aeroHeaders() }
        ),
      ]);

      const departures: any[] = [
        ...(amRes.data?.departures || []),
        ...(pmRes.data?.departures || []),
      ];

      console.log(`AeroDataBox route search returned ${departures.length} total departures`);

      const results = departures
        .filter((f: any) => f.arrival?.airport?.iata?.toUpperCase() === arrIata.toUpperCase())
        .map(mapFlight)
        .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
      
      // Cache the results
      cache.set(cacheKey, { data: results, timestamp: Date.now() });
      
      return results;
    } catch (error: any) {
      console.error("AeroDataBox Route Search Exception:", error?.response?.data || error?.message || error);
      return [];
    }
  }
};
