import { describe, it, expect } from "vitest";
import {
  getAirportTimezone,
  getAirportAddress,
  getAirportLabel,
} from "../src/airports";

describe("airports module", () => {
  describe("getAirportTimezone", () => {
    it("returns correct timezone for valid IATAs", () => {
      expect(getAirportTimezone("JFK")).toBe("America/New_York");
      expect(getAirportTimezone("LAX")).toBe("America/Los_Angeles");
      expect(getAirportTimezone("ORD")).toBe("America/Chicago");
      expect(getAirportTimezone("lhr")).toBe("Europe/London"); // case insensitive
    });

    it("returns America/Chicago as fallback for unknown IATA", () => {
      expect(getAirportTimezone("UNKNOWN")).toBe("America/Chicago");
    });

    it("returns America/Chicago for empty string or undefined", () => {
      expect(getAirportTimezone("")).toBe("America/Chicago");
      // @ts-expect-error - testing invalid input
      expect(getAirportTimezone(undefined)).toBe("America/Chicago");
    });
  });

  describe("getAirportAddress", () => {
    it("returns formatted address for known IATA", () => {
      expect(getAirportAddress("JFK")).toBe(
        "John F. Kennedy International Airport, New York, NY"
      );
      expect(getAirportAddress("LHR")).toBe("London Heathrow Airport, London, UK");
    });

    it("returns generic fallback address for unknown IATA", () => {
      expect(getAirportAddress("UNK")).toBe("UNK Airport");
    });
  });

  describe("getAirportLabel", () => {
    it("returns formatted label for known IATA", () => {
      expect(getAirportLabel("JFK")).toBe("JFK – New York, NY");
      expect(getAirportLabel("LHR")).toBe("LHR – London, UK");
    });

    it("returns IATA itself as label for unknown IATA", () => {
      expect(getAirportLabel("UNK")).toBe("UNK");
    });
  });
});
