import { Trip, SchedulerPayload } from "@flight-ai/core/types";
import { Resource } from "sst";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2
} from "aws-lambda";
import { Database } from "@flight-ai/core/dynamodb";
import {SESClient, SendEmailCommand} from "@aws-sdk/client-ses";
import {GoogleMaps} from "@flight-ai/core/maps";

const ses = new SESClient({});

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
  const timezone = getAirportTimezone(body.destinationAirport);

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

export const update: APIGatewayProxyHandlerV2 = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the destination airport
  const timezone = getAirportTimezone(body.destinationAirport);

  try {
    await Database.put({
      pk: `USER#${userId}`,
      sk: `TRIP#${tripId}`,
      ...body,
      timezone,
      userId,
      createdAt: body.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    console.log("Trip updated:", tripId);
  } catch (e) {
    console.error("Database Update Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to update trip" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "updated",
      message: "Trip updated successfully."
    })
  };
};

export const testNotify: APIGatewayProxyHandlerV2 = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = body.tripId;

  if (!tripId) {
    return { statusCode: 400, body: JSON.stringify({ error: "tripId is required" }) };
  }

  try {
    // Get trip data
    const trip = await Database.get(userId, tripId);

    if (!trip) {
      return { statusCode: 404, body: JSON.stringify({ error: "Trip not found" }) };
    }

    // Get user profile
    const profile = await Database.get(userId, "PROFILE");

    // Calculate travel time
    const travelInfo = await GoogleMaps.getTravelTime(
      trip.homeAddress,
      trip.originAirport,
      new Date()
    );

    // Calculate when to leave based on arrival preference
    const arrivalPreference = profile?.arrivalPreference || 2;
    const travelTimeMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const totalMinutesNeeded = travelTimeMinutes + (arrivalPreference * 60);
    const leaveTime = new Date(new Date(trip.date).getTime() - (totalMinutesNeeded * 60 * 1000));

    const message = `✈️ TEST Flight Alert for ${trip.flightNumber}!\n\nCurrent travel time from ${trip.homeAddress} to ${trip.originAirport} is ${travelInfo.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    })}.\n\nThis is a test notification. Safe travels!`;

    // Send email
    const recipientEmail = profile?.email || "rkump24@gmail.com";
    const senderEmail = "rkump24@gmail.com";

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: {ToAddresses: [recipientEmail]},
      Message: {
        Subject: {Data: `🧪 TEST: Time to Leave for Flight ${trip.flightNumber}!`},
        Body: {
          Text: {Data: message},
          Html: {
            Data: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TEST Flight Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">🧪</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">TEST Flight Alert</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.flightNumber}</p>
    </div>

    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="margin-bottom: 24px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Travel Time</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${trip.homeAddress}</strong> to <strong>${trip.originAirport}</strong>
        </p>
        <p style="color: #15803d; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelInfo.durationText}</p>
      </div>

      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; border-left: 4px solid #f59e0b;">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>, you should leave at:
        </p>
        <p style="color: #d97706; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Chicago'
          })}
        </p>
      </div>

      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">This is a test notification 🧪</p>
        <p style="color: #d1d5db; font-size: 12px; margin: 8px 0 0 0;">Powered by Flight AI</p>
      </div>
    </div>
  </div>
</body>
</html>
          `
          }
        }
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        message: "Test notification sent successfully"
      })
    };
  } catch (error) {
    console.error("Test notification failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to send test notification" }) };
  }
};

export const getTravelTime: APIGatewayProxyHandlerV2 = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const { homeAddress, airportCode } = body;

  if (!homeAddress || !airportCode) {
    return { statusCode: 400, body: JSON.stringify({ error: "homeAddress and airportCode are required" }) };
  }

  try {
    const travelInfo = await GoogleMaps.getTravelTime(
      homeAddress,
      airportCode,
      new Date()
    );

    return {
      statusCode: 200,
      body: JSON.stringify(travelInfo)
    };
  } catch (error) {
    console.error("Travel time calculation failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to calculate travel time" }) };
  }
};

export const remove: APIGatewayProxyHandlerV2 = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = body.tripId;

  if (!tripId) {
    return { statusCode: 400, body: JSON.stringify({ error: "tripId is required" }) };
  }

  try {
    await Database.delete(userId, tripId);

    console.log("Trip deleted:", tripId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "deleted",
        message: "Trip deleted successfully."
      })
    };
  } catch (e) {
    console.error("Database Delete Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to delete trip" }) };
  }
};
