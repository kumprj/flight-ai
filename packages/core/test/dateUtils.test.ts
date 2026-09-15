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
});

