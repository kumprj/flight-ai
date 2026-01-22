// Mapping of major airport IATA codes to IANA timezone strings
// You can expand this list as needed
const AIRPORT_TIMEZONES: Record<string, string> = {
  // US
  'JFK': 'America/New_York',
  'LGA': 'America/New_York',
  'EWR': 'America/New_York',
  'BOS': 'America/New_York',
  'ORD': 'America/Chicago',
  'MDW': 'America/Chicago',
  'DFW': 'America/Chicago',
  'IAH': 'America/Chicago',
  'LAX': 'America/Los_Angeles',
  'SFO': 'America/Los_Angeles',
  'SEA': 'America/Los_Angeles',
  'LAS': 'America/Los_Angeles',
  'PHX': 'America/Phoenix',
  'DEN': 'America/Denver',
  'ATL': 'America/New_York',
  'MIA': 'America/New_York',
  'MCO': 'America/New_York',

  // Europe
  'LHR': 'Europe/London',
  'LGW': 'Europe/London',
  'CDG': 'Europe/Paris',
  'AMS': 'Europe/Amsterdam',
  'FRA': 'Europe/Berlin',
  'MAD': 'Europe/Madrid',
  'FCO': 'Europe/Rome',
  'DUB': 'Europe/Dublin',

  // Asia
  'HND': 'Asia/Tokyo',
  'NRT': 'Asia/Tokyo',
  'PEK': 'Asia/Shanghai',
  'PVG': 'Asia/Shanghai',
  'HKG': 'Asia/Hong_Kong',
  'SIN': 'Asia/Singapore',
  'ICN': 'Asia/Seoul',
  'BKK': 'Asia/Bangkok',
  'DEL': 'Asia/Kolkata',
  'DXB': 'Asia/Dubai',

  // Add more as needed
};

export const getAirportTimezone = (iataCode: string): string => {
  return AIRPORT_TIMEZONES[iataCode.toUpperCase()] || Intl.DateTimeFormat().resolvedOptions().timeZone;
};
