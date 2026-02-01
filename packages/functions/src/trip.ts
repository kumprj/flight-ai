import { Trip, SchedulerPayload } from "@flight-ai/core/types";
import { Resource } from "sst";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2
} from "aws-lambda";
import { Database } from "@flight-ai/core/dynamodb";

/**
 * Helper to generate a consistent User ID from the email claim.
 * e.g., "rkump24@gmail.com" -> "rkump24_gmail_com"
 */
const getUserIdFromClaims = (claims: any): string | null => {
  if (!claims || !claims.email) return null;
  return (claims.email as string).replace(/[@.]/g, "_");
};

/**
 * Get timezone for airport code
 */
const getAirportTimezone = (airportCode: string): string => {
  const timezones: Record<string, string> = {
    // US Timezones
    'JFK': 'America/New_York', 'LGA': 'America/New_York', 'EWR': 'America/New_York',
    'ORD': 'America/Chicago', 'MDW': 'America/Chicago',
    'LAX': 'America/Los_Angeles', 'SFO': 'America/Los_Angeles', 'SAN': 'America/Los_Angeles',
    'DEN': 'America/Denver', 'PHX': 'America/Phoenix',
    'ATL': 'America/New_York', 'DFW': 'America/Chicago', 'IAH': 'America/Chicago',
    'MIA': 'America/New_York', 'MCO': 'America/New_York', 'BOS': 'America/New_York',
    'SEA': 'America/Los_Angeles', 'LAS': 'America/Los_Angeles', 'MSP': 'America/Chicago',
    'DTW': 'America/New_York', 'PHL': 'America/New_York', 'CLT': 'America/New_York',
    // Add more as needed
  };

  return timezones[airportCode.toUpperCase()] || 'America/Chicago'; // Default fallback
};

export const create: APIGatewayProxyHandlerV2 = async (event) => {
  // 1. Get User ID from the valid Token
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the destination airport
  const timezone = getAirportTimezone(body.airportCode);

  // 2. Save to Database with timezone
  try {
    await Database.put({
      pk: `USER#${userId}`,
      sk: `TRIP#${tripId}`,
      ...body,
      timezone, // Add timezone to the trip
      userId,
      createdAt: Date.now(),
    });

    console.log("Trip created:", tripId, "Timezone:", timezone);
  } catch (e) {
    console.error("Database Put Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to save trip" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "created",
      message: "Trip created successfully. You'll be notified when it's time to leave."
    })
  };
};

export const list: APIGatewayProxyHandlerV2 = async (event) => {
  const authorizer = event.requestContext.authorizer;
  const claims = (authorizer as any)?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: No valid email claim found");
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const trips = await Database.listTrips(userId);
    return { statusCode: 200, body: JSON.stringify(trips) };
  } catch (e) {
    console.error("Database List Error:", e);
    return { statusCode: 500, body: "Database error" };
  }
};
