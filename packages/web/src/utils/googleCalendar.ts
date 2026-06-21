import { Config } from '../config';

export interface CalendarFlight {
  flightNumber: string;
  date: string;        // YYYY-MM-DD
  eventTitle: string;
  eventId: string;
  address?: string;
  description?: string;
  route?: { from: string; to: string };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const TOKEN_KEY = 'gcal_access_token';
const EXPIRY_KEY = 'gcal_token_expiry';
const EXPIRY_BUFFER_MS = 2 * 60 * 1000; // refresh 2 min before actual expiry

function getCachedToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiry = sessionStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() >= Number(expiry) - EXPIRY_BUFFER_MS) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

function cacheToken(token: string, expiresIn: number) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

const FLIGHT_REGEX = /\b([A-Z]{2})\s?(\d{2,4})\b/g;
const AIRPORT_REGEX = /\b([A-Z]{3})\b/g;
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function waitForGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (++attempts > 40) {
        clearInterval(interval);
        reject(new Error('Google Identity Services failed to load'));
      }
    }, 250);
  });
}

function getAccessToken(): Promise<string> {
  const cached = getCachedToken();
  if (cached) return Promise.resolve(cached);

  return new Promise(async (resolve, reject) => {
    await waitForGIS();
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: Config.GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Failed to get access token'));
        } else {
          cacheToken(response.access_token, response.expires_in ?? 3600);
          resolve(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  });
}

async function fetchCalendarEvents(accessToken: string): Promise<any[]> {
  const now = new Date();
  const in12Months = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: in12Months.toISOString(),
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

function parseRoute(text: string): { from: string; to: string } | undefined {
  // Pattern 1: United/airline format: "City, ST ABC time - City DEF time"
  // Example: "Chicago, IL ORD 2:35pm (local time) - Charleston CRW 5:30pm"
  const airlinePattern = /([A-Z]{3})\s+\d{1,2}:\d{2}\s*[ap]m.*?-.*?([A-Z]{3})\s+\d{1,2}:\d{2}\s*[ap]m/i;
  let match = text.match(airlinePattern);
  if (match) {
    return { from: match[1].toUpperCase(), to: match[2].toUpperCase() };
  }
  
  // Pattern 2: Simple patterns like "SFO to ORD", "SFO-ORD", "SFO → ORD"
  const simplePattern = /\b([A-Z]{3})\s*(?:to|-|→)\s*([A-Z]{3})\b/i;
  match = text.match(simplePattern);
  if (match) {
    return { from: match[1].toUpperCase(), to: match[2].toUpperCase() };
  }
  
  // Pattern 3: Look for airport codes near time patterns
  // Match 3-letter codes that appear before time patterns like "2:35pm" or "14:35"
  const timePattern = /\b([A-Z]{3})\s+\d{1,2}:\d{2}/gi;
  const timeMatches = [...text.matchAll(timePattern)];
  if (timeMatches.length >= 2) {
    return { from: timeMatches[0][1].toUpperCase(), to: timeMatches[1][1].toUpperCase() };
  }
  
  return undefined;
}

function parseFlightsFromEvents(events: any[]): CalendarFlight[] {
  const found: CalendarFlight[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const summary = event.summary ?? '';
    const description = event.description ?? '';
    const text = `${summary} ${description}`.toUpperCase();
    const matches = [...text.matchAll(FLIGHT_REGEX)];

    const dateStr: string =
      event.start?.date ?? event.start?.dateTime?.split('T')[0] ?? '';

    for (const match of matches) {
      const flightNumber = match[1] + match[2];
      const key = `${flightNumber}::${dateStr}`;
      if (!seen.has(key) && dateStr) {
        seen.add(key);
        const route = parseRoute(text);
        found.push({
          flightNumber,
          date: dateStr,
          eventTitle: summary,
          description,
          eventId: event.id,
          route,
        });
      }
    }
  }

  // Separate past and future flights
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today
  const todayStr = now.toISOString().split('T')[0];
  
  const pastFlights = found.filter(f => f.date < todayStr);
  const futureFlights = found.filter(f => f.date >= todayStr);
  
  // Sort future flights by date ascending (earliest first)
  futureFlights.sort((a, b) => a.date.localeCompare(b.date));
  
  // Sort past flights by date descending (most recent first)
  pastFlights.sort((a, b) => b.date.localeCompare(a.date));
  
  // Return future flights first, then past flights
  return [...futureFlights, ...pastFlights];
}

export async function scanCalendarForFlights(): Promise<CalendarFlight[]> {
  const accessToken = await getAccessToken();
  const events = await fetchCalendarEvents(accessToken);
  return parseFlightsFromEvents(events);
}
