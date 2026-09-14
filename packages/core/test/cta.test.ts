import { describe, it, expect, vi } from "vitest";
import {
  isChicagoAirport,
  getCtaStationInfo,
  formatCtaAlertsSummary,
  getCtaAlerts,
} from "../src/cta";
import axios from "axios";

describe("cta module", () => {
  describe("isChicagoAirport", () => {
    it("identifies ORD and MDW as Chicago airports", () => {
      expect(isChicagoAirport("ORD")).toBe(true);
      expect(isChicagoAirport("ord")).toBe(true);
      expect(isChicagoAirport("MDW")).toBe(true);
      expect(isChicagoAirport("mdw")).toBe(true);
    });

    it("returns false for non-Chicago airports or undefined", () => {
      expect(isChicagoAirport("JFK")).toBe(false);
      expect(isChicagoAirport("LAX")).toBe(false);
      expect(isChicagoAirport(undefined)).toBe(false);
    });
  });

  describe("getCtaStationInfo", () => {
    it("returns Blue Line and Ventra fare details for O'Hare (ORD)", () => {
      const info = getCtaStationInfo("ORD");
      expect(info).toBeDefined();
      expect(info?.line).toBe("Blue Line");
      expect(info?.mapId).toBe("40890");
      expect(info?.fareDescription).toContain("Ventra");
    });

    it("returns Orange Line and Ventra fare details for Midway (MDW)", () => {
      const info = getCtaStationInfo("MDW");
      expect(info).toBeDefined();
      expect(info?.line).toBe("Orange Line");
      expect(info?.mapId).toBe("40930");
      expect(info?.fareDescription).toContain("Ventra");
    });

    it("returns null for non-Chicago airports", () => {
      expect(getCtaStationInfo("SFO")).toBeNull();
    });
  });

  describe("formatCtaAlertsSummary", () => {
    it("returns normal service when no alerts are present", () => {
      const summary = formatCtaAlertsSummary([], "Blue Line");
      expect(summary).toBe("Blue Line: Normal service");
    });

    it("highlights major alert when present", () => {
      const alerts = [
        {
          id: "1",
          headline: "Track Work Delays",
          shortDescription: "Trains operating with 15 min delays between Rosemont and O'Hare.",
          impact: "Delay",
          severityScore: 60,
          isMajor: true,
          routeId: "Blue",
          serviceName: "Blue Line",
        },
      ];
      const summary = formatCtaAlertsSummary(alerts, "Blue Line");
      expect(summary).toContain("Track Work Delays");
      expect(summary).toContain("⚠️");
    });
  });

  describe("getCtaAlerts live fetch error handling", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getCtaAlerts("ORD");
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });
  });
});
