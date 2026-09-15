import { describe, it, expect, vi } from "vitest";
import {
  isBostonAirport,
  getMbtaStationInfo,
  getMbtaAlerts,
  formatMbtaAlertsSummary,
  mbtaToTransitAlerts,
} from "../src/mbta";
import axios from "axios";

describe("mbta module", () => {
  describe("isBostonAirport", () => {
    it("identifies BOS as a Boston airport", () => {
      expect(isBostonAirport("BOS")).toBe(true);
      expect(isBostonAirport("bos")).toBe(true);
    });

    it("returns false for non-Boston airports or undefined", () => {
      expect(isBostonAirport("ORD")).toBe(false);
      expect(isBostonAirport("JFK")).toBe(false);
      expect(isBostonAirport("SFO")).toBe(false);
      expect(isBostonAirport(undefined)).toBe(false);
    });
  });

  describe("getMbtaStationInfo", () => {
    it("returns Silver/Blue line info for BOS", () => {
      const info = getMbtaStationInfo("BOS");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("MBTA");
      expect(info?.airportCode).toBe("BOS");
      expect(info?.line).toContain("Silver");
      expect(info?.primaryLines).toEqual(["SL1", "SL3", "Blue"]);
      expect(info?.fareDescription).toContain("CharlieCard");
    });

    it("returns null for non-Boston airports", () => {
      expect(getMbtaStationInfo("LHR")).toBeNull();
      expect(getMbtaStationInfo(undefined)).toBeNull();
    });
  });

  describe("formatMbtaAlertsSummary", () => {
    it("returns normal service when no alerts are present", () => {
      const summary = formatMbtaAlertsSummary([], "MBTA Transit");
      expect(summary).toBe("MBTA Transit: Normal service");
    });

    it("highlights major alert when present", () => {
      const alerts = [
        {
          id: "1",
          headline: "Delay on Blue Line",
          shortDescription: "Track work causing 20 min delays on Blue Line",
          severity: 5,
          lifecycle: "NEW",
          isMajor: true,
          effect: "DELAY",
        },
      ];
      const summary = formatMbtaAlertsSummary(alerts, "Blue Line");
      expect(summary).toContain("⚠️ Blue Line: Delay on Blue Line");
    });

    it("formats minor alert with info icon", () => {
      const alerts = [
        {
          id: "2",
          headline: "Advisory",
          shortDescription: "Elevator out of service at Airport station",
          severity: 3,
          lifecycle: "ONGOING",
          isMajor: false,
          effect: "STATION_ISSUE",
        },
      ];
      const summary = formatMbtaAlertsSummary(alerts, "Blue Line");
      expect(summary).toContain("ℹ️ Blue Line: Advisory");
    });
  });

  describe("getMbtaAlerts", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getMbtaAlerts("BOS");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });

    it("filters alerts by airport primary lines", async () => {
      const incidentsResponse = {
        data: {
          data: [
            {
              id: "alert-1",
              attributes: {
                header: "Blue Line delays",
                description: "Blue line delays due to signal problem",
                effect: "DELAY",
                severity: 7,
                lifecycle: "NEW",
                informed_entity: [{ route: "Blue", route_type: 1 }]
              }
            },
            {
              id: "alert-2",
              attributes: {
                header: "Red line maintenance",
                description: "Red line maintenance",
                effect: "DETOUR",
                severity: 3,
                lifecycle: "ONGOING",
                informed_entity: [{ route: "Red", route_type: 1 }]
              }
            },
          ],
        },
      };

      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce(incidentsResponse);
      const bosAlerts = await getMbtaAlerts("BOS");
      expect(bosAlerts).toHaveLength(1);
      expect(bosAlerts[0].id).toBe("alert-1");
      expect(bosAlerts[0].isMajor).toBe(true);
      expect(bosAlerts[0].headline).toBe("Blue Line delays");
      spy.mockRestore();
    });

    it("returns empty array if response data format is unexpected", async () => {
      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: {} });
      const alerts = await getMbtaAlerts("BOS");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });
  });

  describe("mbtaToTransitAlerts", () => {
    it("normalises native MBTA alerts to TransitAlert shape", () => {
      const nativeAlerts = [
        {
          id: "mbta-101",
          headline: "Delay",
          shortDescription: "Blue Line train holding due to inspection",
          severity: 5,
          lifecycle: "NEW",
          isMajor: true,
          effect: "DELAY",
        },
      ];

      const normalised = mbtaToTransitAlerts(nativeAlerts);
      expect(normalised).toHaveLength(1);
      expect(normalised[0]).toEqual({
        id: "mbta-101",
        headline: "Delay",
        shortDescription: "Blue Line train holding due to inspection",
        isMajor: true,
        agency: "MBTA",
        routeId: "MBTA",
      });
    });
  });
});
