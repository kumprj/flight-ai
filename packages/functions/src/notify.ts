import {SchedulerHandler} from "aws-lambda";
import {SESClient, SendEmailCommand} from "@aws-sdk/client-ses";
import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocument} from "@aws-sdk/lib-dynamodb";
import {Resource} from "sst";
import {GoogleMaps} from "@flight-ai/core/maps";
import {SchedulerPayload} from "@flight-ai/core/types";

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
    // Commenting real trip for now.
    // const trip = await dynamodb.get({
    //   TableName: Resource.Table.name,
    //   Key: { pk: `USER#${payload.userId}`, sk: payload.tripId },
    // });
    const trip = {
      Item: {
        flightNumber: "UA920",
        date: new Date().toISOString(),
      }
    };

    console.log("Using mock trip data for testing");


    console.log("Trip data:", JSON.stringify(trip.Item, null, 2));

    if (!trip.Item) {
      console.error("Trip not found");
      throw new Error("Trip not found");
    }

    // 2. Get user profile for email/phone
    const profile = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: {pk: `USER#${payload.userId}`, sk: "PROFILE"},
    });

    console.log("User profile:", JSON.stringify(profile.Item, null, 2));

// 3. Calculate Travel Time
    const travelInfo = await GoogleMaps.getTravelTime(
        payload.homeAddress,
        payload.airportCode,
        new Date()
    );

    console.log("Travel time calculated:", travelInfo);

// Calculate when to leave based on arrival preference
    const arrivalPreference = profile.Item?.arrivalPreference || 2; // Default 2 hours
    const travelTimeMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const totalMinutesNeeded = travelTimeMinutes + (arrivalPreference * 60);
    const leaveTime = new Date(new Date(trip.Item.date).getTime() - (totalMinutesNeeded * 60 * 1000));

    const message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\nCurrent travel time from ${payload.homeAddress} to ${payload.airportCode} is ${travelInfo.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    })}.\n\nSafe travels!`;

// 4. Send SMS (disabled for testing)
    if (profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
      console.log("SMS would be sent to:", profile.Item.phoneNumber);
      console.log("SMS message:", message);
      // await Messenger.sendSms(profile.Item.phoneNumber, message);
    } else {
      console.log("No verified phone number, skipping SMS");
    }

// 5. Send Email
    const recipientEmail = profile.Item?.email || "rkump24@gmail.com";
    const senderEmail = "rkump24@gmail.com";

    console.log("Sending email from:", senderEmail, "to:", recipientEmail);

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: {ToAddresses: [recipientEmail]},
      Message: {
        Subject: {Data: `⏰ Time to Leave for Flight ${trip.Item.flightNumber}!`},
        Body: {
          Text: {Data: message},
          Html: {
            Data: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">✈️ Flight Alert for ${trip.Item.flightNumber}!</h2>
            
            <p style="font-size: 16px; line-height: 1.6;">
              Current travel time from <strong>${payload.homeAddress}</strong> to 
              <strong>${payload.airportCode}</strong> is <strong>${travelInfo.durationText}</strong>.
            </p>
            
            <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; font-size: 18px;">
                To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>, 
                you should leave at:
              </p>
              <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #2563eb;">
                ${leaveTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Chicago'
            })}
              </p>
            </div>
            
            <p style="color: #6b7280;">Safe travels! 🛫</p>
          </div>
        `
          }
        }
      }
    }));

    console.log("Email sent successfully!");


  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
