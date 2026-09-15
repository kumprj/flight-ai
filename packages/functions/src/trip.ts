import { Trip, SchedulerPayload } from "@flight-ai/core/types";
import { Resource } from "sst";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2
} from "aws-lambda";
import { Database } from "@flight-ai/core/dynamodb";
import {SESClient, SendEmailCommand} from "@aws-sdk/client-ses";
import {GoogleMaps} from "@flight-ai/core/maps";
import {
  getAirportTimezone,
  parseFlightTimeToUTC,
  calculateLeaveTime,
  formatLeaveTime,
  formatCtaAlertsSummary,
  formatMtaAlertsSummary
} from "@flight-ai/core";
import twilio from "twilio";

const ses = new SESClient({});
const twilioClient = twilio(process.env.TWILIO_SID!, process.env.TWILIO_TOKEN!);

/**
 * Decode the Bearer token manually and return a stable userId from the email claim.
 * Works for both Cognito email/password and Google OAuth users.
 */
const getUserIdFromToken = (event: any): string | null => {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) return null;
  const parts = authHeader.replace('Bearer ', '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const email = payload.email;
    if (!email) return null;
    return (email as string).replace(/[@.]/g, '_');
  } catch {
    return null;
  }
};


export const create: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = getUserIdFromToken(event);
  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the origin airport
  const timezone = getAirportTimezone(body.originAirport);

  // 2. Save to Database with timezone
  try {
    await Database.put({
      pk: `USER#${userId}`,
      sk: `TRIP#${tripId}`,
      ...body,
      timezone, // Add timezone to the trip
      userId,
      createdAt: Date.now(),
    });

    console.log("Trip created:", tripId, "Timezone:", timezone);
  } catch (e) {
    console.error("Database Put Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to save trip" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "created",
      message: "Trip created successfully. You'll be notified when it's time to leave."
    })
  };
};

export const list: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = getUserIdFromToken(event);
  if (!userId) {
    console.error("Unauthorized: No valid email claim found");
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const trips = await Database.listTrips(userId);
    return { statusCode: 200, body: JSON.stringify(trips) };
  } catch (e) {
    console.error("Database List Error:", e);
    return { statusCode: 500, body: "Database error" };
  }
};

export const update: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = getUserIdFromToken(event);
  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the origin airport
  const timezone = getAirportTimezone(body.originAirport);

  try {
    await Database.put({
      pk: `USER#${userId}`,
      sk: `TRIP#${tripId}`,
      ...body,
      timezone,
      userId,
      createdAt: body.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    console.log("Trip updated:", tripId);
  } catch (e) {
    console.error("Database Update Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to update trip" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "updated",
      message: "Trip updated successfully."
    })
  };
};

export const testNotify: APIGatewayProxyHandlerV2 = async (event) => {
  // Manual JWT decoding like profile endpoints
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) {
    console.log("No authorization header found");
    return { statusCode: 401, body: "Unauthorized: Missing Authorization header" };
  }

  const token = authHeader.replace('Bearer ', '');

  // Decode JWT manually (simple base64 decode for now)
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.log("Invalid token format");
    return { statusCode: 401, body: "Unauthorized: Invalid token format" };
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  const email = payload.email;

  if (!email) {
    console.log("No email in token payload");
    return { statusCode: 401, body: "Unauthorized: Missing email in token" };
  }

  const userId = email.replace(/[@.]/g, "_");

  const body = JSON.parse(event.body || "{}");
  const tripId = body.tripId;

  if (!tripId) {
    return { statusCode: 400, body: JSON.stringify({ error: "tripId is required" }) };
  }

  try {
    // Get trip data
    const trip = await Database.get(userId, tripId);

    if (!trip) {
      return { statusCode: 404, body: JSON.stringify({ error: "Trip not found" }) };
    }

    // Get user profile
    const profile = await Database.get(userId, "PROFILE");

    // Calculate travel time (multi-modal if transitEnabled)
    const transitEnabled = Boolean(profile?.transitEnabled);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      trip.homeAddress,
      trip.originAirport,
      new Date(),
      transitEnabled
    );

    // Calculate when to leave based on arrival preference
    const arrivalPreference = profile?.arrivalPreference || 2;
    const driveMinutes = Math.ceil(travelEstimate.drive.durationSeconds / 60);

    const flightUTC = parseFlightTimeToUTC(trip.date, trip.originAirport || trip.timezone);
    const driveLeaveUTC = calculateLeaveTime(flightUTC, driveMinutes, arrivalPreference);
    const driveLeaveFormatted = formatLeaveTime(driveLeaveUTC, trip.originAirport || trip.timezone);

    let transitLeaveFormatted: string | undefined;
    let transitAlertsSummary: string | undefined;

    if (travelEstimate.transit) {
      const transitMinutes = Math.ceil(travelEstimate.transit.durationSeconds / 60);
      const transitLeaveUTC = calculateLeaveTime(flightUTC, transitMinutes, arrivalPreference);
      transitLeaveFormatted = formatLeaveTime(transitLeaveUTC, trip.originAirport || trip.timezone);

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

    let message: string;
    if (travelEstimate.transit && transitLeaveFormatted) {
      message = `✈️ TEST Flight Alert for ${trip.flightNumber}!\n\nOptions to arrive ${arrivalPreference}h early at ${trip.originAirport}:\n` +
        `🚗 Drive: ${travelEstimate.drive.durationText} (Leave by ${driveLeaveFormatted})\n` +
        `🚆 ${transitLineName}: ${travelEstimate.transit.durationText} (Leave by ${transitLeaveFormatted})\n`;
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
            return `   • ${s.transitLine}${stopSeg}`;
          })
          .join('\n');
        if (stepLines) {
          message += `Transit steps:\n${stepLines}\n`;
        }
      }
      if (transitAlertsSummary) {
        message += `\n${transitAlertsSummary}\n`;
      }
      if (travelEstimate.stationInfo?.fareDescription) {
        message += `Fare: ${travelEstimate.stationInfo.fareDescription}\n`;
      }
      message += `\nThis is a test notification. Safe travels!`;
    } else {
      message = `✈️ TEST Flight Alert for ${trip.flightNumber}!\n\nCurrent travel time from ${trip.homeAddress} to ${trip.originAirport} is ${travelEstimate.drive.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${driveLeaveFormatted}.${profile?.transitEnabled ? "\\n\\nNote: Public transit directions are currently unavailable for this route at the targeted time." : ""}\n\nThis is a test notification. Safe travels!`;
    }

    // Send email
    const recipientEmail = profile?.email || "rkump24@gmail.com";
    const senderEmail = "rkump24@gmail.com";

    const testEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TEST Flight Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
      <div style="font-size: 48px; margin-bottom: 16px;">🧪</div>
      <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">TEST Flight Alert</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 18px;">Flight ${trip.flightNumber}</p>
    </div>

    <div style="background: white; border-radius: 16px; padding: 32px; margin-top: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="margin-bottom: 24px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Trip Details</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${trip.homeAddress}</strong> to <strong>${trip.originAirport}</strong>
        </p>
      </div>

      <!-- Drive Option -->
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #f59e0b; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: #92400e; font-size: 16px;">🚗 Drive</span>
          <span style="font-weight: 700; color: #b45309; font-size: 18px;">${travelEstimate.drive.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">Leave by:</p>
        <p style="color: #d97706; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${driveLeaveFormatted}
        </p>
      </div>

      ${travelEstimate.transit && transitLeaveFormatted ? `
      <!-- Transit Option -->
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

${profile?.transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 600;">
          ⚠️ Public transit directions are currently unavailable for this route.
        </p>
      </div>` : ''}
      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">This is a test notification 🧪</p>
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
        Subject: {Data: `🧪 TEST: Time to Leave for Flight ${trip.flightNumber}!`},
        Body: {
          Text: {Data: message},
          Html: {Data: testEmailHtml}
        }
      }
    }));

    // Send SMS if phone is verified
    if (profile?.phoneNumber && profile?.phoneVerified) {
      console.log("Sending test SMS to:", profile.phoneNumber);
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_FROM_NUMBER!,
        to: profile.phoneNumber,
      });
      console.log("Test SMS sent successfully");
    } else {
      console.log("No verified phone number, skipping SMS");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        message: "Test notification sent successfully"
      })
    };
  } catch (error) {
    console.error("Test notification failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to send test notification" }) };
  }
};

export const getTravelTime: APIGatewayProxyHandlerV2 = async (event) => {
  // Manual JWT decoding like profile endpoints
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) {
    console.log("No authorization header found");
    return { statusCode: 401, body: "Unauthorized: Missing Authorization header" };
  }

  const token = authHeader.replace('Bearer ', '');

  // Decode JWT manually (simple base64 decode for now)
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.log("Invalid token format");
    return { statusCode: 401, body: "Unauthorized: Invalid token format" };
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  console.log("Decoded token payload:", JSON.stringify(payload, null, 2));

  const email = payload.email;

  if (!email) {
    console.log("No email in token payload");
    return { statusCode: 401, body: "Unauthorized: Missing email in token" };
  }

  const userId = email.replace(/[@.]/g, "_");

  const body = JSON.parse(event.body || "{}");
  const { homeAddress, airportCode } = body;

  if (!homeAddress || !airportCode) {
    return { statusCode: 400, body: JSON.stringify({ error: "homeAddress and airportCode are required" }) };
  }

  try {
    const profile = await Database.get(userId, "PROFILE");
    const includeTransit = Boolean(body.includeTransit ?? profile?.transitEnabled);

    console.log("Calculating travel time from", homeAddress, "to", airportCode, "includeTransit:", includeTransit);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      homeAddress,
      airportCode,
      new Date(),
      includeTransit
    );
    console.log("Travel time calculated:", travelEstimate);

    return {
      statusCode: 200,
      body: JSON.stringify({
        durationSeconds: travelEstimate.drive.durationSeconds,
        durationText: travelEstimate.drive.durationText,
        distanceMeters: travelEstimate.drive.distanceMeters,
        drive: travelEstimate.drive,
        transit: travelEstimate.transit,
        ctaAlerts: travelEstimate.ctaAlerts,
        mtaAlerts: travelEstimate.mtaAlerts,
        stationInfo: travelEstimate.stationInfo,
      })
    };
  } catch (error) {
    console.error("Travel time calculation failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to calculate travel time", details: error instanceof Error ? error.message : String(error) }) };
  }
};

export const remove: APIGatewayProxyHandlerV2 = async (event) => {
  // Manual JWT decoding like profile endpoints
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: "Unauthorized: Missing Authorization header" };
  }

  const token = authHeader.replace('Bearer ', '');

  // Decode JWT manually (simple base64 decode for now)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { statusCode: 401, body: "Unauthorized: Invalid token format" };
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  const email = payload.email;

  if (!email) {
    return { statusCode: 401, body: "Unauthorized: Missing email in token" };
  }

  const userId = email.replace(/[@.]/g, "_");

  const body = JSON.parse(event.body || "{}");
  const tripId = body.tripId;

  if (!tripId) {
    return { statusCode: 400, body: JSON.stringify({ error: "tripId is required" }) };
  }

  try {
    await Database.delete(userId, tripId);

    console.log("Trip deleted:", tripId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "deleted",
        message: "Trip deleted successfully."
      })
    };
  } catch (e) {
    console.error("Database Delete Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to delete trip" }) };
  }
};
