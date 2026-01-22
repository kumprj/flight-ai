import { SchedulerHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { GoogleMaps } from "@flight-ai/core/maps";
import { Messenger } from "@flight-ai/core/twilio";
import { SchedulerPayload } from "@flight-ai/core/types";

const ses = new SESClient({});

export const handler: SchedulerHandler = async (event) => {
  console.log("Worker triggered:", JSON.stringify(event, null, 2));
  const payload = event as unknown as SchedulerPayload;

  if (!payload.homeAddress || !payload.airportCode) {
    console.error("Missing address or airport in payload");
    return;
  }

  try {
    // 1. Calculate Travel Time
    const travelInfo = await GoogleMaps.getTravelTime(
        payload.homeAddress,
        payload.airportCode,
        new Date()
    );

    const message = `✈️ Flight Alert! \n\nTraffic to ${payload.airportCode} is currently ${travelInfo.durationText}.\nWe recommend leaving by ${new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`;

    // 2. Send SMS (Twilio)
    // In a real app, you'd fetch the user's phone number from DynamoDB here using payload.userId
    const userPhone = process.env.MY_PHONE_NUMBER;
    if (userPhone) {
      await Messenger.sendSms(userPhone, message);
      console.log("SMS sent");
    }

    // 3. Send Email (SES)
    // We assume the user ID "rkump24_gmail_com" contains the email info,
    // or you can fetch the profile. For now, we reconstruct it or use a default.
    const userEmail = payload.userId.replace("_gmail_com", "@gmail.com").replace(/_/g, "."); // Rough reconstruction
    // OR just use your env var for testing:
    const targetEmail = process.env.MY_EMAIL || "rkump24@gmail.com";

    // IMPORTANT: The 'Source' email must be verified in SES console (sandboxed mode)
    const senderEmail = process.env.SENDER_EMAIL || "rkump24@gmail.com";

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [targetEmail] },
      Message: {
        Subject: { Data: "Flight Alert: Time to Leave!" },
        Body: {
          Text: { Data: message }
        }
      }
    }));
    console.log("Email sent");

  } catch (error) {
    console.error("Notification failed:", error);
    throw error;
  }
};
