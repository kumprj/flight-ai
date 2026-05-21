import { Config } from '../config';

export interface CalendarFlight {
  flightNumber: string;
  date: string;        // YYYY-MM-DD
  eventTitle: string;
  eventId: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const FLIGHT_REGEX = /\b([A-Z]{2})\s?(\d{2,4})\b/g;
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
  return new Promise(async (resolve, reject) => {
    await waitForGIS();
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: Config.GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Failed to get access token'));
        } else {
          resolve(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  });
}

async function fetchCalendarEvents(accessToken: string): Promise<any[]> {
  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: in60Days.toISOString(),
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

function parseFlightsFromEvents(events: any[]): CalendarFlight[] {
  const found: CalendarFlight[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const text = `${event.summary ?? ''} ${event.description ?? ''}`.toUpperCase();
    const matches = [...text.matchAll(FLIGHT_REGEX)];

    const dateStr: string =
      event.start?.date ?? event.start?.dateTime?.split('T')[0] ?? '';

    for (const match of matches) {
      const flightNumber = match[1] + match[2];
      const key = `${flightNumber}::${dateStr}`;
      if (!seen.has(key) && dateStr) {
        seen.add(key);
        found.push({
          flightNumber,
          date: dateStr,
          eventTitle: event.summary ?? '',
          eventId: event.id,
        });
      }
    }
  }

  return found.sort((a, b) => a.date.localeCompare(b.date));
}

export async function scanCalendarForFlights(): Promise<CalendarFlight[]> {
  const accessToken = await getAccessToken();
  const events = await fetchCalendarEvents(accessToken);
  return parseFlightsFromEvents(events);
}
