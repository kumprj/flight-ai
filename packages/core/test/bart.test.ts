import { describe, it, expect, vi } from "vitest";
import {
  isBartAirport,
  getBartStationInfo,
  formatBartAlertsSummary,
  getBartAlerts,
} from "../src/bart";
import axios from "axios";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

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
    it("returns Antioch-SFO/Millbrae line info for SFO without paper ticket", () => {
      const info = getBartStationInfo("SFO");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("BART");
      expect(info?.line).toContain("SFO");
      expect(info?.fareDescription).toContain("Clipper");
      expect(info?.fareDescription).not.toContain("paper ticket");
    });

    it("returns Oakland Airport line info for OAK without paper ticket", () => {
      const info = getBartStationInfo("OAK");
      expect(info).toBeDefined();
      expect(info?.agency).toBe("BART");
      expect(info?.line).toContain("OAK");
      expect(info?.fareDescription).toContain("Clipper");
      expect(info?.fareDescription).not.toContain("paper ticket");
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

    it("prefers descriptionText when header is generic boilerplate BART.gov Alert", () => {
      const alerts = [
        {
          id: "BSA_560",
          station: "BART",
          type: "INFO",
          description: "Expect 30-minute delays for riders traveling between Millbrae and SFO stations.",
          sms_text: "BART.gov Alert",
          posted: "",
          expires: "",
        },
      ];
      const summary = formatBartAlertsSummary(alerts, "BART");
      expect(summary).not.toContain("BART: BART.gov Alert");
      expect(summary).toContain("Expect 30-minute delays");
      expect(summary).toContain("⚠️");
    });
  });

  describe("getBartAlerts", () => {
    it("returns empty array if axios throws an error", async () => {
      const spy = vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network timeout"));
      const alerts = await getBartAlerts();
      expect(alerts).toEqual([]);
      spy.mockRestore();
    });

    it("parses GTFS-RT feed and replaces boilerplate header with description", async () => {
      const feed = {
        header: { gtfsRealtimeVersion: "2.0", timestamp: Date.now() },
        entity: [
          {
            id: "alert_sfo",
            alert: {
              headerText: { translation: [{ text: "BART.gov Alert", language: "en-US" }] },
              descriptionText: {
                translation: [{ text: "Track maintenance near SFO causing 20 min delays.", language: "en-US" }],
              },
              informedEntity: [{ agencyId: "BART" }],
            },
          },
          {
            id: "alert_oak",
            alert: {
              headerText: { translation: [{ text: "BART.gov Alert", language: "en-US" }] },
              descriptionText: {
                translation: [{ text: "Oakland Airport connector running every 12 mins.", language: "en-US" }],
              },
              informedEntity: [{ agencyId: "BART" }],
            },
          },
          {
            id: "alert_normal",
            alert: {
              headerText: { translation: [{ text: "BART.gov Alert", language: "en-US" }] },
              descriptionText: {
                translation: [{ text: "No delays reported on the system.", language: "en-US" }],
              },
            },
          },
        ],
      };

      const encoded = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(
        GtfsRealtimeBindings.transit_realtime.FeedMessage.fromObject(feed)
      ).finish();

      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: encoded });

      // When querying SFO, should only include the SFO alert
      const sfoAlerts = await getBartAlerts("SFO");
      expect(sfoAlerts).toHaveLength(1);
      expect(sfoAlerts[0].id).toBe("alert_sfo");
      expect(sfoAlerts[0].sms_text).toContain("Track maintenance near SFO");
      expect(sfoAlerts[0].description).toContain("20 min delays");

      spy.mockRestore();
    });

    it("includes system-wide alerts for any airport code", async () => {
      const feed = {
        header: { gtfsRealtimeVersion: "2.0", timestamp: Date.now() },
        entity: [
          {
            id: "alert_sys",
            alert: {
              headerText: { translation: [{ text: "Major Delay", language: "en-US" }] },
              descriptionText: {
                translation: [{ text: "Systemwide delays due to computer glitch.", language: "en-US" }],
              },
            },
          },
        ],
      };

      const encoded = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(
        GtfsRealtimeBindings.transit_realtime.FeedMessage.fromObject(feed)
      ).finish();

      const spy = vi.spyOn(axios, "get").mockResolvedValueOnce({ data: encoded });

      const oakAlerts = await getBartAlerts("OAK");
      expect(oakAlerts).toHaveLength(1);
      expect(oakAlerts[0].id).toBe("alert_sys");

      spy.mockRestore();
    });
  });
});
