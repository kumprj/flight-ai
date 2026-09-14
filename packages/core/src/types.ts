export interface Trip {
  userId: string;
  flightNumber: string;
  date: string; // ISO 8601
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  timezone?: string;
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
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  transitEnabled?: boolean;
}

export interface TravelTimeInfo {
  durationSeconds: number;
  durationText: string;
  distanceMeters?: number;
  mode: "DRIVE" | "TRANSIT";
  transitLine?: string;
  transitAgency?: string;
  summary?: string;
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

export type TransitStationInfo = CtaStationInfo | NycTransitStationInfo;

export interface MultiModalTravelTime {
  drive: TravelTimeInfo;
  transit?: TravelTimeInfo;
  ctaAlerts?: CtaAlert[];
  mtaAlerts?: MtaAlert[];
  stationInfo?: TransitStationInfo;
}

