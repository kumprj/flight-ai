# Make My Flight

A smart flight tracking application that uses your home address and historical/present traffic data to alert you when to depart for your flight. Set your preferences for arrival time, and receive email and SMS alerts about drive times - sent the night before and a few hours before departure.

## Features

- **Trip Management**: Create, edit, and manage flight trips with departure times and preferences
- **Smart Departure Alerts**: Get notified about optimal departure times based on live and predicted traffic
- **Flight Search**: Search for flights by flight number or route using AeroDataBox (RapidAPI)
- **Google Calendar Import**: Automatically scan and import flights from your connected Google Calendar
- **Profile Management**: Set your default home address, phone number, arrival buffer (default 2 hrs), and notification preferences
- **Multi-channel Alerts**: Receive notifications via email (AWS SES) and SMS (Twilio) with opt-in/opt-out toggles
- **Authentication**: Secure authentication via AWS Cognito with Google and Facebook OAuth support
- **Real-time Traffic Analysis**: Uses Google Maps Routes API for accurate traffic-aware drive time estimates
- **Multi-Modal Transit Alerts**: Compare Drive vs. Public Transit departure times with live service alerts for supported cities (Chicago, New York, Boston, San Francisco, Washington D.C., London)

## Architecture

This is a monorepo built with SST (Serverless Stack) using AWS serverless services:

### Packages

- **`packages/core`**: Shared utilities and AWS SDK clients (DynamoDB, Scheduler, Twilio integration)
- **`packages/functions`**: Lambda functions for API endpoints and background workers
- **`packages/web`**: React frontend with Vite and TailwindCSS

### AWS Infrastructure

- **DynamoDB**: Stores trips, user profiles, and flight data
- **Cognito User Pool**: User authentication with Google OAuth provider
- **API Gateway v2**: REST API with JWT authorization
- **Lambda Functions**: 
  - Trip CRUD operations
  - Flight search
  - Profile management
  - Notification worker (scheduled via AWS Scheduler)
  - Hourly cron job for trip checks
- **EventBridge**: Triggers hourly trip check cron job
- **AWS SES**: Email notifications
- **AWS Scheduler**: Schedules notification alerts

## Tech Stack

### Frontend
- React 19
- Vite
- TailwindCSS v4
- AWS Amplify UI
- React Router v7
- TanStack React Query
- date-fns-tz (timezone handling)

### Backend
- SST v3
- AWS SDK v3 (DynamoDB, Scheduler, SES)
- TypeScript
- Twilio SDK
- Axios

### APIs
- Google Maps API (traffic & directions)
- AeroDataBox API via RapidAPI (flight schedule and route data)
- Twilio API (SMS verification & alerts)

## Getting Started

### Prerequisites

- Node.js 18+
- AWS account with appropriate permissions
- Google Cloud account (for OAuth and Maps)
- Twilio account (for SMS)
- AeroDataBox (RapidAPI) API key

### Environment Variables

Create a `.env` file in the root directory with:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_MAPS_KEY=your_google_maps_api_key
VITE_GOOGLE_MAPS_KEY=your_google_maps_client_key
TWILIO_SID=your_twilio_sid
TWILIO_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=your_twilio_phone_number
AERODATABOX_API_KEY=your_aerodatabox_key
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
```

### Installation

```bash
# Install dependencies
npm install
```

### Local Development

```bash
# Start SST in development mode (this provisions local AWS resources)
npm run dev

# In another terminal, start the web frontend
cd packages/web
npm run dev
```

The web app will be available at `http://localhost:5173`

### Deployment

```bash
# Deploy to AWS (uses SST stage from environment or defaults)
npm run deploy

# Remove all AWS resources
npm run remove
```

## API Endpoints

All endpoints require JWT authentication unless noted otherwise.

### Trips
- `POST /trips` - Create a new trip
- `GET /trips` - List all trips for authenticated user

### Flights
- `GET /flights/search` - Search for flights (authenticated)

### Profile
- `GET /profile` - Get user profile (no auth required - decodes JWT manually)
- `PUT /profile` - Update user profile
- `POST /profile/verify/send` - Send phone verification code
- `POST /profile/verify/confirm` - Confirm phone verification code

## Project Structure

```
flight-ai/
├── packages/
│   ├── core/           # Shared utilities and AWS clients
│   │   └── src/
│   │       ├── dynamodb.ts    # DynamoDB helpers
│   │       ├── flights.ts     # Flight API integration
│   │       ├── maps.ts        # Google Maps integration
│   │       ├── twilio.ts      # Twilio SMS integration
│   │       └── types.ts       # Shared TypeScript types
│   ├── functions/      # Lambda functions
│   │   └── src/
│   │       ├── trip.ts        # Trip CRUD handlers
│   │       ├── flight.ts      # Flight search handler
│   │       ├── profile.ts     # Profile management handlers
│   │       ├── notify.ts      # Notification worker
│   │       └── cron.ts        # Hourly trip check cron
│   └── web/            # React frontend
│       └── src/
│           ├── App.tsx        # Main application
│           ├── Trips.tsx      # Trip management UI
│           ├── Profile.tsx    # Profile settings UI
│           └── config.ts      # AWS Amplify config
├── stacks/              # Additional SST stacks
├── sst.config.ts        # SST infrastructure configuration
└── package.json         # Root package.json
```

## How It Works

1. **User Setup**: Users sign up via Google OAuth and set their home address and phone number in their profile
2. **Trip Creation**: Users create trips with flight details (departure airport, flight time, arrival preference)
3. **Traffic Analysis**: The system uses Google Maps API to calculate drive times from home to airport
4. **Scheduled Alerts**: 
   - Night-before alert: Sent with initial departure recommendation
   - Pre-departure alert: Sent a few hours before with updated traffic conditions
5. **Hourly Checks**: A cron job runs every hour to check for upcoming trips and schedule notifications
6. **Notification Delivery**: The notify worker sends emails via AWS SES and SMS via Twilio


### To Deploy AWS Resources:

npx sst deploy from root

## License

Private project