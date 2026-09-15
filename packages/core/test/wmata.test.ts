import { describe, it, expect, vi } from "vitest";
import {
  isDcAirport,
  getWmataStationInfo,
  getWmataAlerts,
  formatWmataAlertsSummary,
  wmataToTransitAlerts,
} from "../src/wmata";
import axios from "axios";

describe("wmata module", () => {
  describe("isDcAirport", () => {
    it("identifies DCA and IAD as DC airports", () => {
      expect(isDcAirport("DCA")).toBe(true);
      expect(isDcAirport("dca")).toBe(true);
      expect(isDcAirport("IAD")).toBe(true);
      expect(isDcAirport("iad")).toBe(true);
    });

    it("returns false for non-DC airports or undefined", () => {
      expect(isDcAirport("ORD")).toBe(false);
      expect(isDcAirport("JFK")).toBe(false);
      expect(isDcAirport("SFO")).toBe(false);
      expect(isDcAirport(undefined)).toBe(false);
    });
  });

  describe("getWmataStationInfo", () => {
    it("returns Blue/Yellow line info for DCA", () => {
      const info = getWmataStationInfo("DCA");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("WMATA");
      expect(info?.airportCode).toBe("DCA");
      expect(info?.line).toContain("Blue / Yellow");
      expect(info?.primaryLines).toEqual(["BL", "YL"]);
      expect(info?.fareDescription).toContain("SmarTrip");
    });

    it("returns Silver line info for IAD", () => {
      const info = getWmataStationInfo("IAD");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("WMATA");
      expect(info?.airportCode).toBe("IAD");
      expect(info?.line).toContain("Silver");
      expect(info?.primaryLines).toEqual(["SV"]);
      expect(info?.fareDescription).toContain("SmarTrip");
    });

    it("returns null for non-DC airports", () => {
      expect(getWmataStationInfo("LHR")).toBeNull();
      expect(getWmataStationInfo(undefined)).toBeNull();
    });
  });

  describe("formatWmataAlertsSummary", () => {
    it("returns normal service when no alerts are present", () => {
      const summary = formatWmataAlertsSummary([], "WMATA Metro");
      expect(summary).toBe("WMATA Metro: Normal service");
    });

    it("highlights major alert when present", () => {
      const alerts = [
        {
          id: "1",
          headline: "Delay",
          shortDescription: "Track work causing 20 min delays on Silver Line",
          linesAffected: ["SV"],
          incidentType: "Delay",
          isMajor: true,
        },
      ];
      const summary = formatWmataAlertsSummary(alerts, "Silver Line");
      expect(summary).toContain("⚠️ Silver Line: Delay - Track work");
    });

    it("formats minor alert with info icon", () => {
      const alerts = [
        {
          id: "2",
          headline: "Advisory",
          shortDescription: "Elevator out of service at Dulles station",
          linesAffected: ["SV"],
          incidentType: "Advisory",
          isMajor: false,
        },
      ];
      const summary = formatWmataAlertsSummary(alerts, "Silver Line");
      expect(summary).toContain("ℹ️ Silver Line: Advisory - Elevator");
    });
  });

  describe("getWmataAlerts", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getWmataAlerts("IAD");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });

    it("filters alerts by airport primary lines", async () => {
      const incidentsResponse = {
        data: {
          Incidents: [
            {
              IncidentID: "inc-1",
              IncidentType: "Delay",
              Description: "Silver line delays due to signal problem",
              LinesAffected: "SV;",
              DelaySeverity: "Major",
            },
            {
              IncidentID: "inc-2",
              IncidentType: "Delay",
              Description: "Red line maintenance",
              LinesAffected: "RD;",
              DelaySeverity: "Minor",
            },
          ],
        },
      };

      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce(incidentsResponse);
      const iadAlerts = await getWmataAlerts("IAD");
      expect(iadAlerts).toHaveLength(1);
      expect(iadAlerts[0].id).toBe("inc-1");
      expect(iadAlerts[0].isMajor).toBe(true);
      expect(iadAlerts[0].linesAffected).toEqual(["SV"]);
      spy.mockRestore();
    });

    it("returns empty array if response data format is unexpected", async () => {
      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: {} });
      const alerts = await getWmataAlerts("DCA");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });
  });

  describe("wmataToTransitAlerts", () => {
    it("normalises native WMATA alerts to TransitAlert shape", () => {
      const nativeAlerts = [
        {
          id: "wmata-101",
          headline: "Delay",
          shortDescription: "Silver Line train holding due to inspection",
          linesAffected: ["SV"],
          incidentType: "Delay",
          isMajor: true,
        },
      ];

      const normalised = wmataToTransitAlerts(nativeAlerts);
      expect(normalised).toHaveLength(1);
      expect(normalised[0]).toEqual({
        id: "wmata-101",
        headline: "Delay: Silver Line train holding due to inspection",
        shortDescription: "Silver Line train holding due to inspection",
        isMajor: true,
        agency: "WMATA",
        routeId: "SV",
      });
    });
  });
});
