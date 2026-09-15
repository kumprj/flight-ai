import { describe, it, expect, vi } from "vitest";
import {
  isBartAirport,
  getBartStationInfo,
  formatBartAlertsSummary,
  getBartAlerts,
} from "../src/bart";
import axios from "axios";

describe("bart module", () => {
  describe("isBartAirport", () => {
    it("identifies SFO and OAK as BART airports", () => {
      expect(isBartAirport("SFO")).toBe(true);
      expect(isBartAirport("sfo")).toBe(true);
      expect(isBartAirport("OAK")).toBe(true);
      expect(isBartAirport("oak")).toBe(true);
    });

    it("returns false for non-BART airports or undefined", () => {
      expect(isBartAirport("JFK")).toBe(false);
      expect(isBartAirport("ORD")).toBe(false);
      expect(isBartAirport(undefined)).toBe(false);
    });
  });

  describe("getBartStationInfo", () => {
    it("returns Antioch-SFO/Millbrae line info for SFO", () => {
      const info = getBartStationInfo("SFO");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("BART");
      expect(info?.line).toContain("SFO");
      expect(info?.fareDescription).toContain("Clipper");
    });

    it("returns Oakland Airport line info for OAK", () => {
      const info = getBartStationInfo("OAK");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("BART");
      expect(info?.line).toContain("OAK");
      expect(info?.fareDescription).toContain("Clipper");
    });

    it("returns null for non-BART airports", () => {
      expect(getBartStationInfo("LAX")).toBeNull();
    });
  });

  describe("formatBartAlertsSummary", () => {
    it("returns normal service when no alerts are present", () => {
      const summary = formatBartAlertsSummary([], "BART to SFO");
      expect(summary).toBe("BART to SFO: Normal service");
    });

    it("highlights major alert when present using DELAY text", () => {
      const alerts = [
        {
          id: "1",
          station: "BART",
          type: "INFO",
          description: "Expect 15 minute delays.",
          sms_text: "15 min delay",
          posted: "",
          expires: "",
        },
      ];
      const summary = formatBartAlertsSummary(alerts, "BART");
      expect(summary).toContain("15 min delay");
      expect(summary).toContain("⚠️");
    });
  });

  describe("getBartAlerts live fetch error handling", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getBartAlerts();
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });
  });
});
