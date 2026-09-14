import {Handler} from "aws-lambda";
import {SESClient, SendEmailCommand} from "@aws-sdk/client-ses";
import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocument} from "@aws-sdk/lib-dynamodb";
import {Resource} from "sst";
import {GoogleMaps} from "@flight-ai/core/maps";
import {
  SchedulerPayload,
  parseFlightTimeToUTC,
  calculateLeaveTime,
  formatLeaveTime,
  formatFlightTimeOnly,
  resolveTimezone,
} from "@flight-ai/core";
import twilio from "twilio";

const ses = new SESClient({});
const dynamodb = DynamoDBDocument.from(new DynamoDB({}));
const twilioClient = twilio(process.env.TWILIO_SID!, process.env.TWILIO_TOKEN!);

export const handler: Handler = async (event) => {
  console.log("Worker triggered:", JSON.stringify(event, null, 2));
  const payload = event as unknown as SchedulerPayload;

  if (!payload.homeAddress || !payload.airportCode || !payload.tripId || !payload.userId) {
    console.error("Missing required fields in payload:", payload);
    return;
  }

  try {
    const trip = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: {pk: `USER#${payload.userId}`, sk: payload.tripId},
    });

    console.log("Trip data:", JSON.stringify(trip.Item, null, 2));

    if (!trip.Item) {
      console.error("Trip not found");
      throw new Error("Trip not found");
    }

    // 1. Get user profile for email/phone
    const profile = await dynamodb.get({
      TableName: Resource.Table.name,
      Key: {pk: `USER#${payload.userId}`, sk: "PROFILE"},
    });

    console.log("User profile:", JSON.stringify(profile.Item, null, 2));

    const timezone = resolveTimezone(trip.Item.originAirport || trip.Item.timezone);
    const recipientEmail = profile.Item?.email || "rkump24@gmail.com";
    const senderEmail = "rkump24@gmail.com";

    // 2. Handle CANCELED Flight Alert
    const isCanceled = payload.isCanceled || trip.Item.status === 'Canceled';
    if (isCanceled) {
      console.log(`Sending cancellation alert for ${trip.Item.flightNumber}`);
      const cancelMessage = `⚠️ FLIGHT CANCELED: Flight ${trip.Item.flightNumber} from ${payload.airportCode} has been canceled by the airline.\n\nPlease check with your airline for rebooking options before heading to the airport.`;

      const cancelEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flight CANCELED</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">Flight Canceled</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.Item.flightNumber}</p>
    </div>
    
    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <p style="color: #991b1b; font-size: 16px; font-weight: 600; line-height: 1.6;">
        Your flight ${trip.Item.flightNumber} from ${payload.airportCode} has been canceled by the airline.
      </p>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
        Do not head to the airport. Please contact your airline directly to discuss rebooking or refund options.
      </p>
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">Make My Flight Alert</p>
      </div>
    </div>
  </div>
</body>
</html>
      `;

      if (profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
        await twilioClient.messages.create({
          body: cancelMessage,
          from: process.env.TWILIO_FROM_NUMBER!,
          to: profile.Item.phoneNumber,
        });
      }

      await ses.send(new SendEmailCommand({
        Source: senderEmail,
        Destination: {ToAddresses: [recipientEmail]},
        Message: {
          Subject: {Data: `❌ URGENT: Flight ${trip.Item.flightNumber} CANCELED!`},
          Body: {
            Text: {Data: cancelMessage},
            Html: {Data: cancelEmailHtml},
          },
        },
      }));

      return;
    }

    // 3. Resolve effective departure time (delayed time takes priority if set)
    const isDelayed = Boolean(
      payload.isDelayed ||
      (trip.Item.revisedDate && trip.Item.revisedDate !== trip.Item.date) ||
      trip.Item.status === 'Delayed'
    );
    const delayMinutes = payload.delayMinutes || trip.Item.delayMinutes || 0;
    const effectiveDateStr = trip.Item.revisedDate || trip.Item.date;

    const flightUTC = parseFlightTimeToUTC(effectiveDateStr, timezone);
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
    const leaveTimeUTC = calculateLeaveTime(flightUTC, travelTimeMinutes, arrivalPreference);
    const leaveTimeFormatted = formatLeaveTime(leaveTimeUTC, timezone);

    const schedDepartureFormatted = formatFlightTimeOnly(trip.Item.date, trip.Item.originAirport);
    const effectiveDepartureFormatted = formatFlightTimeOnly(effectiveDateStr, trip.Item.originAirport);

    // 5. Build Message
    let message: string;
    let subject: string;

    if (isDelayed) {
      subject = `⚠️ Flight DELAYED (+${delayMinutes}m): Time to Leave for Flight ${trip.Item.flightNumber}!`;
      message = `✈️ Flight DELAY Alert for ${trip.Item.flightNumber}!\n\n` +
        `Your flight is delayed by ${delayMinutes} minutes.\n` +
        `• Original: ${schedDepartureFormatted}\n` +
        `• New Departure: ${effectiveDepartureFormatted}\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} is ${travelInfo.durationText}.\n\n` +
        `To arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your new departure time, leave at ${leaveTimeFormatted}.\n\n` +
        `Safe travels!`;
    } else {
      subject = `⏰ Time to Leave for Flight ${trip.Item.flightNumber}!`;
      message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} airport is ${travelInfo.durationText}.\n\n` +
        `In order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTimeFormatted}.\n\n` +
        `Safe travels!`;
    }

    // 6. Send SMS
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

    // 7. Send Email
    console.log("Sending email from:", senderEmail, "to:", recipientEmail);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isDelayed ? 'Flight Delayed Alert' : 'Flight Alert'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: ${isDelayed ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)'}; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">${isDelayed ? '⚠️' : '✈️'}</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">${isDelayed ? 'Flight Delayed' : 'Flight Alert'}</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.Item.flightNumber}</p>
    </div>
    
    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      ${isDelayed ? `
      <!-- Delay Notice Banner -->
      <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #92400e; font-size: 15px; font-weight: 700; margin: 0 0 6px 0;">
          ⚠️ Departure Delayed (+${delayMinutes} mins)
        </p>
        <p style="color: #78350f; font-size: 14px; margin: 0;">
          Scheduled: <strong>${schedDepartureFormatted}</strong> &nbsp;→&nbsp; New Departure: <strong>${effectiveDepartureFormatted}</strong>
        </p>
      </div>` : ''}

      <div style="margin-bottom: 24px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Travel Time</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${payload.homeAddress}</strong> to <strong>${payload.airportCode} airport</strong>
        </p>
        <p style="color: ${isDelayed ? '#d97706' : '#15803d'}; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelInfo.durationText}</p>
      </div>
      
      <div style="background: ${isDelayed ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'}; border-radius: 12px; padding: 24px; border-left: 4px solid ${isDelayed ? '#d97706' : '#15803d'};">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong> for your ${isDelayed ? 'delayed ' : ''}flight, you should leave at:
        </p>
        <p style="color: ${isDelayed ? '#b45309' : '#15803d'}; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTimeFormatted}
        </p>
      </div>
      
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">Safe travels! 🛫</p>
        <p style="color: #d1d5db; font-size: 12px; margin: 8px 0 0 0;">Powered by Make My Flight</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: {ToAddresses: [recipientEmail]},
      Message: {
        Subject: {Data: subject},
        Body: {
          Text: {Data: message},
          Html: {Data: emailHtml},
        },
      },
    }));

    console.log("Notification email sent successfully!");

  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
