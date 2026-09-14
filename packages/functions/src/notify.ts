import {SchedulerHandler} from "aws-lambda";
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
  formatCtaAlertsSummary,
  formatMtaAlertsSummary
} from "@flight-ai/core";
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
    const flightUTC = parseFlightTimeToUTC(trip.Item.date, trip.Item.originAirport || trip.Item.timezone);
    const arrivalPreference = profile.Item?.arrivalPreference || 2;

    // Estimate leave time (arrivalPreference hours before flight) as departure time for Google Maps traffic prediction
    const estimatedLeaveUTC = new Date(flightUTC.getTime() - (arrivalPreference * 60 * 60 * 1000));

    // 4. Calculate Travel Time (Multi-modal if transitEnabled)
    const transitEnabled = Boolean(profile.Item?.transitEnabled);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      payload.homeAddress,
      payload.airportCode,
      estimatedLeaveUTC,
      transitEnabled
    );

    console.log("Travel estimate calculated:", JSON.stringify(travelEstimate, null, 2));

    // Calculate final drive leave time
    const driveMinutes = Math.ceil(travelEstimate.drive.durationSeconds / 60);
    const driveLeaveUTC = calculateLeaveTime(flightUTC, driveMinutes, arrivalPreference);
    const driveLeaveFormatted = formatLeaveTime(driveLeaveUTC, trip.Item.originAirport || trip.Item.timezone);

    // Calculate transit leave time if available
    let transitLeaveFormatted: string | undefined;
    let transitAlertsSummary: string | undefined;

    if (travelEstimate.transit) {
      const transitMinutes = Math.ceil(travelEstimate.transit.durationSeconds / 60);
      const transitLeaveUTC = calculateLeaveTime(flightUTC, transitMinutes, arrivalPreference);
      transitLeaveFormatted = formatLeaveTime(transitLeaveUTC, trip.Item.originAirport || trip.Item.timezone);

      if (travelEstimate.ctaAlerts && travelEstimate.ctaAlerts.length > 0) {
        transitAlertsSummary = formatCtaAlertsSummary(
          travelEstimate.ctaAlerts,
          travelEstimate.stationInfo?.line || "CTA Transit"
        );
      } else if (travelEstimate.mtaAlerts && travelEstimate.mtaAlerts.length > 0) {
        transitAlertsSummary = formatMtaAlertsSummary(
          travelEstimate.mtaAlerts,
          travelEstimate.stationInfo?.line || "MTA Transit"
        );
      }
    }

    const transitAgency = travelEstimate.stationInfo?.agency || (travelEstimate.ctaAlerts ? "CTA" : travelEstimate.mtaAlerts ? "MTA" : "Public Transit");
    const transitLineName = travelEstimate.stationInfo?.line || (travelEstimate.transit?.transitLine ? `${travelEstimate.transit.transitLine} (${transitAgency})` : `${transitAgency} Public Transit`);

    // Build multi-modal message
    let message: string;
    if (travelEstimate.transit && transitLeaveFormatted) {
      message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\nOptions to arrive ${arrivalPreference}h early at ${payload.airportCode}:\n` +
        `🚗 Drive: ${travelEstimate.drive.durationText} (Leave by ${driveLeaveFormatted})\n` +
        `🚆 ${transitLineName}: ${travelEstimate.transit.durationText} (Leave by ${transitLeaveFormatted})\n`;
      if (transitAlertsSummary) {
        message += `\n${transitAlertsSummary}\n`;
      }
      if (travelEstimate.stationInfo?.fareDescription) {
        message += `Fare: ${travelEstimate.stationInfo.fareDescription}\n`;
      }
      message += `\nSafe travels!`;
    } else {
      message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\nExpected travel time from ${payload.homeAddress} to ${payload.airportCode} airport is ${travelEstimate.drive.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${driveLeaveFormatted}.\n\nSafe travels!`;
    }

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

    const emailHtml = `
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
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Trip Details</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${payload.homeAddress}</strong> to <strong>${payload.airportCode} airport</strong>
        </p>
        <p style="color: #4b5563; font-size: 14px; margin: 4px 0 0 0;">
          Target arrival: <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>
        </p>
      </div>

      <!-- Drive Option -->
      <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #15803d; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: #166534; font-size: 16px;">🚗 Drive (Live Traffic)</span>
          <span style="font-weight: 700; color: #15803d; font-size: 18px;">${travelEstimate.drive.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">Leave by:</p>
        <p style="color: #15803d; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${driveLeaveFormatted}
        </p>
      </div>

      ${travelEstimate.transit && transitLeaveFormatted ? `
      <!-- Public Transit Option -->
      <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #2563eb; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: #1e40af; font-size: 16px;">
            🚆 ${transitLineName}
          </span>
          <span style="font-weight: 700; color: #2563eb; font-size: 18px;">${travelEstimate.transit.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">Leave by:</p>
        <p style="color: #2563eb; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${transitLeaveFormatted}
        </p>
        ${travelEstimate.stationInfo?.fareDescription ? `
        <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">
          💳 Fare: ${travelEstimate.stationInfo.fareDescription}
        </p>` : ''}
      </div>

      ${transitAlertsSummary ? `
      <!-- Transit Alerts Banner -->
      <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #854d0e; font-size: 13px; margin: 0; font-weight: 600;">
          ${transitAlertsSummary}
        </p>
      </div>` : ''}
      ` : ''}
      
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">Safe travels! 🛫</p>
        <p style="color: #d1d5db; font-size: 12px; margin: 8px 0 0 0;">Powered by Make My Flight${transitAgency !== "Public Transit" ? ` & ${transitAgency}` : ''}</p>
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
        Subject: {Data: `⏰ Time to Leave for Flight ${trip.Item.flightNumber}!`},
        Body: {
          Text: {Data: message},
          Html: {Data: emailHtml},
        },
      },
    }));

    console.log("Email sent successfully!");


  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
