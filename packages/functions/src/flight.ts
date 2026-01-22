import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Flights } from "@flight-ai/core/flights";

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  const flightNumber = event.queryStringParameters?.flightNumber;
  const date = event.queryStringParameters?.date;
  console.log('Environment check:', {
    hasKey: !!process.env.AVIATION_STACK_KEY,
    keyPreview: process.env.AVIATION_STACK_KEY?.substring(0, 8) + '...'
  });
  console.log('Search request:', { flightNumber, date }); // Debug log

  if (!flightNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing flightNumber parameter" }),
    };
  }

  const results = await Flights.search(flightNumber, date);

  console.log('API returned:', results.length, 'flights'); // Debug log
  // ADD THIS
  if (results.length === 0) {
    console.warn('No flights found - possible rate limit or no data');
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results),
  };
};
