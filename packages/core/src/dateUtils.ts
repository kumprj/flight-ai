import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { getAirportTimezone } from './airports';

/**
 * Resolve an airport code (e.g. "ORD") or IANA timezone name (e.g. "America/Chicago")
 * into a canonical IANA timezone string.
 */
export const resolveTimezone = (airportCodeOrTimezone?: string): string => {
  if (!airportCodeOrTimezone) {
    return 'America/Chicago';
  }
  // If already an IANA timezone (e.g. contains '/'), use directly
  if (airportCodeOrTimezone.includes('/')) {
    return airportCodeOrTimezone;
  }
  return getAirportTimezone(airportCodeOrTimezone) || 'America/Chicago';
};

/**
 * Convert a naive local ISO departure string (e.g. "2026-05-20T14:30:00")
 * at an origin airport into an exact UTC Date epoch.
 *
 * Handles daylight saving time, airport timezones, and strips any trailing
 * offset or 'Z' indicators that might have been accidentally stored.
 */
export const parseFlightTimeToUTC = (
  naiveIsoString: string,
  airportCodeOrTimezone?: string
): Date => {
  if (!naiveIsoString) {
    throw new Error('naiveIsoString is required');
  }

  const timezone = resolveTimezone(airportCodeOrTimezone);
  // Strip any existing offset or 'Z' suffix to treat as naive local time
  // Strip any existing offset or 'Z' suffix to treat as naive local time
  const [datePart, timePartRaw] = naiveIsoString.split('T');
  const timePart = timePartRaw ? timePartRaw.split('+')[0].split('-')[0].split('Z')[0] : '';
  const cleanStr = timePart ? `${datePart}T${timePart}` : datePart;

  const parsed = fromZonedTime(cleanStr, timezone);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date string: ${naiveIsoString}`);
  }

  return parsed;
};

/**
 * Calculate the floating-point hours remaining until a flight departs.
 * Positive means future flight; negative means flight has departed.
 */
export const calculateHoursUntilFlight = (
  flightUTC: Date,
  now: Date = new Date()
): number => {
  return (flightUTC.getTime() - now.getTime()) / (1000 * 60 * 60);
};

/**
 * Calculate the leave time as a UTC Date based on travel time (in minutes)
 * and the user's arrival buffer preference (in hours).
 */
export const calculateLeaveTime = (
  flightUTC: Date,
  travelTimeMinutes: number,
  arrivalPreferenceHours: number = 2
): Date => {
  const totalMinutesNeeded = travelTimeMinutes + (arrivalPreferenceHours * 60);
  return new Date(flightUTC.getTime() - (totalMinutesNeeded * 60 * 1000));
};

/**
 * Format a leave time UTC epoch in the origin airport's local timezone.
 */
export const formatLeaveTime = (
  leaveTimeUTC: Date,
  airportCodeOrTimezone?: string,
  formatStr: string = 'h:mm a'
): string => {
  const timezone = resolveTimezone(airportCodeOrTimezone);
  return formatInTimeZone(leaveTimeUTC, timezone, formatStr);
};

/**
 * Format a naive flight time string in the airport's local timezone.
 *
 * @param isoString - ISO date string (e.g. "2026-05-20T14:30:00")
 * @param airportCode - IATA code (e.g. "ORD") or timezone
 * @param formatStr - date-fns-tz format string
 */
export const formatFlightTime = (
  isoString: string,
  airportCode: string,
  formatStr: string = 'PPp' // e.g., "May 20, 2026 at 2:30 PM"
): string => {
  try {
    const timezone = resolveTimezone(airportCode);
    const flightUTC = parseFlightTimeToUTC(isoString, timezone);
    return formatInTimeZone(flightUTC, timezone, formatStr);
  } catch (e) {
    console.error('Date formatting error:', e);
    return isoString;
  }
};

/**
 * Format just the flight date (e.g. "May 20, 2026")
 */
export const formatFlightDate = (isoString: string, airportCode: string): string => {
  return formatFlightTime(isoString, airportCode, 'MMM d, yyyy');
};

/**
 * Format just the flight departure time (e.g. "2:30 PM")
 */
export const formatFlightTimeOnly = (isoString: string, airportCode: string): string => {
  return formatFlightTime(isoString, airportCode, 'h:mm a');
};

/**
 * Normalizes a flight number for reliable comparisons:
 * Uppercased, trimmed, and whitespace removed (e.g. "UA 123" -> "UA123").
 */
export const normalizeFlightNumber = (flightNumber?: string): string => {
  if (!flightNumber) return '';
  return flightNumber.trim().toUpperCase().replace(/\s/g, '');
};

/**
 * Extracts YYYY-MM-DD from an ISO string, naive local datetime string, or date string.
 * Example: "2026-05-20T14:30:00" -> "2026-05-20"
 */
export const getTripDateOnly = (dateStr?: string): string => {
  if (!dateStr) return '';
  const [datePart] = dateStr.split(/[T ]/);
  return datePart;
};

/**
 * Checks if a candidate flight (e.g. from Google Calendar) matches any already tracked trip.
 * Compares normalized flight numbers and checks scheduled departure date or revisedDate.
 */
export const isTripAlreadyTracked = (
  candidate: { flightNumber: string; date: string },
  existingTrips: Array<{ flightNumber: string; date: string; revisedDate?: string }>
): boolean => {
  if (!candidate || !candidate.flightNumber || !candidate.date) return false;
  const candNorm = normalizeFlightNumber(candidate.flightNumber);
  const candDate = getTripDateOnly(candidate.date);
  if (!candNorm || !candDate) return false;

  return existingTrips.some((trip) => {
    const tripNorm = normalizeFlightNumber(trip.flightNumber);
    if (tripNorm !== candNorm) return false;

    const origDate = getTripDateOnly(trip.date);
    const revisedDate = getTripDateOnly(trip.revisedDate);

    return origDate === candDate || (Boolean(revisedDate) && revisedDate === candDate);
  });
};

/**
 * Filters candidate flights to return only net-new flights not already tracked in existingTrips.
 */
export const filterNewFlights = <T extends { flightNumber: string; date: string }>(
  candidateFlights: T[],
  existingTrips: Array<{ flightNumber: string; date: string; revisedDate?: string }>
): T[] => {
  if (!Array.isArray(candidateFlights)) return [];
  if (!Array.isArray(existingTrips) || existingTrips.length === 0) return candidateFlights;
  return candidateFlights.filter((flight) => !isTripAlreadyTracked(flight, existingTrips));
};
