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
});
