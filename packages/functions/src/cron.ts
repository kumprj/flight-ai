import { EventBridgeHandler } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { Resource } from "sst";

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
      const flightDate = new Date(item.date);
      const userId = item.pk.replace("USER#", "");

      // Get user profile for arrival preference
      const profile = await dynamodb.get({
        TableName: Resource.Table.name,
        Key: { pk: item.pk, sk: "PROFILE" },
      });

      const arrivalPreference = profile.Item?.arrivalPreference || 2; // Default 2 hours

      // Calculate notification window (assume max 2 hour travel + arrival preference)
      const notificationWindow = arrivalPreference + 2;
      const hoursUntilFlight = (flightDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      console.log(`Trip ${item.sk}: Flight in ${hoursUntilFlight.toFixed(2)} hours`);

      // Trigger notification if flight is within the notification window
      if (hoursUntilFlight > 0 && hoursUntilFlight <= notificationWindow) {
        console.log(`Triggering notification for ${item.flightNumber}`);

        await lambda.send(new InvokeCommand({
          FunctionName: process.env.WORKER_ARN!,
          InvocationType: "Event",
          Payload: JSON.stringify({
            tripId: item.sk,
            userId: userId,
            homeAddress: item.homeAddress,
            airportCode: item.airportCode,
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
