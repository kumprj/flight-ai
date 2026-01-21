import { SchedulerPayload } from "@flight-ai/core/types";
import { GoogleMaps } from "@flight-ai/core/maps";
import { Messenger } from "@flight-ai/core/twilio";
import { Database } from "@flight-ai/core/dynamodb";

export const handler = async (event: SchedulerPayload) => {
  console.log(`Processing trip ${event.tripId} for user ${event.userId}`);

  try {
    // 1. Get User Profile (to get their phone number)
    // We assume the user profile is stored under PK: USER#<email>, SK: PROFILE
    const userProfile = await Database.getProfile(event.userId);

    if (!userProfile?.phone) {
      console.error("No phone number found for user");
      return;
    }

    // 2. Check Traffic
    // We calculate traffic from Home -> Airport
    const trafficStats = await GoogleMaps.getTravelTime(
        event.homeAddress,
        event.airportCode, // e.g., "ORD" or "O'Hare International Airport"
        new Date()
    );

    // 3. Logic: When should they leave?
    // Current time + Drive Time + 10 minute buffer
    const leaveInMinutes = Math.round(trafficStats.durationSeconds / 60);

    const message = `✈️ Flight Alert: Traffic to ${event.airportCode} is currently ${trafficStats.durationText}. You should leave in the next ${10} minutes to arrive 2 hours early. Drive safe!`;

    // 4. Send SMS
    await Messenger.sendSms(userProfile.phone, message);

    console.log("Notification sent successfully");

  } catch (error) {
    console.error("Error processing notification:", error);
    // In a real app, you might want to send this to a Dead Letter Queue (DLQ)
    throw error;
  }
};
