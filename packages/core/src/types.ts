export interface Trip {
  userId: string;
  flightNumber: string;
  date: string; // ISO 8601 naive scheduled departure time (e.g. 2026-05-20T14:30:00)
  arrivalTime?: string; // ISO 8601 naive arrival time (e.g. 2026-05-20T17:45:00)
  revisedArrivalTime?: string;
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  timezone?: string;
  // Delay & Status Tracking
  status?: string; // "Scheduled" | "Delayed" | "Canceled" | "Departed" | "EnRoute" | "Arrived" | "Unknown"
  revisedDate?: string; // ISO 8601 naive local departure time if delayed/revised
  delayMinutes?: number; // Minutes delayed (positive value)
  lastStatusCheck?: number; // Epoch timestamp of last live status check
  // Notification de-duplication (epoch timestamps per window)
  notified12h?: number; // Epoch when 12-hour advance notification was sent
  notifiedDeparture?: number; // Epoch when departure-window notification was sent
  // Delay-change re-notification tracking
  lastDelayNotifiedMinutes?: number; // The delayMinutes value when the last delay-change update was sent
  createdAt?: number;
  updatedAt?: number;
}

export interface Profile {
  pk?: string;
  sk?: string;
  email: string;
  homeAddress: string;
  phoneNumber: string;
  phoneVerified: boolean;
  arrivalPreference: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
  transitEnabled?: boolean;
  updatedAt?: string;
}

export interface SchedulerPayload {
  tripId: string;
  userId: string;
  homeAddress: string;
  airportCode: string;
  isDelayed?: boolean;
  delayMinutes?: number;
  isCanceled?: boolean;
  isUpdate?: boolean; // True when this is a re-notification due to a delay change
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  transitEnabled?: boolean;
}

export interface TransitStep {
  instruction?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  transitLine?: string;
  lineShortName?: string;
  transitAgency?: string;
  stopName?: string;
  departureStop?: string;
  arrivalStop?: string;
  vehicleType?: string;
  numStops?: number;
}

export interface TravelTimeInfo {
  durationSeconds: number;
  durationText: string;
  distanceMeters?: number;
  mode: "DRIVE" | "TRANSIT";
  transitLine?: string;
  transitAgency?: string;
  summary?: string;
  transitSteps?: TransitStep[];
}

export interface CtaAlert {
  id: string;
  headline: string;
  shortDescription: string;
  impact: string;
  severityScore: number;
  isMajor: boolean;
  routeId: string;
  serviceName: string;
  url?: string;
}

export interface CtaStationInfo {
  agency: "CTA";
  airportCode: "ORD" | "MDW";
  name: string;
  line: string;
  lineColor: string;
  stationLocation: string;
  fareDescription: string;
  mapId: string;
}

export interface MtaAlert {
  id: string;
  headline: string;
  shortDescription: string;
  routeId: string;
  agency?: string;
  isMajor?: boolean;
  url?: string;
}

export interface NycTransitStationInfo {
  agency: "MTA";
  airportCode: "JFK" | "LGA" | "EWR";
  name: string;
  line: string;
  lineColor: string;
  primaryLines: string[];
  stationLocation: string;
  fareDescription: string;
}

export interface TflAlert {
  id: string;
  headline: string;
  shortDescription: string;
  routeId: string;
  agency?: string;
  isMajor?: boolean;
  url?: string;
}

export interface LondonTransitStationInfo {
  agency: "TfL";
  airportCode: "LHR" | "LGW" | "STN" | "LTN" | "LCY" | "SEN";
  name: string;
  line: string;
  lineColor: string;
  primaryLines: string[];
  stationLocation: string;
  fareDescription: string;
}

export type TransitStationInfo = CtaStationInfo | NycTransitStationInfo | LondonTransitStationInfo;

export interface MultiModalTravelTime {
  drive: TravelTimeInfo;
  transit?: TravelTimeInfo;
  ctaAlerts?: CtaAlert[];
  mtaAlerts?: MtaAlert[];
  tflAlerts?: TflAlert[];
  stationInfo?: TransitStationInfo;
}

