import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getAirportTimezone } from './timezones';

/**
 * Format a flight time in the airport's local timezone
 * @param isoString - ISO date string from API (e.g. "2026-05-20T14:30:00")
 * @param airportCode - IATA code (e.g. "ORD")
 * @param formatStr - date-fns format string
 */
export const formatFlightTime = (
    isoString: string,
    airportCode: string,
    formatStr: string = 'PPp' // e.g., "May 20, 2026 at 2:30 PM"
): string => {
  try {
    const timezone = getAirportTimezone(airportCode);
    const date = parseISO(isoString);
    return formatInTimeZone(date, timezone, formatStr);
  } catch (e) {
    console.error('Date formatting error:', e);
    return isoString;
  }
};

/**
 * Format just the date
 */
export const formatFlightDate = (isoString: string, airportCode: string): string => {
  return formatFlightTime(isoString, airportCode, 'MMM d, yyyy');
};

/**
 * Format just the time
 */
export const formatFlightTimeOnly = (isoString: string, airportCode: string): string => {
  return formatFlightTime(isoString, airportCode, 'h:mm a');
};
