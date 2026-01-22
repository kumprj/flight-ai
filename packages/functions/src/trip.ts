import {SchedulerClient, CreateScheduleCommand} from "@aws-sdk/client-scheduler";
import {Trip, SchedulerPayload} from "@flight-ai/core/types";
import {Resource} from "sst";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2
} from "aws-lambda";
import {Database} from "@flight-ai/core/dynamodb";

const scheduler = new SchedulerClient({});

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
    return {statusCode: 401, body: "Unauthorized"};
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // 2. Save to Database
  try {
    await Database.put({
      pk: `USER#${userId}`, // Secure, readable PK
      sk: `TRIP#${tripId}`,
      ...body,
      userId, // Store the consistent ID
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error("Database Put Error:", e);
    return {statusCode: 500, body: JSON.stringify({error: "Failed to save trip"})};
  }

  // 3. Schedule Notification
  const flightTime = new Date(body.date).getTime();
  // Trigger 4 hours before flight
  const triggerTime = new Date(flightTime - (4 * 60 * 60 * 1000));
  const dateStr = triggerTime.toISOString().split('.')[0]; // Format for Scheduler

  const payload: SchedulerPayload = {
    tripId,
    userId, // Use the secure ID, not the one from the body
    homeAddress: body.homeAddress,
    airportCode: body.airportCode
  };

  try {
    await scheduler.send(new CreateScheduleCommand({
      // Unique name: notify-USERID-TRIPID
      Name: `notify-${userId}-${tripId.replace(/[^a-zA-Z0-9]/g, "")}`,
      ScheduleExpression: `at(${dateStr})`,
      Target: {
        Arn: process.env.WORKER_ARN,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input: JSON.stringify(payload),
      },
      FlexibleTimeWindow: {Mode: "OFF"}
    }));
  } catch (e) {
    console.error("Failed to schedule:", e);
    // We don't fail the request if scheduling fails, but we log it.
  }

  return {statusCode: 200, body: JSON.stringify({status: "created"})};
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
    return {statusCode: 200, body: JSON.stringify(trips)};
  } catch (e) {
    console.error("Database List Error:", e);
    return {statusCode: 500, body: "Database error"};
  }
};
