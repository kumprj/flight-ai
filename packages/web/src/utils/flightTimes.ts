import { formatInTimeZone } from 'date-fns-tz';
import { parseISO } from 'date-fns';
import { getAirportTimezone } from '../../../core/src/airports';

export const formatFlightDate = (isoString: string, airportCode: string): string => {
  try {
    const timezone = getAirportTimezone(airportCode);
    const date = parseISO(isoString);
    return formatInTimeZone(date, timezone, 'MMM d, yyyy');
  } catch (e) {
    console.error('Date formatting error:', e);
    return isoString;
  }
};

export const formatFlightTimeOnly = (isoString: string, airportCode: string): string => {
  try {
    const timezone = getAirportTimezone(airportCode);
    const date = parseISO(isoString);
    return formatInTimeZone(date, timezone, 'h:mm a');
  } catch (e) {
    console.error('Time formatting error:', e);
    return isoString;
  }
};
