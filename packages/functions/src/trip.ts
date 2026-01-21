import { APIGatewayProxyHandler } from "aws-lambda";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { Database } from "@flight-ai/core";
import { Trip, SchedulerPayload } from "@flight-ai/core/types";
import { Resource } from "sst";

const scheduler = new SchedulerClient({});

export const create: APIGatewayProxyHandler = async (event) => {
  const body = JSON.parse(event.body || "{}") as Trip;

  const tripId = `${body.date}#${body.flightNumber}`;

  // 1. Save to DB
  await Database.put({
    pk: `USER#${body.userId}`,
    sk: `TRIP#${tripId}`,
    ...body,
    createdAt: Date.now(),
  });

  // 2. Schedule
  const flightTime = new Date(body.date).getTime();
  const triggerTime = new Date(flightTime - (4 * 60 * 60 * 1000));

  // We need to format the date without milliseconds for the At() expression
  const dateStr = triggerTime.toISOString().split('.')[0];

  const payload: SchedulerPayload = {
    tripId,
    userId: body.userId,
    homeAddress: body.homeAddress,
    airportCode: body.airportCode
  };

  try {
    await scheduler.send(new CreateScheduleCommand({
      Name: `notify-${body.userId.replace(/[^a-zA-Z0-9]/g, "")}-${tripId.replace(/[^a-zA-Z0-9]/g, "")}`,
      ScheduleExpression: `at(${dateStr})`,
      Target: {
        Arn: process.env.WORKER_ARN,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input: JSON.stringify(payload),
      },
      FlexibleTimeWindow: { Mode: "OFF" }
    }));
  } catch (e) {
    console.error("Failed to schedule:", e);
    // Depending on logic, you might want to return 500 or just log it
  }

  return { statusCode: 200, body: JSON.stringify({ status: "created" }) };
};
