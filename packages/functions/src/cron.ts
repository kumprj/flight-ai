import { EventBridgeHandler } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { Resource } from "sst";
import {
  parseFlightTimeToUTC,
  calculateHoursUntilFlight,
  Flights,
} from "@flight-ai/core";

const dynamodb = DynamoDBDocument.from(new DynamoDB({}));
const lambda = new LambdaClient({});

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  console.log("Cron job triggered:", new Date().toISOString());

  try {
    // Scan for all trips
    const result = await dynamodb.scan({
      TableName: Resource.Table.name,
      FilterExpression: "begins_with(sk, :tripPrefix)",
      ExpressionAttributeValues: {
        ":tripPrefix": "TRIP#",
      },
    });

    console.log(`Found ${result.Items?.length || 0} trips`);

    if (!result.Items || result.Items.length === 0) {
      console.log("No trips to process");
      return;
    }

    const now = new Date();

    for (const item of result.Items) {
      try {
        const userId = item.pk.replace("USER#", "");

        // 1. Get user profile for arrival preference
        const profile = await dynamodb.get({
          TableName: Resource.Table.name,
          Key: { pk: item.pk, sk: "PROFILE" },
        });

        const arrivalPreference = profile.Item?.arrivalPreference || 2;

        // 2. Initial flight time calculation
        let effectiveDateStr = item.revisedDate || item.date;
        let flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);
        let hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);

        console.log(`Trip ${item.sk}: Initial flight in ${hoursUntilFlight.toFixed(2)} hours`);

        // 3. Check live status if flight is within 24 hours (and not departed)
        // Rate-limit checks to at most once every 30 minutes per active trip
        const timeSinceLastCheck = item.lastStatusCheck ? (now.getTime() - item.lastStatusCheck) : Infinity;
        const shouldCheckStatus = hoursUntilFlight > 0 && hoursUntilFlight <= 24 && timeSinceLastCheck >= 30 * 60 * 1000;

        if (shouldCheckStatus) {
          console.log(`Checking live flight status for ${item.flightNumber} on ${item.date}...`);
          const flightStatus = await Flights.checkStatus(item.flightNumber, item.date);

          if (flightStatus) {
            console.log(`Live status for ${item.flightNumber}:`, JSON.stringify(flightStatus));

            // Case A: Canceled flight
            if (flightStatus.status === 'Canceled') {
              console.warn(`Flight ${item.flightNumber} has been CANCELED`);
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "Canceled",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });

              // Trigger immediate cancellation alert if not previously alerted
              if (item.status !== 'Canceled') {
                await lambda.send(new InvokeCommand({
                  FunctionName: process.env.WORKER_ARN!,
                  InvocationType: "Event",
                  Payload: JSON.stringify({
                    tripId: item.sk,
                    userId: userId,
                    homeAddress: item.homeAddress,
                    airportCode: item.originAirport,
                    isCanceled: true,
                  }),
                }));
              }
              continue; // Skip normal leave notification
            }

            // Case B: Delayed flight
            if (flightStatus.revisedDepartureTime && flightStatus.revisedDepartureTime !== item.date) {
              const delayMins = flightStatus.delayMinutes || 0;
              console.log(`Flight ${item.flightNumber} is delayed by ${delayMins}m. New departure: ${flightStatus.revisedDepartureTime}`);

              effectiveDateStr = flightStatus.revisedDepartureTime;
              flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);
              hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);

              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET revisedDate = :revDate, delayMinutes = :delayMins, #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":revDate": flightStatus.revisedDepartureTime,
                  ":delayMins": delayMins,
                  ":status": "Delayed",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });

              item.revisedDate = flightStatus.revisedDepartureTime;
              item.delayMinutes = delayMins;
              item.status = "Delayed";
            } else {
              // Case C: On time / scheduled
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": flightStatus.status || "Scheduled",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });
            }
          }
        }

        console.log(`Trip ${item.sk}: Effective flight in ${hoursUntilFlight.toFixed(2)} hours`);

        // 4. Notification window evaluation based on effective departure time
        const notify12h = hoursUntilFlight > 11 && hoursUntilFlight <= 12;
        const notifyPreference = hoursUntilFlight > (arrivalPreference + 1) && hoursUntilFlight <= (arrivalPreference + 2);

        if (notify12h || notifyPreference) {
          const reason = notify12h ? '12-hour advance notice' : `${arrivalPreference + 2}-hour departure window`;
          const isDelayed = item.status === 'Delayed' || Boolean(item.revisedDate);
          console.log(`Triggering notification for ${item.flightNumber} (${reason}, Delayed: ${isDelayed})`);

          await lambda.send(new InvokeCommand({
            FunctionName: process.env.WORKER_ARN!,
            InvocationType: "Event",
            Payload: JSON.stringify({
              tripId: item.sk,
              userId: userId,
              homeAddress: item.homeAddress,
              airportCode: item.originAirport,
              isDelayed,
              delayMinutes: item.delayMinutes || 0,
            }),
          }));

          console.log(`Notification triggered for ${item.flightNumber}`);
        } else if (hoursUntilFlight <= 0) {
          console.log(`Flight ${item.flightNumber} has already departed`);
        } else {
          console.log(`Flight ${item.flightNumber} is outside notification window (${hoursUntilFlight.toFixed(2)} hours)`);
        }
      } catch (tripError) {
        console.error(`Failed to process trip ${item.sk}:`, tripError);
      }
    }

    console.log("Cron job completed successfully");
  } catch (error) {
    console.error("Cron job failed:", error);
    throw error;
  }
};
