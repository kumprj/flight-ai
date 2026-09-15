import { describe, it, expect, vi } from "vitest";
import {
  parseFlightTimeToUTC,
  calculateHoursUntilFlight,
  calculateLeaveTime,
  formatFlightDate,
  formatFlightTimeOnly,
  formatFlightTime,
  formatLeaveTime,
  resolveTimezone,
  normalizeFlightNumber,
  getTripDateOnly,
  isTripAlreadyTracked,
  filterNewFlights,
  shouldAlertDriveTimeChange,
  calculateDaysAway,
} from "../src/dateUtils";

describe("dateUtils", () => {
  describe("resolveTimezone", () => {
    it("returns America/Chicago when input is missing or empty", () => {
      expect(resolveTimezone()).toBe("America/Chicago");
      expect(resolveTimezone("")).toBe("America/Chicago");
    });
  });

  describe("parseFlightTimeToUTC", () => {
    it("correctly converts Chicago summer departure (CDT UTC-5) to UTC", () => {
      // 14:30 CDT on May 20 -> 19:30 UTC
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00", "ORD");
      expect(utc.toISOString()).toBe("2026-05-20T19:30:00.000Z");
    });

    it("correctly converts Chicago winter departure (CST UTC-6) to UTC", () => {
      // 14:30 CST on Jan 15 -> 20:30 UTC
      const utc = parseFlightTimeToUTC("2026-01-15T14:30:00", "ORD");
      expect(utc.toISOString()).toBe("2026-01-15T20:30:00.000Z");
    });

    it("correctly converts Los Angeles departure (PDT UTC-7) to UTC", () => {
      // 14:30 PDT on May 20 -> 21:30 UTC
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00", "LAX");
      expect(utc.toISOString()).toBe("2026-05-20T21:30:00.000Z");
    });

    it("handles IANA timezone string directly if passed instead of IATA", () => {
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00", "America/New_York");
      expect(utc.toISOString()).toBe("2026-05-20T18:30:00.000Z");
    });

    it("strips trailing Z or offset suffixes safely if present in stored string", () => {
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00Z", "ORD");
      expect(utc.toISOString()).toBe("2026-05-20T19:30:00.000Z");
    });

    it("strips suffix + offset strings correctly", () => {
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00+04:00", "ORD");
      expect(utc.toISOString()).toBe("2026-05-20T19:30:00.000Z");
    });

    it("falls back to America/Chicago if unknown airport code provided", () => {
      const utc = parseFlightTimeToUTC("2026-05-20T14:30:00", "UNKNOWN_AIRPORT");
      expect(utc.toISOString()).toBe("2026-05-20T19:30:00.000Z");
    });

    it("throws an error if naiveIsoString is empty or missing", () => {
      expect(() => parseFlightTimeToUTC("", "ORD")).toThrow("naiveIsoString is required");
    });

    it("throws an error if parsed date is NaN", () => {
      expect(() => parseFlightTimeToUTC("INVALID-DATE", "ORD")).toThrow("Invalid date string");
    });
  });

  describe("calculateHoursUntilFlight", () => {
    it("calculates exact floating-point hours difference", () => {
      const flightUTC = new Date("2026-05-20T19:30:00.000Z");
      const now = new Date("2026-05-20T07:30:00.000Z"); // 12 hours prior
      expect(calculateHoursUntilFlight(flightUTC, now)).toBe(12);
    });
  });

  describe("calculateLeaveTime", () => {
    it("subtracts travel time and arrival buffer from flight departure UTC", () => {
      // Flight at 19:30 UTC, 45 min drive, 2 hours arrival preference -> leave 2h45m before (16:45 UTC)
      const flightUTC = new Date("2026-05-20T19:30:00.000Z");
      const leaveUTC = calculateLeaveTime(flightUTC, 45, 2);
      expect(leaveUTC.toISOString()).toBe("2026-05-20T16:45:00.000Z");
    });
  });

  describe("formatLeaveTime and formatting utilities", () => {
    it("formats leave time in the airport local timezone", () => {
      const leaveUTC = new Date("2026-05-20T16:45:00.000Z");
      // 16:45 UTC in Chicago (CDT UTC-5) is 11:45 AM
      expect(formatLeaveTime(leaveUTC, "ORD")).toBe("11:45 AM");
    });

    it("formats flight date and time correctly without machine local timezone corruption", () => {
      // 14:30 local in LAX
      expect(formatFlightDate("2026-05-20T14:30:00", "LAX")).toBe("May 20, 2026");
      expect(formatFlightTimeOnly("2026-05-20T14:30:00", "LAX")).toBe("2:30 PM");
      expect(formatFlightTime("2026-05-20T14:30:00", "LAX", "h:mm a")).toBe("2:30 PM");
    });

    it("catches error in formatFlightTime and returns original string", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Passes an invalid string to parseFlightTimeToUTC, causing an error to be thrown and caught.
      const result = formatFlightTime("INVALID_ISO", "ORD");
      expect(result).toBe("INVALID_ISO");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("normalizeFlightNumber", () => {
    it("trims whitespace and converts to uppercase", () => {
      expect(normalizeFlightNumber(" ua 123 ")).toBe("UA123");
      expect(normalizeFlightNumber("aa-456")).toBe("AA-456");
      expect(normalizeFlightNumber("dl  789")).toBe("DL789");
    });

    it("returns empty string for missing or undefined values", () => {
      expect(normalizeFlightNumber()).toBe("");
      expect(normalizeFlightNumber("")).toBe("");
    });
  });

  describe("getTripDateOnly", () => {
    it("extracts YYYY-MM-DD from ISO datetime strings", () => {
      expect(getTripDateOnly("2026-05-20T14:30:00")).toBe("2026-05-20");
      expect(getTripDateOnly("2026-05-20 14:30:00")).toBe("2026-05-20");
    });

    it("returns date string if already YYYY-MM-DD", () => {
      expect(getTripDateOnly("2026-05-20")).toBe("2026-05-20");
    });

    it("returns empty string for missing values", () => {
      expect(getTripDateOnly()).toBe("");
      expect(getTripDateOnly("")).toBe("");
    });
  });

  describe("isTripAlreadyTracked", () => {
    const existingTrips = [
      {
        flightNumber: "UA123",
        date: "2026-05-20T14:30:00",
      },
      {
        flightNumber: "AA456",
        date: "2026-05-21T23:55:00",
        revisedDate: "2026-05-22T01:30:00",
      },
      {
        flightNumber: "DL789",
        date: "2026-06-01",
      },
    ];

    it("returns true when flight number and date match scheduled date", () => {
      expect(
        isTripAlreadyTracked(
          { flightNumber: "UA123", date: "2026-05-20" },
          existingTrips
        )
      ).toBe(true);
    });

    it("normalizes case and spacing when comparing flight numbers", () => {
      expect(
        isTripAlreadyTracked(
          { flightNumber: " ua 123 ", date: "2026-05-20" },
          existingTrips
        )
      ).toBe(true);
    });

    it("returns true when flight date matches revisedDate across midnight", () => {
      expect(
        isTripAlreadyTracked(
          { flightNumber: "AA456", date: "2026-05-22" },
          existingTrips
        )
      ).toBe(true);
      expect(
        isTripAlreadyTracked(
          { flightNumber: "AA456", date: "2026-05-21" },
          existingTrips
        )
      ).toBe(true);
    });

    it("returns false when flight number matches but date is different", () => {
      // Same flight, different day
      expect(
        isTripAlreadyTracked(
          { flightNumber: "UA123", date: "2026-05-27" },
          existingTrips
        )
      ).toBe(false);
    });

    it("returns false when date matches but flight number is different", () => {
      expect(
        isTripAlreadyTracked(
          { flightNumber: "WN999", date: "2026-05-20" },
          existingTrips
        )
      ).toBe(false);
    });

    it("returns false for invalid or empty inputs", () => {
      expect(isTripAlreadyTracked({ flightNumber: "", date: "" }, existingTrips)).toBe(false);
      expect(isTripAlreadyTracked({ flightNumber: "UA123", date: "" }, existingTrips)).toBe(false);
      expect(isTripAlreadyTracked({ flightNumber: "", date: "2026-05-20" }, existingTrips)).toBe(false);
    });
  });

  describe("filterNewFlights", () => {
    const existingTrips = [
      { flightNumber: "UA123", date: "2026-05-20T14:30:00" },
      { flightNumber: "BA117", date: "2026-06-10T09:00:00" },
    ];

    it("filters out flights that are already tracked and keeps net new flights", () => {
      const candidates = [
        { flightNumber: "UA123", date: "2026-05-20", eventTitle: "Flight to ORD" },
        { flightNumber: "DL456", date: "2026-05-25", eventTitle: "Flight to ATL" },
        { flightNumber: "BA117", date: "2026-06-10", eventTitle: "Flight to LHR" },
        { flightNumber: "UA123", date: "2026-06-20", eventTitle: "Future UA123" },
      ];

      const result = filterNewFlights(candidates, existingTrips);

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.flightNumber)).toEqual(["DL456", "UA123"]);
      expect(result[1].date).toBe("2026-06-20");
    });

    it("returns all candidates when existingTrips is empty", () => {
      const candidates = [
        { flightNumber: "UA123", date: "2026-05-20" },
      ];
      expect(filterNewFlights(candidates, [])).toEqual(candidates);
    });

    it("returns empty array when all candidate flights are already tracked", () => {
      const candidates = [
        { flightNumber: "UA123", date: "2026-05-20" },
        { flightNumber: "BA117", date: "2026-06-10" },
      ];
      expect(filterNewFlights(candidates, existingTrips)).toHaveLength(0);
    });

    it("handles non-array or empty candidate inputs safely", () => {
      expect(filterNewFlights([] as any, existingTrips)).toEqual([]);
      expect(filterNewFlights(null as any, existingTrips)).toEqual([]);
    });
  });

  describe("shouldAlertDriveTimeChange", () => {
    it("returns false when lastNotifiedDriveMinutes is undefined or null", () => {
      expect(shouldAlertDriveTimeChange(45, undefined)).toBe(false);
      expect(shouldAlertDriveTimeChange(45, null as any)).toBe(false);
    });

    it("returns false when difference is less than or equal to 15 minutes", () => {
      // Exactly 15 minutes
      expect(shouldAlertDriveTimeChange(45, 30)).toBe(false);
      expect(shouldAlertDriveTimeChange(30, 45)).toBe(false);

      // Within 15 minutes
      expect(shouldAlertDriveTimeChange(35, 30)).toBe(false);
      expect(shouldAlertDriveTimeChange(25, 30)).toBe(false);
      expect(shouldAlertDriveTimeChange(30, 30)).toBe(false);
      expect(shouldAlertDriveTimeChange(44, 30)).toBe(false);
      expect(shouldAlertDriveTimeChange(16, 30)).toBe(false);
    });

    it("returns true when drive time increases by strictly greater than 15 minutes", () => {
      // 16 minutes increase
      expect(shouldAlertDriveTimeChange(46, 30)).toBe(true);
      // 30 minutes increase
      expect(shouldAlertDriveTimeChange(60, 30)).toBe(true);
      // Double the time
      expect(shouldAlertDriveTimeChange(90, 40)).toBe(true);
    });

    it("returns true when drive time decreases by strictly greater than 15 minutes", () => {
      // 16 minutes decrease
      expect(shouldAlertDriveTimeChange(14, 30)).toBe(true);
      // 25 minutes decrease
      expect(shouldAlertDriveTimeChange(20, 45)).toBe(true);
    });

    it("respects custom threshold parameter if provided", () => {
      // Custom threshold 10m
      expect(shouldAlertDriveTimeChange(41, 30, 10)).toBe(true);
      expect(shouldAlertDriveTimeChange(40, 30, 10)).toBe(false);
      // Custom threshold 20m
      expect(shouldAlertDriveTimeChange(46, 30, 20)).toBe(false);
      expect(shouldAlertDriveTimeChange(51, 30, 20)).toBe(true);
    });
  });

  describe("calculateDaysAway", () => {
    // Reference date: May 20, 2026 at 10:00 AM
    const refDate = new Date(2026, 4, 20, 10, 0, 0);

    it("returns 'Today' with urgency 'today' when flight departure is on reference day", () => {
      // Same day early morning
      const earlyRes = calculateDaysAway("2026-05-20T06:30:00", refDate);
      expect(earlyRes).toEqual({ diffDays: 0, label: "Today", urgency: "today" });

      // Same day late evening
      const lateRes = calculateDaysAway("2026-05-20T23:45:00", refDate);
      expect(lateRes).toEqual({ diffDays: 0, label: "Today", urgency: "today" });
    });

    it("returns 'Tomorrow' with urgency 'tomorrow' when flight departure is 1 day away", () => {
      const res = calculateDaysAway("2026-05-21T07:15:00", refDate);
      expect(res).toEqual({ diffDays: 1, label: "Tomorrow", urgency: "tomorrow" });
    });

    it("returns 'X days away' with urgency 'upcoming' for future flights > 1 day away", () => {
      const res2 = calculateDaysAway("2026-05-22T14:30:00", refDate);
      expect(res2).toEqual({ diffDays: 2, label: "2 days away", urgency: "upcoming" });

      const res5 = calculateDaysAway("2026-05-25T18:00:00", refDate);
      expect(res5).toEqual({ diffDays: 5, label: "5 days away", urgency: "upcoming" });

      const res30 = calculateDaysAway("2026-06-19T09:00:00", refDate);
      expect(res30).toEqual({ diffDays: 30, label: "30 days away", urgency: "upcoming" });
    });

    it("returns 'Yesterday' with urgency 'past' when flight departure was 1 day ago", () => {
      const res = calculateDaysAway("2026-05-19T18:30:00", refDate);
      expect(res).toEqual({ diffDays: -1, label: "Yesterday", urgency: "past" });
    });

    it("returns 'X days ago' with urgency 'past' for flights > 1 day in the past", () => {
      const res2 = calculateDaysAway("2026-05-18T12:00:00", refDate);
      expect(res2).toEqual({ diffDays: -2, label: "2 days ago", urgency: "past" });

      const res10 = calculateDaysAway("2026-05-10T14:00:00", refDate);
      expect(res10).toEqual({ diffDays: -10, label: "10 days ago", urgency: "past" });
    });

    it("handles empty or invalid date strings safely", () => {
      expect(calculateDaysAway("", refDate)).toEqual({ diffDays: 0, label: "", urgency: "upcoming" });
      expect(calculateDaysAway("invalid-date", refDate)).toEqual({ diffDays: 0, label: "", urgency: "upcoming" });
    });
  });
});


