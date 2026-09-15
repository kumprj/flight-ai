import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { GoogleMaps } from "../src/maps";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("GoogleMaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_KEY = "test-api-key";
  });

  describe("getTravelTime", () => {
    it("sends future departureTime and TRAFFIC_AWARE routingPreference for early morning departure", async () => {
      // Mock future departure time (e.g. 2 hours before flight, ~5:00 AM tomorrow)
      const futureDeparture = new Date(Date.now() + 24 * 60 * 60 * 1000);

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          routes: [
            {
              duration: "1800s", // 30 minutes
              distanceMeters: 32000,
              staticDuration: "1800s",
            },
          ],
        },
      });

      const result = await GoogleMaps.getTravelTime(
        "123 Main St, Chicago, IL",
        "ORD",
        futureDeparture,
        "DRIVE"
      );

      expect(result.durationSeconds).toBe(1800);
      expect(result.durationText).toBe("30 mins");
      expect(result.distanceMeters).toBe(32000);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockedAxios.post.mock.calls[0];

      expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
      expect(body.departureTime).toBe(futureDeparture.toISOString());
      expect(body.routingPreference).toBe("TRAFFIC_AWARE");
      expect(body.travelMode).toBe("DRIVE");
      expect(body.destination.address).toContain("O'Hare International Airport");
      expect(config.headers["X-Goog-Maps-Solution-ID"]).toBe("gmp_git_agentskills_v1");
      expect(config.headers["X-Goog-Api-Key"]).toBe("test-api-key");
    });

    it("omits departureTime when departure is current/past (<5 minutes in future)", async () => {
      const nowDeparture = new Date();

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          routes: [
            {
              duration: "3600s", // 60 minutes
              distanceMeters: 32000,
            },
          ],
        },
      });

      const result = await GoogleMaps.getTravelTime(
        "123 Main St, Chicago, IL",
        "ORD",
        nowDeparture,
        "DRIVE"
      );

      expect(result.durationSeconds).toBe(3600);
      expect(result.durationText).toBe("60 mins");

      const [, body] = mockedAxios.post.mock.calls[0];
      expect(body.departureTime).toBeUndefined();
    });

    it("retries without departureTime if future departure request fails", async () => {
      const futureDeparture = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // First call with departureTime rejects
      mockedAxios.post.mockRejectedValueOnce(new Error("INVALID_ARGUMENT: departureTime"));

      // Second retry call without departureTime succeeds
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          routes: [
            {
              duration: "1920s",
              distanceMeters: 32000,
            },
          ],
        },
      });

      const result = await GoogleMaps.getTravelTime(
        "123 Main St, Chicago, IL",
        "ORD",
        futureDeparture,
        "DRIVE"
      );

      expect(result.durationSeconds).toBe(1920);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      const [, firstBody] = mockedAxios.post.mock.calls[0];
      expect(firstBody.departureTime).toBe(futureDeparture.toISOString());

      const [, secondBody] = mockedAxios.post.mock.calls[1];
      expect(secondBody.departureTime).toBeUndefined();
    });

    it("throws error if no routes are returned", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { routes: [] },
      });

      await expect(
        GoogleMaps.getTravelTime("123 Main St", "ORD", new Date(), "DRIVE")
      ).rejects.toThrow("No drive route found");
    });
  });
});
