import { describe, it, expect, vi } from "vitest";
import {
  isNycAirport,
  getNycStationInfo,
  formatMtaAlertsSummary,
  getMtaAlerts,
} from "../src/mta";
import axios from "axios";

describe("mta module", () => {
  describe("isNycAirport", () => {
    it("identifies JFK, LGA, and EWR as NYC airports", () => {
      expect(isNycAirport("JFK")).toBe(true);
      expect(isNycAirport("jfk")).toBe(true);
      expect(isNycAirport("LGA")).toBe(true);
      expect(isNycAirport("lga")).toBe(true);
      expect(isNycAirport("EWR")).toBe(true);
      expect(isNycAirport("ewr")).toBe(true);
    });

    it("returns false for non-NYC airports or undefined", () => {
      expect(isNycAirport("ORD")).toBe(false);
      expect(isNycAirport("LAX")).toBe(false);
      expect(isNycAirport(undefined)).toBe(false);
    });
  });

  describe("getNycStationInfo", () => {
    it("returns A/E train and AirTrain JFK info with OMNY fare for JFK", () => {
      const info = getNycStationInfo("JFK");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("MTA");
      expect(info?.line).toContain("AirTrain JFK");
      expect(info?.primaryLines).toContain("A");
      expect(info?.fareDescription).toContain("OMNY");
    });

    it("returns subway and LaGuardia Link Q70-SBS info with free fare for LGA", () => {
      const info = getNycStationInfo("LGA");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("MTA");
      expect(info?.line).toContain("LaGuardia Link Q70-SBS");
      expect(info?.primaryLines).toContain("7");
      expect(info?.fareDescription).toContain("FREE");
    });

    it("returns NJ Transit and AirTrain Newark info for EWR", () => {
      const info = getNycStationInfo("EWR");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("MTA");
      expect(info?.line).toContain("AirTrain Newark");
      expect(info?.primaryLines).toContain("NJ Transit");
    });

    it("returns null for non-NYC airports", () => {
      expect(getNycStationInfo("SFO")).toBeNull();
    });
  });

  describe("formatMtaAlertsSummary", () => {
    it("returns normal service when no alerts are present", () => {
      const summary = formatMtaAlertsSummary([], "A Train");
      expect(summary).toBe("A Train: Normal service");
    });

    it("highlights major alert when present", () => {
      const alerts = [
        {
          id: "mta-1",
          headline: "Delays on A Train",
          shortDescription: "Delays due to signal malfunction at Howard Beach",
          routeId: "A",
          agency: "MTASBWY",
          isMajor: true,
        },
      ];
      const summary = formatMtaAlertsSummary(alerts, "MTA Subway");
      expect(summary).toContain("Delays on A Train");
      expect(summary).toContain("⚠️");
    });
  });

  describe("getMtaAlerts live fetch error handling", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getMtaAlerts("JFK");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });
  });
});
