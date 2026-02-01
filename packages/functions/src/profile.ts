import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import twilio from "twilio";

const dynamodb = DynamoDBDocument.from(new DynamoDB({}));

const twilioClient = twilio(
    process.env.TWILIO_SID!,
    process.env.TWILIO_TOKEN!
);

// GET /profile
export const get: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = event.requestContext.authorizer?.jwt.claims.sub as string;

  const result = await dynamodb.get({
    TableName: Resource.Table.name,
    Key: { pk: `USER#${userId}`, sk: "PROFILE" },
  });

  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Profile not found" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.Item),
  };
};

// PUT /profile
export const update: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = event.requestContext.authorizer?.jwt.claims.sub as string;
  const body = JSON.parse(event.body || "{}");

  const profileData = {
    pk: `USER#${userId}`,
    sk: "PROFILE",
    phoneNumber: body.phoneNumber || "",
    phoneVerified: body.phoneVerified || false,
    email: body.email || "",
    homeAddress: body.homeAddress || "",
    arrivalPreference: body.arrivalPreference || 2,
    updatedAt: new Date().toISOString(),
  };

  await dynamodb.put({
    TableName: Resource.Table.name,
    Item: profileData,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profileData),
  };
};

// POST /profile/verify/send
export const sendVerification: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = event.requestContext.authorizer?.jwt.claims.sub as string;
  const body = JSON.parse(event.body || "{}");
  const phoneNumber = body.phoneNumber;

  if (!phoneNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Phone number required" }),
    };
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Store code in DynamoDB with expiration (5 minutes)
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await dynamodb.put({
    TableName: Resource.Table.name,
    Item: {
      pk: `USER#${userId}`,
      sk: `VERIFY#${phoneNumber}`,
      code,
      expiresAt,
      createdAt: new Date().toISOString(),
    },
  });

  // Send SMS via Twilio
  try {
    await twilioClient.messages.create({
      body: `Your Flight AI verification code is: ${code}`,
      from: process.env.TWILIO_FROM_NUMBER!,
      to: phoneNumber,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Verification code sent" }),
    };
  } catch (error) {
    console.error("Twilio error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send SMS" }),
    };
  }
};

// POST /profile/verify/confirm
export const confirmVerification: APIGatewayProxyHandlerV2 = async (event) => {
  const userId = event.requestContext.authorizer?.jwt.claims.sub as string;
  const body = JSON.parse(event.body || "{}");
  const { phoneNumber, code } = body;

  if (!phoneNumber || !code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Phone number and code required" }),
    };
  }

  // Get stored verification code
  const result = await dynamodb.get({
    TableName: Resource.Table.name,
    Key: { pk: `USER#${userId}`, sk: `VERIFY#${phoneNumber}` },
  });

  if (!result.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Verification code not found" }),
    };
  }

  // Check if expired
  if (Date.now() > result.Item.expiresAt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Verification code expired" }),
    };
  }

  // Check if code matches
  if (result.Item.code !== code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid verification code" }),
    };
  }

  // Update profile to mark phone as verified
  const profileResult = await dynamodb.get({
    TableName: Resource.Table.name,
    Key: { pk: `USER#${userId}`, sk: "PROFILE" },
  });

  const profile = profileResult.Item || {};

  await dynamodb.put({
    TableName: Resource.Table.name,
    Item: {
      ...profile,
      pk: `USER#${userId}`,
      sk: "PROFILE",
      phoneNumber,
      phoneVerified: true,
      updatedAt: new Date().toISOString(),
    },
  });

  // Delete verification code
  await dynamodb.delete({
    TableName: Resource.Table.name,
    Key: { pk: `USER#${userId}`, sk: `VERIFY#${phoneNumber}` },
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Phone verified successfully" }),
  };
};
