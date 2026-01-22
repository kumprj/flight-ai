import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Flights } from "@flight-ai/core/flights";

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  // 1. Get query params
  const flightNumber = event.queryStringParameters?.flightNumber;

  if (!flightNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing flightNumber parameter" }),
    };
  }

  // 2. Call Core Logic
  const results = await Flights.search(flightNumber);

  // 3. Return Results
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results),
  };
};
