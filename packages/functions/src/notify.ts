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
  formatCtaAlertsSummary,
  formatMtaAlertsSummary,
  formatBartAlertsSummary
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

      if (profile.Item?.smsEnabled && profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
        await twilioClient.messages.create({
          body: cancelMessage,
          from: process.env.TWILIO_FROM_NUMBER!,
          to: profile.Item.phoneNumber,
        });
      }

      if (profile.Item?.emailEnabled !== false) {
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
    const transitEnabled = Boolean(profile.Item?.transitEnabled);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      payload.homeAddress,
      payload.airportCode,
      estimatedLeaveUTC,
      transitEnabled
    );

    console.log("Travel time calculated:", travelEstimate);

    // Calculate final leave time (drive)
    const travelTimeMinutes = Math.ceil(travelEstimate.drive.durationSeconds / 60);
    const leaveTimeUTC = calculateLeaveTime(flightUTC, travelTimeMinutes, arrivalPreference);
    const driveLeaveFormatted = formatLeaveTime(leaveTimeUTC, timezone);
    const leaveTimeFormatted = driveLeaveFormatted;

    let transitLeaveFormatted: string | undefined;
    let transitAlertsSummary: string | undefined;

    if (travelEstimate.transit) {
      const transitMinutes = Math.ceil(travelEstimate.transit.durationSeconds / 60);
      const transitLeaveUTC = calculateLeaveTime(flightUTC, transitMinutes, arrivalPreference);
      transitLeaveFormatted = formatLeaveTime(transitLeaveUTC, timezone);

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
      } else if (travelEstimate.bartAlerts && travelEstimate.bartAlerts.length > 0) {
        transitAlertsSummary = formatBartAlertsSummary(
          travelEstimate.bartAlerts,
          travelEstimate.stationInfo?.line || "BART"
        );
      }
    }

    const transitAgency = travelEstimate.stationInfo?.agency || (travelEstimate.ctaAlerts ? "CTA" : travelEstimate.mtaAlerts ? "MTA" : travelEstimate.bartAlerts ? "BART" : "Public Transit");
    const transitLineName = travelEstimate.stationInfo?.line || (travelEstimate.transit?.transitLine ? `${travelEstimate.transit.transitLine} (${transitAgency})` : `${transitAgency} Public Transit`);

    const schedDepartureFormatted = formatFlightTimeOnly(trip.Item.date, trip.Item.originAirport);
    const effectiveDepartureFormatted = formatFlightTimeOnly(effectiveDateStr, trip.Item.originAirport);

    // 5. Build Message
    let message: string;
    let subject: string;

    const isUpdate = Boolean(payload.isUpdate);

    if (isUpdate && !isDelayed) {
      // Back on schedule — delay removed
      subject = `✅ UPDATE: Flight ${trip.Item.flightNumber} Back on Schedule!`;
      message = `✈️ Good News for ${trip.Item.flightNumber}!\n\n` +
        `Your flight is now back on its original schedule.\n` +
        `• Departure: ${schedDepartureFormatted}\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} is ${travelEstimate.drive.durationText}.\n\n` +
        `To arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early, leave at ${leaveTimeFormatted}.\n\n` +
        `Safe travels!`;
    } else if (isUpdate && isDelayed) {
      // Delay increased/changed — updated leave time
      subject = `⏰ UPDATE: Flight ${trip.Item.flightNumber} Delay Changed (+${delayMinutes}m)`;
      message = `⏰ UPDATED Leave Time for ${trip.Item.flightNumber}!\n\n` +
        `Your flight delay has changed to ${delayMinutes} minutes.\n` +
        `• Original: ${schedDepartureFormatted}\n` +
        `• New Departure: ${effectiveDepartureFormatted}\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} is ${travelEstimate.drive.durationText}.\n\n` +
        `Updated leave time: ${leaveTimeFormatted}\n\n` +
        `Safe travels!`;
    } else if (isDelayed) {
      subject = `⚠️ Flight DELAYED (+${delayMinutes}m): Time to Leave for Flight ${trip.Item.flightNumber}!`;
      message = `✈️ Flight DELAY Alert for ${trip.Item.flightNumber}!\n\n` +
        `Your flight is delayed by ${delayMinutes} minutes.\n` +
        `• Original: ${schedDepartureFormatted}\n` +
        `• New Departure: ${effectiveDepartureFormatted}\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} is ${travelEstimate.drive.durationText}.\n\n` +
        `To arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your new departure time, leave at ${leaveTimeFormatted}.\n\n` +
        `Safe travels!`;
    } else {
      subject = `⏰ Time to Leave for Flight ${trip.Item.flightNumber}!`;
      message = `✈️ Flight Alert for ${trip.Item.flightNumber}!\n\n` +
        `Expected travel time from ${payload.homeAddress} to ${payload.airportCode} airport is ${travelEstimate.drive.durationText}.\n\n` +
        `In order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTimeFormatted}.\n\n` +
        `Safe travels!`;
    }

    if (travelEstimate.transit && transitLeaveFormatted) {
      let transitText = `\n🚆 ${transitLineName}: ${travelEstimate.transit.durationText}\n` +
        `Leave by: ${transitLeaveFormatted}`;
      if (travelEstimate.transit.transitSteps && travelEstimate.transit.transitSteps.length > 0) {
        const stepLines = travelEstimate.transit.transitSteps
          .filter((s) => s.transitLine)
          .map((s) => {
            const stopSeg = s.departureStop && s.arrivalStop
              ? ` - ${s.departureStop} to ${s.arrivalStop}`
              : s.departureStop
              ? ` - from ${s.departureStop}`
              : s.arrivalStop
              ? ` - to ${s.arrivalStop}`
              : '';
            return `• ${s.transitLine}${stopSeg}`;
          })
          .join('\n');
        if (stepLines) {
          transitText += `\nTransit steps:\n${stepLines}`;
        }
      }
      if (transitAlertsSummary) {
        transitText += `\n${transitAlertsSummary}`;
      }
      if (travelEstimate.stationInfo?.fareDescription) {
        transitText += `\nFare: ${travelEstimate.stationInfo.fareDescription}`;
      }
      message += `\n${transitText}\n`;
    }

    // 6. Send SMS
    if (profile.Item?.smsEnabled && profile.Item?.phoneNumber && profile.Item?.phoneVerified) {
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

    // Compute email theme based on notification type
    const emailTitle = isUpdate && !isDelayed ? 'Flight Back on Schedule'
      : isUpdate && isDelayed ? 'Updated Leave Time'
      : isDelayed ? 'Flight Delayed'
      : 'Flight Alert';
    const emailIcon = isUpdate && !isDelayed ? '✅'
      : isUpdate && isDelayed ? '⏰'
      : isDelayed ? '⚠️'
      : '✈️';
    const bannerGradient = isUpdate && !isDelayed ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)'
      : isUpdate && isDelayed ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
      : isDelayed ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
      : 'linear-gradient(135deg, #15803d 0%, #166534 100%)';
    const accentColor = isUpdate && !isDelayed ? '#15803d'
      : isUpdate && isDelayed ? '#2563eb'
      : isDelayed ? '#d97706'
      : '#15803d';
    const leaveBoxBg = isUpdate && isDelayed ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'
      : isDelayed ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
      : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)';
    const leaveTimeColor = isUpdate && isDelayed ? '#1d4ed8'
      : isDelayed ? '#b45309'
      : '#15803d';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: ${bannerGradient}; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">${emailIcon}</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">${emailTitle}</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.Item.flightNumber}</p>
    </div>
    
    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      ${isUpdate && !isDelayed ? `
      <!-- Back on Schedule Banner -->
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #166534; font-size: 15px; font-weight: 700; margin: 0 0 6px 0;">
          ✅ Your flight is back on its original schedule
        </p>
        <p style="color: #15803d; font-size: 14px; margin: 0;">
          Departure: <strong>${schedDepartureFormatted}</strong>
        </p>
      </div>` : ''}
      ${isUpdate && isDelayed ? `
      <!-- Delay Update Banner -->
      <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <p style="color: #1e40af; font-size: 15px; font-weight: 700; margin: 0 0 6px 0;">
          ⏰ Delay Updated (+${delayMinutes} mins)
        </p>
        <p style="color: #1e3a8a; font-size: 14px; margin: 0;">
          Scheduled: <strong>${schedDepartureFormatted}</strong> &nbsp;→&nbsp; New Departure: <strong>${effectiveDepartureFormatted}</strong>
        </p>
      </div>` : ''}
      ${!isUpdate && isDelayed ? `
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
        <p style="color: ${accentColor}; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelEstimate.drive.durationText}</p>
      </div>
      
      <!-- Drive Option -->
      <div style="background: ${leaveBoxBg}; border-radius: 12px; padding: 20px; border-left: 4px solid ${accentColor}; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: ${leaveTimeColor}; font-size: 16px;">🚗 Drive (Live Traffic)</span>
          <span style="font-weight: 700; color: ${leaveTimeColor}; font-size: 18px;">${travelEstimate.drive.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong> for your ${isUpdate ? 'updated ' : ''}${isDelayed ? 'delayed ' : ''}flight, leave by:</p>
        <p style="color: ${leaveTimeColor}; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
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
        ${travelEstimate.transit.transitSteps && travelEstimate.transit.transitSteps.length > 0 ? `
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #bfdbfe; font-size: 13px; color: #1e3a8a;">
          ${travelEstimate.transit.transitSteps.filter((s) => s.transitLine).map((s) => {
            const stopSeg = s.departureStop && s.arrivalStop
              ? ` - ${s.departureStop} to ${s.arrivalStop}`
              : s.departureStop
              ? ` - from ${s.departureStop}`
              : s.arrivalStop
              ? ` - to ${s.arrivalStop}`
              : '';
            return `<div style="margin-top: 4px;">• <strong>${s.transitLine}</strong>${stopSeg}</div>`;
          }).join('')}
        </div>` : ''}
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
      
      ${transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 600;">
          ⚠️ Public transit directions are currently unavailable for this route.
        </p>
      </div>` : ''}
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">Safe travels! 🛫</p>
        <p style="color: #d1d5db; font-size: 12px; margin: 8px 0 0 0;">Powered by Make My Flight${transitAgency !== "Public Transit" ? ` & ${transitAgency}` : ""}</p>
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
    } else {
      console.log("Email notifications disabled, skipping email");
    }

  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
