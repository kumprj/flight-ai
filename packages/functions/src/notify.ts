import {SchedulerHandler} from "aws-lambda";
import {SESClient, SendEmailCommand} from "@aws-sdk/client-ses";
import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocument} from "@aws-sdk/lib-dynamodb";
import {Resource} from "sst";
import {GoogleMaps} from "@flight-ai/core/maps";
import {SchedulerPayload} from "@flight-ai/core/types";
import {getAirportTimezone} from "@flight-ai/core/airports";
import twilio from "twilio";

const ses = new SESClient({});
const dynamodb = DynamoDBDocument.from(new DynamoDB({}));
const twilioClient = twilio(process.env.TWILIO_SID!, process.env.TWILIO_TOKEN!);

export const handler: SchedulerHandler = async (event) => {
  console.log("Worker triggered:", JSON.stringify(event, null, 2));
  const payload = event as unknown as SchedulerPayload;

  if (!payload.homeAddress || !payload.airportCode || !payload.tripId || !payload.userId) {
    console.error("Missing required fields in payload:", payload);
    return;
  }

  try {
    // Commenting real trip for now.
    const trip = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: {pk: `USER#${payload.userId}`, sk: payload.tripId},
    });
    // const trip = {
    //   Item: {
    //     flightNumber: "UA920",
    //     date: new Date().toISOString(),
    //   }
    // };

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

// 3. Resolve airport timezone and convert naive date string to true UTC
    const timezone = getAirportTimezone(trip.Item.originAirport) || trip.Item.timezone || 'America/Chicago';

    // trip.date is a naive local time string — convert to true UTC via timezone offset
    const naiveDateStr = trip.Item.date.split('+')[0].split('Z')[0];
    const naiveAsUTC = new Date(naiveDateStr + 'Z');
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const tzDateParsed = new Date(tzFormatter.format(naiveAsUTC).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
    const utcDateParsed = new Date(utcFormatter.format(naiveAsUTC).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
    const offsetMs = tzDateParsed.getTime() - utcDateParsed.getTime();
    const flightUTC = new Date(naiveAsUTC.getTime() - offsetMs);

    const arrivalPreference = profile.Item?.arrivalPreference || 2;

    // Estimate leave time (arrivalPreference hours before flight) as departure time for Google Maps traffic prediction
    const estimatedLeaveUTC = new Date(flightUTC.getTime() - (arrivalPreference * 60 * 60 * 1000));

// 4. Calculate Travel Time using predicted traffic at estimated leave time
    const travelInfo = await GoogleMaps.getTravelTime(
        payload.homeAddress,
        payload.airportCode,
        estimatedLeaveUTC
    );

    console.log("Travel time calculated:", travelInfo);

// Calculate final leave time
    const travelTimeMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const totalMinutesNeeded = travelTimeMinutes + (arrivalPreference * 60);
    const leaveTimeUTC = new Date(flightUTC.getTime() - (totalMinutesNeeded * 60 * 1000));

    const message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\nExpected travel time from ${payload.homeAddress} to ${payload.airportCode} airport is ${travelInfo.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTimeUTC.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone
    })}.\n\nSafe travels!`;

// 4. Send SMS
    if (profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
      console.log("Sending SMS to:", profile.Item.phoneNumber);
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_FROM_NUMBER!,
        to: profile.Item.phoneNumber,
      });
      console.log("SMS sent successfully");
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
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flight Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #15803d 0%, #166534 100%); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">✈️</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">Flight Alert</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.Item.flightNumber}</p>
    </div>
    
    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="margin-bottom: 24px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Travel Time</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${payload.homeAddress}</strong> to <strong>${payload.airportCode} airport</strong>
        </p>
        <p style="color: #15803d; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelInfo.durationText}</p>
      </div>
      
      <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; padding: 24px; border-left: 4px solid #15803d;">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>, you should leave at:
        </p>
        <p style="color: #15803d; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTimeUTC.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: timezone
            })}
        </p>
      </div>
      
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">Safe travels! 🛫</p>
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

    console.log("Email sent successfully!");


  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
