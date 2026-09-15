import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  isLondonAirport,
  getLondonStationInfo,
  getTflAlerts,
  formatTflAlertsSummary,
} from "../src/tfl";

// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("TfL Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isLondonAirport", () => {
    it("should return true for valid London airports", () => {
      expect(isLondonAirport("LHR")).toBe(true);
      expect(isLondonAirport("lhr")).toBe(true);
      expect(isLondonAirport("LGW")).toBe(true);
      expect(isLondonAirport("STN")).toBe(true);
      expect(isLondonAirport("LTN")).toBe(true);
      expect(isLondonAirport("LCY")).toBe(true);
    });

    it("should return false for non-London airports", () => {
      expect(isLondonAirport("JFK")).toBe(false);
      expect(isLondonAirport("ORD")).toBe(false);
      expect(isLondonAirport("")).toBe(false);
      expect(isLondonAirport(undefined)).toBe(false);
    });
  });

  describe("getLondonStationInfo", () => {
    it("should return correct info for LHR", () => {
      const info = getLondonStationInfo("LHR");
      expect(info).not.toBeNull();
      expect(info?.agency).toBe("TfL");
      expect(info?.airportCode).toBe("LHR");
      expect(info?.primaryLines).toContain("piccadilly");
      expect(info?.primaryLines).toContain("elizabeth");
    });

    it("should return correct info for LGW", () => {
      const info = getLondonStationInfo("LGW");
      expect(info).not.toBeNull();
      expect(info?.agency).toBe("TfL");
      expect(info?.airportCode).toBe("LGW");
      expect(info?.primaryLines).toContain("thameslink");
    });

    it("should return correct info for LCY", () => {
      const info = getLondonStationInfo("LCY");
      expect(info).not.toBeNull();
      expect(info?.agency).toBe("TfL");
      expect(info?.airportCode).toBe("LCY");
      expect(info?.primaryLines).toContain("dlr");
    });

    it("should return null for non-London airports", () => {
      expect(getLondonStationInfo("SFO")).toBeNull();
      expect(getLondonStationInfo(undefined)).toBeNull();
    });
  });

  describe("getTflAlerts", () => {
    it("should return formatted alerts when TfL API has disruptions", async () => {
      const mockTflResponse = [
        {
          id: "piccadilly",
          name: "Piccadilly",
          lineStatuses: [
            {
              id: 1,
              statusSeverity: 20,
              statusSeverityDescription: "Service Closed",
              reason: "Piccadilly Line: Service closed.",
            },
          ],
        },
        {
          id: "dlr",
          name: "DLR",
          lineStatuses: [
            {
              id: 0,
              statusSeverity: 10,
              statusSeverityDescription: "Good Service",
            },
          ],
        },
      ];

      mockedAxios.get.mockResolvedValueOnce({ data: mockTflResponse });

      const alerts = await getTflAlerts("LHR"); // LHR has piccadilly

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe("piccadilly-1");
      expect(alerts[0].headline).toBe("Piccadilly: Service Closed");
      expect(alerts[0].isMajor).toBe(true);
      expect(alerts[0].routeId).toBe("piccadilly");
    });

    it("should return empty array when all services are good", async () => {
      const mockTflResponse = [
        {
          id: "piccadilly",
          name: "Piccadilly",
          lineStatuses: [
            {
              id: 0,
              statusSeverity: 10,
              statusSeverityDescription: "Good Service",
            },
          ],
        },
      ];

      mockedAxios.get.mockResolvedValueOnce({ data: mockTflResponse });

      const alerts = await getTflAlerts("LHR");

      expect(alerts).toHaveLength(0);
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Network Error"));

      const alerts = await getTflAlerts("LHR");

      expect(alerts).toHaveLength(0);
    });
  });

  describe("formatTflAlertsSummary", () => {
    it("should return normal service when no alerts", () => {
      expect(formatTflAlertsSummary([])).toBe("TfL Transit: Good Service");
      expect(formatTflAlertsSummary([], "Piccadilly Line")).toBe("Piccadilly Line: Good Service");
    });

    it("should format major alerts with warning emoji", () => {
      const summary = formatTflAlertsSummary([
        {
          id: "1",
          headline: "Piccadilly: Service Closed",
          shortDescription: "Closed due to engineering works",
          routeId: "piccadilly",
          isMajor: true,
        },
      ]);
      expect(summary).toBe("⚠️ TfL Transit: Piccadilly: Service Closed");
    });

    it("should format minor alerts with info emoji", () => {
      const summary = formatTflAlertsSummary([
        {
          id: "2",
          headline: "Piccadilly: Minor Delays",
          shortDescription: "Minor delays due to signal failure",
          routeId: "piccadilly",
          isMajor: false,
        },
      ]);
      expect(summary).toBe("ℹ️ TfL Transit: Piccadilly: Minor Delays");
    });
  });
});
