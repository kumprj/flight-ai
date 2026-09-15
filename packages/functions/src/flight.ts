import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Flights } from "@flight-ai/core/flights";

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  const flightNumber = event.queryStringParameters?.flightNumber;
  const date = event.queryStringParameters?.date;
  const depIata = event.queryStringParameters?.depIata;
  const arrIata = event.queryStringParameters?.arrIata;
  const segmentsParam = event.queryStringParameters?.segments;

  console.log('Environment check:', {
    hasKey: !!process.env.AVIATION_STACK_KEY,
    keyPreview: process.env.AVIATION_STACK_KEY?.substring(0, 8) + '...'
  });
  console.log('Search request:', { flightNumber, date, depIata, arrIata, segmentsParam }); // Debug log

  let results;

  if (segmentsParam) {
    // Connecting flights: parse segments and search for each
    try {
      const segments = JSON.parse(segmentsParam);
      if (Array.isArray(segments) && segments.length > 1) {
        const segmentList = [];
        for (const segment of segments) {
          if (segment.origin && segment.destination && date) {
            const segmentFlights = await Flights.searchByRoute(segment.origin, segment.destination, date);
            segmentList.push({
              origin: segment.origin,
              destination: segment.destination,
              flights: segmentFlights,
            });
          }
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isMultiSegment: true,
            segments: segmentList,
          }),
        };
      } else if (Array.isArray(segments) && segments.length === 1 && segments[0].origin && segments[0].destination && date) {
        results = await Flights.searchByRoute(segments[0].origin, segments[0].destination, date);
      }
    } catch (err) {
      console.error('Failed to parse segments:', err);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid segments parameter" }),
      };
    }
  } else if (depIata && arrIata && date) {
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
