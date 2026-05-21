import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Flights } from "@flight-ai/core/flights";

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  const flightNumber = event.queryStringParameters?.flightNumber;
  const date = event.queryStringParameters?.date;
  const depIata = event.queryStringParameters?.depIata;
  const arrIata = event.queryStringParameters?.arrIata;
  console.log('Environment check:', {
    hasKey: !!process.env.AVIATION_STACK_KEY,
    keyPreview: process.env.AVIATION_STACK_KEY?.substring(0, 8) + '...'
  });
  console.log('Search request:', { flightNumber, date, depIata, arrIata }); // Debug log

  let results;

  if (depIata && arrIata && date) {
    // Route search: departure + destination + date (required)
    results = await Flights.searchByRoute(depIata, arrIata, date);
  } else if (flightNumber) {
    // Flight number search: flight number + optional date
    results = await Flights.search(flightNumber, date);
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters. Provide either flightNumber (with optional date) or depIata + arrIata + date" }),
    };
  }

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
