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

  // 2. Save to Database
  try {
    await Database.put({
      pk: `USER#${userId}`,
      sk: `TRIP#${tripId}`,
      ...body,
      userId,
      createdAt: Date.now(),
    });

    console.log("Trip created:", tripId);
  } catch (e) {
    console.error("Database Put Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to save trip" }) };
  }

  // No more EventBridge Scheduler - the hourly cron will handle notifications

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
