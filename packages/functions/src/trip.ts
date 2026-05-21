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

const ses = new SESClient({});

/**
 * Helper to generate a consistent User ID from the email claim.
 * e.g., "rkump24@gmail.com" -> "rkump24_gmail_com"
 */
const getUserIdFromClaims = (claims: any): string | null => {
  if (!claims || !claims.email) return null;
  return (claims.email as string).replace(/[@.]/g, "_");
};

/**
 * Get timezone for airport code
 */
const getAirportTimezone = (airportCode: string): string => {
  const timezones: Record<string, string> = {
    // US Timezones
    'JFK': 'America/New_York', 'LGA': 'America/New_York', 'EWR': 'America/New_York',
    'ORD': 'America/Chicago', 'MDW': 'America/Chicago',
    'LAX': 'America/Los_Angeles', 'SFO': 'America/Los_Angeles', 'SAN': 'America/Los_Angeles',
    'DEN': 'America/Denver', 'PHX': 'America/Phoenix',
    'ATL': 'America/New_York', 'DFW': 'America/Chicago', 'IAH': 'America/Chicago',
    'MIA': 'America/New_York', 'MCO': 'America/New_York', 'BOS': 'America/New_York',
    'SEA': 'America/Los_Angeles', 'LAS': 'America/Los_Angeles', 'MSP': 'America/Chicago',
    'DTW': 'America/New_York', 'PHL': 'America/New_York', 'CLT': 'America/New_York',
    // Add more as needed
  };

  return timezones[airportCode.toUpperCase()] || 'America/Chicago'; // Default fallback
};

export const create: APIGatewayProxyHandlerV2 = async (event) => {
  // 1. Get User ID from the valid Token
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the destination airport
  const timezone = getAirportTimezone(body.destinationAirport);

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
  const authorizer = event.requestContext.authorizer;
  const claims = (authorizer as any)?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

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
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = getUserIdFromClaims(claims);

  if (!userId) {
    console.error("Unauthorized: Missing email claim");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const tripId = `${body.date}#${body.flightNumber}`;

  // Get timezone for the destination airport
  const timezone = getAirportTimezone(body.destinationAirport);

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

    // Calculate travel time
    const travelInfo = await GoogleMaps.getTravelTime(
      trip.homeAddress,
      trip.originAirport,
      new Date()
    );

    // Calculate when to leave based on arrival preference
    const arrivalPreference = profile?.arrivalPreference || 2;
    const travelTimeMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const totalMinutesNeeded = travelTimeMinutes + (arrivalPreference * 60);

    // Get timezone for departure airport
    const airportTimezones: Record<string, string> = {
      'ORD': 'America/Chicago',
      'MDW': 'America/Chicago',
      'LAX': 'America/Los_Angeles',
      'JFK': 'America/New_York',
      'SFO': 'America/Los_Angeles',
      'ATL': 'America/New_York',
      'DFW': 'America/Chicago',
      'DEN': 'America/Denver',
      'SEA': 'America/Los_Angeles',
      'MIA': 'America/New_York',
      'BOS': 'America/New_York',
      'PHL': 'America/New_York',
      'PHX': 'America/Phoenix',
      'IAH': 'America/Chicago',
      'MSP': 'America/Chicago',
      'DTW': 'America/New_York',
      'CLT': 'America/New_York',
      'LAS': 'America/Los_Angeles',
      'LGA': 'America/New_York',
      'FLL': 'America/New_York',
      'SAN': 'America/Los_Angeles',
      'IAD': 'America/New_York',
      'TPA': 'America/New_York',
      'MDW': 'America/Chicago',
      'BWI': 'America/New_York',
      'SLC': 'America/Denver',
      'HNL': 'Pacific/Honolulu',
      'PDX': 'America/Los_Angeles',
      'MCO': 'America/New_York',
      'DCA': 'America/New_York',
      'STL': 'America/Chicago',
      'BNA': 'America/Chicago',
      'AUS': 'America/Chicago',
      'SJU': 'America/Puerto_Rico',
      'SJC': 'America/Los_Angeles',
      'OAK': 'America/Los_Angeles',
      'SMF': 'America/Los_Angeles',
      'SNA': 'America/Los_Angeles',
      'MCI': 'America/Chicago',
      'RDU': 'America/New_York',
      'CLE': 'America/New_York',
      'IND': 'America/New_York',
      'PIT': 'America/New_York',
      'CMH': 'America/New_York',
      'CVG': 'America/New_York',
      'BDL': 'America/New_York',
      'PBI': 'America/New_York',
      'RSW': 'America/New_York',
      'JAX': 'America/New_York',
      'OKC': 'America/Chicago',
      'ABQ': 'America/Denver',
      'OMA': 'America/Chicago',
      'BUR': 'America/Los_Angeles',
      'SDF': 'America/New_York',
      'HOU': 'America/Chicago',
      'DAL': 'America/Chicago',
      'SAT': 'America/Chicago',
      'MSY': 'America/Chicago',
      'RNO': 'America/Los_Angeles',
      'PVD': 'America/New_York',
      'MEM': 'America/Chicago',
      'ALB': 'America/New_York',
      'TUS': 'America/Phoenix',
      'ELP': 'America/Chicago',
      'ONT': 'America/Los_Angeles',
      'MKE': 'America/Chicago',
      'BUF': 'America/New_York',
      'ROC': 'America/New_York',
      'RIC': 'America/New_York',
      'GSO': 'America/New_York',
      'PNS': 'America/Chicago',
      'ORF': 'America/New_York',
      'CHS': 'America/New_York',
      'SAV': 'America/New_York',
      'MYR': 'America/New_York',
      'PSP': 'America/Los_Angeles',
      'LGB': 'America/Los_Angeles',
      'ISP': 'America/New_York',
      'HPN': 'America/New_York',
      'SWF': 'America/New_York',
      'ALO': 'America/Chicago',
      'DSM': 'America/Chicago',
      'CID': 'America/Chicago',
      'MLI': 'America/Chicago',
      'PIA': 'America/Chicago',
      'SPI': 'America/Chicago',
      'DEC': 'America/Chicago',
      'BMI': 'America/Chicago',
      'CMI': 'America/Chicago',
      'EVV': 'America/Chicago',
      'FWA': 'America/Chicago',
      'SBN': 'America/Chicago',
      'TOL': 'America/Chicago',
      'DAY': 'America/New_York',
      'CAK': 'America/New_York',
      'LAN': 'America/New_York',
      'GRR': 'America/New_York',
      'MBS': 'America/New_York',
      'PLN': 'America/New_York',
      'ESC': 'America/New_York',
      'MQT': 'America/New_York',
      'IMT': 'America/New_York',
      'AZO': 'America/New_York',
      'BTL': 'America/New_York',
      'FNT': 'America/New_York',
      'DET': 'America/New_York',
      'MKG': 'America/Chicago',
      'TVC': 'America/New_York',
      'JLN': 'America/Chicago',
      'COU': 'America/Chicago',
      'SGF': 'America/Chicago',
      'TBN': 'America/Chicago',
      'MSN': 'America/Chicago',
      'GRB': 'America/New_York',
      'EAU': 'America/Chicago',
      'LSE': 'America/Chicago',
      'CWA': 'America/Chicago',
      'RST': 'America/Chicago',
      'DLH': 'America/Chicago',
      'BRD': 'America/Chicago',
      'INL': 'America/Chicago',
      'FAR': 'America/Chicago',
      'BIS': 'America/Chicago',
      'MOT': 'America/Chicago',
      'RAP': 'America/Denver',
      'PIR': 'America/Denver',
      'FSD': 'America/Chicago',
      'ABR': 'America/Chicago',
      'LNK': 'America/Chicago',
      'GRI': 'America/Chicago',
      'LBF': 'America/Denver',
      'CPR': 'America/Denver',
      'JAC': 'America/Denver',
      'BIL': 'America/Denver',
      'GTF': 'America/Denver',
      'MSO': 'America/Denver',
      'BOI': 'America/Denver',
      'PIH': 'America/Denver',
      'SUN': 'America/Denver',
      'GEG': 'America/Los_Angeles',
      'PSC': 'America/Los_Angeles',
      'ALW': 'America/Los_Angeles',
      'EAT': 'America/Los_Angeles',
      'YKM': 'America/Los_Angeles',
      'EUG': 'America/Los_Angeles',
      'MFR': 'America/Los_Angeles',
      'RDM': 'America/Los_Angeles',
      'LMT': 'America/Los_Angeles',
      'FAT': 'America/Los_Angeles',
      'BFL': 'America/Los_Angeles',
      'SBA': 'America/Los_Angeles',
      'SMX': 'America/Los_Angeles',
      'MRY': 'America/Los_Angeles',
      'MAF': 'America/Chicago',
      'LBB': 'America/Chicago',
      'AMA': 'America/Chicago',
      'BTR': 'America/Chicago',
      'LFT': 'America/Chicago',
      'SHV': 'America/Chicago',
      'LIT': 'America/Chicago',
      'XNA': 'America/Chicago',
      'TUL': 'America/Chicago',
      'ICT': 'America/Chicago',
      'CHA': 'America/New_York',
      'TYS': 'America/New_York',
      'TRI': 'America/New_York',
      'AVL': 'America/New_York',
      'CAE': 'America/New_York',
      'GSP': 'America/New_York',
      'VPS': 'America/Chicago',
      'TLH': 'America/New_York',
      'EYW': 'America/New_York',
      'BQN': 'America/Puerto_Rico',
      'SDQ': 'America/Santo_Domingo',
      'PUJ': 'America/Santo_Domingo',
      'CUN': 'America/Mexico_City',
      'SJD': 'America/Mexico_City',
      'MEX': 'America/Mexico_City',
      'PVR': 'America/Mexico_City',
      'GDL': 'America/Mexico_City',
      'MTY': 'America/Mexico_City',
      'YYZ': 'America/Toronto',
      'YVR': 'America/Vancouver',
      'YUL': 'America/Montreal',
      'YYC': 'America/Edmonton',
      'YEG': 'America/Edmonton',
      'YOW': 'America/Toronto',
      'YWG': 'America/Winnipeg',
      'YXE': 'America/Regina',
      'YQR': 'America/Regina',
      'YHZ': 'America/Halifax',
      'YQB': 'America/Montreal',
      'YKA': 'America/Vancouver',
      'YYJ': 'America/Vancouver',
      'YXS': 'America/Vancouver',
      'YXY': 'America/Vancouver',
      'YZF': 'America/Vancouver',
      'YFB': 'America/Halifax',
      'LHR': 'Europe/London',
      'LGW': 'Europe/London',
      'STN': 'Europe/London',
      'LTN': 'Europe/London',
      'MAN': 'Europe/London',
      'BHX': 'Europe/London',
      'EDI': 'Europe/London',
      'GLA': 'Europe/London',
      'BFS': 'Europe/London',
      'DUB': 'Europe/Dublin',
      'SNN': 'Europe/Dublin',
      'CDG': 'Europe/Paris',
      'ORY': 'Europe/Paris',
      'NCE': 'Europe/Paris',
      'LYS': 'Europe/Paris',
      'MRS': 'Europe/Paris',
      'TLS': 'Europe/Paris',
      'FRA': 'Europe/Berlin',
      'MUC': 'Europe/Berlin',
      'DUS': 'Europe/Berlin',
      'HAM': 'Europe/Berlin',
      'BER': 'Europe/Berlin',
      'CGN': 'Europe/Berlin',
      'STR': 'Europe/Berlin',
      'AMS': 'Europe/Amsterdam',
      'BRU': 'Europe/Brussels',
      'ZRH': 'Europe/Zurich',
      'GVA': 'Europe/Zurich',
      'BSL': 'Europe/Zurich',
      'VIE': 'Europe/Vienna',
      'MXP': 'Europe/Rome',
      'FCO': 'Europe/Rome',
      'VCE': 'Europe/Rome',
      'NAP': 'Europe/Rome',
      'FLR': 'Europe/Rome',
      'BLQ': 'Europe/Rome',
      'MAD': 'Europe/Madrid',
      'BCN': 'Europe/Madrid',
      'AGP': 'Europe/Madrid',
      'PMI': 'Europe/Madrid',
      'LIS': 'Europe/Lisbon',
      'OPO': 'Europe/Lisbon',
      'CPH': 'Europe/Copenhagen',
      'ARN': 'Europe/Stockholm',
      'OSL': 'Europe/Oslo',
      'HEL': 'Europe/Helsinki',
      'LED': 'Europe/Moscow',
      'SVO': 'Europe/Moscow',
      'WAW': 'Europe/Warsaw',
      'PRG': 'Europe/Prague',
      'BUD': 'Europe/Budapest',
      'ATH': 'Europe/Athens',
      'IST': 'Europe/Istanbul',
      'SAW': 'Europe/Istanbul',
      'ESB': 'Europe/Istanbul',
      'OTP': 'Europe/Bucharest',
      'SOF': 'Europe/Sofia',
      'BEG': 'Europe/Belgrade',
      'ZAG': 'Europe/Zagreb',
      'LJU': 'Europe/Ljubljana',
      'SKG': 'Europe/Athens',
      'HER': 'Europe/Athens',
      'MLA': 'Europe/Malta',
      'NRT': 'Asia/Tokyo',
      'HND': 'Asia/Tokyo',
      'KIX': 'Asia/Osaka',
      'NGO': 'Asia/Osaka',
      'CTS': 'Asia/Osaka',
      'FUK': 'Asia/Osaka',
      'ICN': 'Asia/Seoul',
      'GMP': 'Asia/Seoul',
      'PUS': 'Asia/Seoul',
      'PEK': 'Asia/Shanghai',
      'PVG': 'Asia/Shanghai',
      'CAN': 'Asia/Shanghai',
      'SZX': 'Asia/Shanghai',
      'CTU': 'Asia/Shanghai',
      'HKG': 'Asia/Hong_Kong',
      'MFM': 'Asia/Macau',
      'TPE': 'Asia/Taipei',
      'KHH': 'Asia/Taipei',
      'MNL': 'Asia/Manila',
      'CEB': 'Asia/Manila',
      'DVO': 'Asia/Manila',
      'SGN': 'Asia/Ho_Chi_Minh',
      'HAN': 'Asia/Ho_Chi_Minh',
      'DAD': 'Asia/Ho_Chi_Minh',
      'PNH': 'Asia/Phnom_Penh',
      'REP': 'Asia/Phnom_Penh',
      'BWN': 'Asia/Brunei',
      'VTE': 'Asia/Vientiane',
      'RGN': 'Asia/Yangon',
      'DEL': 'Asia/Kolkata',
      'BOM': 'Asia/Kolkata',
      'BLR': 'Asia/Kolkata',
      'MAA': 'Asia/Kolkata',
      'CCU': 'Asia/Kolkata',
      'HYD': 'Asia/Kolkata',
      'COK': 'Asia/Kolkata',
      'AMD': 'Asia/Kolkata',
      'ISB': 'Asia/Karachi',
      'KHI': 'Asia/Karachi',
      'LHE': 'Asia/Karachi',
      'KTM': 'Asia/Kathmandu',
      'DAC': 'Asia/Dhaka',
      'CMB': 'Asia/Colombo',
      'MLE': 'Asia/Maldives',
      'DXB': 'Asia/Dubai',
      'AUH': 'Asia/Dubai',
      'DOH': 'Asia/Doha',
      'KWI': 'Asia/Kuwait',
      'BAH': 'Asia/Bahrain',
      'MCT': 'Asia/Muscat',
      'AMM': 'Asia/Amman',
      'BEY': 'Asia/Beirut',
      'TLV': 'Asia/Jerusalem',
      'JED': 'Asia/Riyadh',
      'RUH': 'Asia/Riyadh',
      'DMM': 'Asia/Riyadh',
      'SYD': 'Australia/Sydney',
      'MEL': 'Australia/Melbourne',
      'BNE': 'Australia/Brisbane',
      'PER': 'Australia/Perth',
      'ADL': 'Australia/Adelaide',
      'CBR': 'Australia/Sydney',
      'OOL': 'Australia/Brisbane',
      'AKL': 'Pacific/Auckland',
      'WLG': 'Pacific/Auckland',
      'CHC': 'Pacific/Auckland',
      'ZQN': 'Pacific/Auckland',
      'NAN': 'Pacific/Fiji',
      'PPT': 'Pacific/Tahiti',
      'NOU': 'Pacific/Noumea',
      'GRU': 'America/Sao_Paulo',
      'GIG': 'America/Sao_Paulo',
      'EZE': 'America/Argentina',
      'AEP': 'America/Argentina',
      'SCL': 'America/Santiago',
      'LIM': 'America/Lima',
      'BOG': 'America/Bogota',
      'MDE': 'America/Bogota',
      'CLO': 'America/Bogota',
      'UIO': 'America/Quito',
      'GYE': 'America/Quito',
      'CCS': 'America/Caracas',
      'JNB': 'Africa/Johannesburg',
      'CPT': 'Africa/Johannesburg',
      'DUR': 'Africa/Johannesburg',
      'NBO': 'Africa/Nairobi',
      'ADD': 'Africa/Addis_Ababa',
      'CAI': 'Africa/Cairo',
      'CMN': 'Africa/Casablanca',
      'TUN': 'Africa/Tunis',
      'ALG': 'Africa/Algiers',
      'LOS': 'Africa/Lagos',
      'ACC': 'Africa/Accra',
      'DAR': 'Africa/Dar_es_Salaam',
      'EBB': 'Africa/Kampala',
      'MBJ': 'America/Jamaica',
      'KIN': 'America/Jamaica',
      'POS': 'America/Port_of_Spain',
      'BGI': 'America/Barbados',
      'AUA': 'America/Aruba',
      'CUR': 'America/Curacao',
      'SXM': 'America/Curacao',
      'STT': 'America/St_Thomas',
      'STX': 'America/St_Thomas',
      'GCM': 'America/Cayman',
      'NAS': 'America/Nassau',
      'PLS': 'America/Turks_and_Caicos',
      'BDA': 'Atlantic/Bermuda',
    };

    const timezone = airportTimezones[trip.originAirport.toUpperCase()] || 'America/Chicago';

    // trip.date is stored as a naive local time string (e.g. "2026-05-21T17:45:00")
    // We must interpret it as local time in the airport's timezone.
    // Strategy: parse as UTC first to get the components, then use Intl to find the
    // UTC offset for that timezone at that moment, and shift accordingly.
    const naiveDateStr = trip.date.split('+')[0].split('Z')[0]; // strip any tz suffix
    
    // Append 'Z' to force UTC interpretation of the naive string
    const naiveAsUTC = new Date(naiveDateStr + 'Z');

    // Find the UTC offset for the airport timezone at that moment
    // by comparing what UTC looks like in that tz vs UTC
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const tzStr = tzFormatter.format(naiveAsUTC);
    const utcStr = utcFormatter.format(naiveAsUTC);
    const tzDate = new Date(tzStr.replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
    const utcDate = new Date(utcStr.replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'));
    const offsetMs = tzDate.getTime() - utcDate.getTime();

    // The true UTC epoch of the flight departure
    const flightUTC = new Date(naiveAsUTC.getTime() - offsetMs);

    // Subtract travel time to get leave time as a UTC epoch
    const leaveTimeUTC = new Date(flightUTC.getTime() - (totalMinutesNeeded * 60 * 1000));

    const message = `✈️ TEST Flight Alert for ${trip.flightNumber}!\n\nCurrent travel time from ${trip.homeAddress} to ${trip.originAirport} is ${travelInfo.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${leaveTimeUTC.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone
    })}.\n\nThis is a test notification. Safe travels!`;

    // Send email
    const recipientEmail = profile?.email || "rkump24@gmail.com";
    const senderEmail = "rkump24@gmail.com";

    await ses.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: {ToAddresses: [recipientEmail]},
      Message: {
        Subject: {Data: `🧪 TEST: Time to Leave for Flight ${trip.flightNumber}!`},
        Body: {
          Text: {Data: message},
          Html: {
            Data: `
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
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Travel Time</p>
        <p style="color: #1f2937; font-size: 16px; margin: 0; line-height: 1.6;">
          From <strong>${trip.homeAddress}</strong> to <strong>${trip.originAirport}</strong>
        </p>
        <p style="color: #15803d; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelInfo.durationText}</p>
      </div>

      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; border-left: 4px solid #f59e0b;">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>, you should leave at:
        </p>
        <p style="color: #d97706; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTimeUTC.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone
          })}
        </p>
      </div>

      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">This is a test notification 🧪</p>
        <p style="color: #d1d5db; font-size: 12px; margin: 8px 0 0 0;">Powered by Flight AI</p>
      </div>
    </div>
  </div>
</body>
</html>
          `
          }
        }
      }
    }));

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
    console.log("Calculating travel time from", homeAddress, "to", airportCode);
    const travelInfo = await GoogleMaps.getTravelTime(
      homeAddress,
      airportCode,
      new Date()
    );
    console.log("Travel time calculated:", travelInfo);

    return {
      statusCode: 200,
      body: JSON.stringify(travelInfo)
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
