export interface Trip {
  userId: string;
  flightNumber: string;
  date: string; // ISO 8601 naive scheduled departure time (e.g. 2026-05-20T14:30:00)
  originAirport: string;
  destinationAirport: string;
  homeAddress: string;
  timezone?: string;
  // Delay & Status Tracking
  status?: string; // "Scheduled" | "Delayed" | "Canceled" | "Departed" | "EnRoute" | "Arrived" | "Unknown"
  revisedDate?: string; // ISO 8601 naive local departure time if delayed/revised
  delayMinutes?: number; // Minutes delayed (positive value)
  lastStatusCheck?: number; // Epoch timestamp of last live status check
  notifiedAt?: number; // Epoch timestamp of notification sent
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
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
}
