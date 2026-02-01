import { SchedulerHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { GoogleMaps } from "@flight-ai/core/maps";
import { SchedulerPayload } from "@flight-ai/core/types";

const ses = new SESClient({});
const dynamodb = DynamoDBDocument.from(new DynamoDB({}));

export const handler: SchedulerHandler = async (event) => {
  console.log("Worker triggered:", JSON.stringify(event, null, 2));
  const payload = event as unknown as SchedulerPayload;

  if (!payload.homeAddress || !payload.airportCode || !payload.tripId || !payload.userId) {
    console.error("Missing required fields in payload:", payload);
    return;
  }

  try {
    // 1. Get trip details from DynamoDB
    const trip = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: { pk: `USER#${payload.userId}`, sk: payload.tripId },
    });

    console.log("Trip data:", JSON.stringify(trip.Item, null, 2));

    if (!trip.Item) {
      console.error("Trip not found");
      throw new Error("Trip not found");
    }

    // 2. Get user profile for email/phone
    const profile = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: { pk: `USER#${payload.userId}`, sk: "PROFILE" },
    });

    console.log("User profile:", JSON.stringify(profile.Item, null, 2));

    // 3. Calculate Travel Time
    const travelInfo = await GoogleMaps.getTravelTime(
        payload.homeAddress,
        payload.airportCode,
        new Date()
    );

    console.log("Travel time calculated:", travelInfo);

    const message = `✈️ Flight Alert!\n\nFlight: ${trip.Item.flightNumber}\nTraffic to ${payload.airportCode} is currently ${travelInfo.durationText}.\n\nSafe travels!`;

    // 4. Send SMS (disabled for testing)
    if (profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
      console.log("SMS would be sent to:", profile.Item.phoneNumber);
      console.log("SMS message:", message);
      // await Messenger.sendSms(profile.Item.phoneNumber, message);
    } else {
      console.log("No verified phone number, skipping SMS");
    }

    // 5. Send Email
    const recipientEmail = profile.Item?.email || "rkump24@gmail.com"; // Fallback for testing
    const senderEmail = "rkump24@gmail.com"; // Must be verified in SES

    console.log("Sending email from:", senderEmail, "to:", recipientEmail);

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: `Flight Alert: Time to Leave for ${trip.Item.flightNumber}!` },
        Body: {
          Text: { Data: message }
        }
      }
    }));

    console.log("Email sent successfully!");

  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
