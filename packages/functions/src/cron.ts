import { EventBridgeHandler } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { Resource } from "sst";
import { getAirportTimezone } from "@flight-ai/core/airports";

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
      const userId = item.pk.replace("USER#", "");

      // Get user profile for arrival preference
      const profile = await dynamodb.get({
        TableName: Resource.Table.name,
        Key: { pk: item.pk, sk: "PROFILE" },
      });

      const arrivalPreference = profile.Item?.arrivalPreference || 2;

      // Convert naive local date string to true UTC using the origin airport's timezone
      const timezone = getAirportTimezone(item.originAirport) || item.timezone || 'America/Chicago';
      const naiveDateStr = (item.date as string).split('+')[0].split('Z')[0];
      const naiveAsUTC = new Date(naiveDateStr + 'Z');
      const tzFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const utcFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const tzParsed = new Date(tzFormatter.format(naiveAsUTC).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
      const utcParsed = new Date(utcFormatter.format(naiveAsUTC).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
      const flightDate = new Date(naiveAsUTC.getTime() - (tzParsed.getTime() - utcParsed.getTime()));

      const hoursUntilFlight = (flightDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      console.log(`Trip ${item.sk}: Flight in ${hoursUntilFlight.toFixed(2)} hours`);

      const notify12h = hoursUntilFlight > 11 && hoursUntilFlight <= 12;
      const notifyPreference = hoursUntilFlight > (arrivalPreference + 1) && hoursUntilFlight <= (arrivalPreference + 2);

      if (notify12h || notifyPreference) {
        const reason = notify12h ? '12-hour advance notice' : `${arrivalPreference + 2}-hour departure window`;
        console.log(`Triggering notification for ${item.flightNumber} (${reason})`);

        await lambda.send(new InvokeCommand({
          FunctionName: process.env.WORKER_ARN!,
          InvocationType: "Event",
          Payload: JSON.stringify({
            tripId: item.sk,
            userId: userId,
            homeAddress: item.homeAddress,
            airportCode: item.originAirport,
          }),
        }));

        console.log(`Notification triggered for ${item.flightNumber}`);
      } else if (hoursUntilFlight <= 0) {
        console.log(`Flight ${item.flightNumber} has already departed`);
      } else {
        console.log(`Flight ${item.flightNumber} is too far away (${hoursUntilFlight.toFixed(2)} hours)`);
      }
    }

    console.log("Cron job completed successfully");
  } catch (error) {
    console.error("Cron job failed:", error);
    throw error;
  }
};
