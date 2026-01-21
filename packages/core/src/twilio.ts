import { Twilio } from "twilio";

// Lazy load the client so it doesn't crash if env vars are missing during build
const getClient = () => {
  return new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
};

export const Messenger = {
  sendSms: async (to: string, body: string) => {
    const client = getClient();
    await client.messages.create({
      body,
      from: process.env.TWILIO_FROM_NUMBER, // Add this to your sst.config.ts environment
      to,
    });
  }
};
