# Make My Flight (makemyflight)

## Overview
**Make My Flight** (originally `flight-ai`) is a smart flight departure tracking and alert platform.
The application computes optimal leave times based on the user's home address, current/predicted traffic to the departure airport (using Google Maps Routes API), and their arrival buffer preference (default: 2 hours).

Users receive automated departure alerts via:
- **Night before departure**: ~11–12 hours prior to scheduled departure.
- **Pre-departure day-of**: Sent `arrivalPreference + 2` hours prior to scheduled departure with updated live traffic.
- **Multi-channel alerts**: SMS (via Twilio) and Email (via AWS SES), respecting the user's opt-out / toggle preferences.

---

## Monorepo Architecture

The project is an **SST v3 (Ion)** monorepo targeting AWS serverless infrastructure:

```
flight-ai/
├── packages/
│   ├── core/                  # Shared domain modules, utilities, and external APIs
│   │   └── src/
│   │       ├── airports.ts    # Comprehensive airport database (IATA, cities, IANA timezones)
│   │       ├── dateUtils.ts   # Timezone-aware date/time parsing & formatting
│   │       ├── dynamodb.ts    # DynamoDB DocumentClient wrapper
│   │       ├── flights.ts     # AeroDataBox API client (flight & route searches, cached)
│   │       ├── index.ts       # Barrel export
│   │       ├── maps.ts        # Google Maps Routes API (traffic-aware travel time)
│   │       ├── timezones.ts   # Timezone re-exports
│   │       ├── twilio.ts      # Twilio SMS sender
│   │       └── types.ts       # Shared TypeScript interfaces (Trip, SchedulerPayload, etc.)
│   ├── functions/             # AWS Lambda backend handlers
│   │   └── src/
│   │       ├── cron.ts        # Hourly EventBridge cron scanning trips for notification windows
│   │       ├── flight.ts      # API handler for flight searches
│   │       ├── notify.ts      # Worker Lambda calculating travel times and sending SMS/email
│   │       ├── profile.ts     # API handler for profile management & SMS verification
│   │       └── trip.ts        # API handlers for trip CRUD, test notify, and travel time
│   └── web/                   # Frontend React SPA
│       └── src/
│           ├── AddressAutocomplete.tsx # Google Places address autocomplete
│           ├── App.tsx        # Main navigation, auth state, and flight tracking wizard
│           ├── CalendarImport.tsx      # Google Calendar flight scanner & importer
│           ├── DatePicker.tsx # Custom date picker component
│           ├── Onboarding.tsx # Multi-step onboarding flow for new users
│           ├── Profile.tsx    # User profile & notification preferences editor
│           ├── Trips.tsx      # Trips list, static route map preview, live drive times
│           ├── config.ts      # AWS Amplify & API endpoint configuration
│           └── utils/         # Google Calendar & flight time formatting helpers
├── sst.config.ts              # SST v3 infrastructure definition (DynamoDB, Cognito, Lambdas, API)
└── package.json               # Root workspace manifest
```

---

## Database Schema (DynamoDB Single-Table Design)

The primary DynamoDB table uses partition key `pk` (String) and sort key `sk` (String).
`userId` is derived from the user's email address with `@` and `.` replaced by `_` (e.g. `user_example_com`).

| Record Type | `pk` | `sk` | Key Attributes |
| :--- | :--- | :--- | :--- |
| **Profile** | `USER#<userId>` | `PROFILE` | `email`, `homeAddress`, `phoneNumber`, `phoneVerified`, `arrivalPreference` (number, default: 2), `emailEnabled` (bool), `smsEnabled` (bool), `transitEnabled` (bool, default: false), `updatedAt` |
| **Trip** | `USER#<userId>` | `TRIP#<date>#<flightNumber>` | `flightNumber`, `date` (naive ISO string, e.g. `2026-05-20T14:30:00`), `originAirport` (IATA), `destinationAirport` (IATA), `homeAddress`, `timezone`, `createdAt`, `updatedAt` |
| **Phone Verification** | `USER#<userId>` | `VERIFY#<phoneNumber>` | `code` (6-digit string), `expiresAt` (Unix timestamp, 5 min TTL), `createdAt` |

---

## Key Domain Logic & Conventions

1. **Timezone Preservation**:
   - Departure dates are stored as naive local time ISO strings (e.g., `2026-05-20T14:30:00`) representing local time at the departure airport.
   - Always resolve origin airport timezones using `getAirportTimezone(originAirport)` from `@flight-ai/core/airports` when converting to UTC epochs for comparison or calculations.
2. **Notification Preference Checks**:
   - Respect user settings: before dispatching SMS, check `profile.smsEnabled && profile.phoneVerified`; before dispatching email, check `profile.emailEnabled`.
3. **Leave Time Calculation**:
   - `leaveTimeUTC = flightTimeUTC - ((travelTimeMinutes + arrivalPreference * 60) * 60 * 1000)`
   - Google Maps travel time is evaluated for departure at the estimated arrival buffer time.
4. **Authentication**:
   - AWS Cognito User Pool with Google & Facebook federated identity providers.
   - API endpoints authenticate via Bearer token in the `Authorization` header, decoding the user email claim.

---

## Development & Operations

- **Start Local SST**: `npm run dev` (starts SST v3 live Lambda development)
- **Start Web Frontend**: `cd packages/web && npm run dev` (runs Vite dev server on `http://localhost:5173`)
- **Deploy**: `npx sst deploy`
