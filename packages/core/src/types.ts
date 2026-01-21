export interface Trip {
  userId: string;
  flightNumber: string;
  date: string; // ISO 8601
  airportCode: string;
  homeAddress: string;
}

export interface SchedulerPayload {
  tripId: string;
  userId: string;
  homeAddress: string;
  airportCode: string;
}
