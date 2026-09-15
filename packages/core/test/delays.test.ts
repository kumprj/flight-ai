import { test, describe, expect, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { Flights, mapFlight, parseLocalTime } from '../src/flights.js';
import {
  parseFlightTimeToUTC,
  calculateLeaveTime,
  formatLeaveTime,
  calculateHoursUntilFlight,
} from '../src/dateUtils.js';
import axios from 'axios';

vi.mock('axios');

describe('Flight Delay & Status Tracking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parseLocalTime strips timezone offset and normalizes ISO format', () => {
    assert.equal(parseLocalTime('2026-05-21 17:45-05:00'), '2026-05-21T17:45:00');
    assert.equal(parseLocalTime('2026-05-21 17:45:00+00:00'), '2026-05-21T17:45:00');
    assert.equal(parseLocalTime(''), '');
  });

  test('mapFlight correctly captures on-time scheduled flights', () => {
    const rawFlight = {
      number: 'UA 123',
      airline: { name: 'United Airlines' },
      status: 'Scheduled',
      departure: {
        airport: { iata: 'ORD', timeZone: 'America/Chicago' },
        scheduledTime: { local: '2026-05-21 14:00-05:00' },
      },
      arrival: {
        airport: { iata: 'SFO', timeZone: 'America/Los_Angeles' },
        scheduledTime: { local: '2026-05-21 16:30-07:00' },
      },
    };

    const mapped = mapFlight(rawFlight);
    assert.equal(mapped.flightNumber, 'UA123');
    assert.equal(mapped.departureTime, '2026-05-21T14:00:00');
    assert.equal(mapped.scheduledDepartureTime, '2026-05-21T14:00:00');
    assert.equal(mapped.revisedDepartureTime, undefined);
    assert.equal(mapped.delayMinutes, undefined);
    assert.equal(mapped.status, 'Scheduled');
  });

  test('mapFlight prioritizes revisedTime when flight is delayed', () => {
    const rawDelayedFlight = {
      number: 'UA 920',
      airline: { name: 'United Airlines' },
      status: 'Delayed',
      departure: {
        airport: { iata: 'ORD', timeZone: 'America/Chicago' },
        scheduledTime: { local: '2026-05-21 14:00-05:00' },
        revisedTime: { local: '2026-05-21 15:45-05:00' },
      },
      arrival: {
        airport: { iata: 'LHR', timeZone: 'Europe/London' },
        scheduledTime: { local: '2026-05-22 06:00+01:00' },
        revisedTime: { local: '2026-05-22 07:45+01:00' },
      },
    };

    const mapped = mapFlight(rawDelayedFlight);
    assert.equal(mapped.flightNumber, 'UA920');
    // departureTime must be the revised (delayed) time!
    assert.equal(mapped.departureTime, '2026-05-21T15:45:00');
    assert.equal(mapped.scheduledDepartureTime, '2026-05-21T14:00:00');
    assert.equal(mapped.revisedDepartureTime, '2026-05-21T15:45:00');
    assert.equal(mapped.delayMinutes, 105);
    assert.equal(mapped.status, 'Delayed');
  });

  test('mapFlight handles Canceled flights', () => {
    const rawCanceledFlight = {
      number: 'AA 400',
      airline: { name: 'American Airlines' },
      status: 'Canceled',
      departure: {
        airport: { iata: 'DFW', timeZone: 'America/Chicago' },
        scheduledTime: { local: '2026-05-21 09:00-05:00' },
      },
      arrival: {
        airport: { iata: 'MIA', timeZone: 'America/New_York' },
        scheduledTime: { local: '2026-05-21 13:00-04:00' },
      },
    };

    const mapped = mapFlight(rawCanceledFlight);
    assert.equal(mapped.status, 'Canceled');
    assert.equal(mapped.departureTime, '2026-05-21T09:00:00');
  });

  test('Leave time calculation accurately shifts for delayed flights', () => {
    const scheduledStr = '2026-05-21T14:00:00';
    const delayedStr = '2026-05-21T16:00:00'; // 2 hours delayed

    const scheduledUTC = parseFlightTimeToUTC(scheduledStr, 'ORD');
    const delayedUTC = parseFlightTimeToUTC(delayedStr, 'ORD');

    const driveMinutes = 45;
    const arrivalPref = 2; // 2 hours early

    const scheduledLeaveUTC = calculateLeaveTime(scheduledUTC, driveMinutes, arrivalPref);
    const delayedLeaveUTC = calculateLeaveTime(delayedUTC, driveMinutes, arrivalPref);

    const scheduledLeaveFormatted = formatLeaveTime(scheduledLeaveUTC, 'ORD');
    const delayedLeaveFormatted = formatLeaveTime(delayedLeaveUTC, 'ORD');

    // 14:00 - 2h45m = 11:15 AM
    assert.equal(scheduledLeaveFormatted, '11:15 AM');
    // 16:00 - 2h45m = 1:15 PM
    assert.equal(delayedLeaveFormatted, '1:15 PM');

    // Difference in leave time should be exactly 2 hours (120 minutes)
    const diffMs = delayedLeaveUTC.getTime() - scheduledLeaveUTC.getTime();
    assert.equal(diffMs / (1000 * 60), 120);
  });
});

describe('Flights API interaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFlightResponse = [{
    number: 'UA 123',
    airline: { name: 'United Airlines' },
    status: 'Scheduled',
    departure: {
      airport: { iata: 'ORD', timeZone: 'America/Chicago' },
      scheduledTime: { local: '2026-05-21 14:00-05:00' },
    },
    arrival: {
      airport: { iata: 'SFO', timeZone: 'America/Los_Angeles' },
      scheduledTime: { local: '2026-05-21 16:30-07:00' },
    }
  }];

  describe('search', () => {
    test('calls axios.get and correctly maps flights, then uses cache on second call', async () => {
      // Mock axios to return data
      const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockFlightResponse });

      // First call, should trigger axios
      const results1 = await Flights.search('UA123', '2026-05-21');
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(results1).toHaveLength(1);
      expect(results1[0].flightNumber).toBe('UA123');

      // Second call, should use cache
      const results2 = await Flights.search('UA123', '2026-05-21');
      expect(getSpy).toHaveBeenCalledTimes(1); // Still 1
      expect(results2).toEqual(results1);
    });

    test('returns empty array when API throws an error', async () => {
      const uniqueFlightNum = `ERR${Date.now()}`;
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('API Down'));
      const results = await Flights.search(uniqueFlightNum, '2026-05-21');
      expect(results).toEqual([]);
    });

    test('retries on 429 rate limit error', async () => {
      const flightNum = `RATE${Date.now()}`;
      const getSpy = vi.spyOn(axios, 'get')
        .mockClear()
        .mockRejectedValueOnce({ response: { status: 429 } }) // first fails
        .mockResolvedValueOnce({ data: mockFlightResponse }); // second succeeds

      // Since we backoff 1200ms, the test might be slow.
      const results = await Flights.search(flightNum, '2026-05-21');
      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0].flightNumber).toBe('UA123');
    }, 10000); // increase timeout due to retry backoff
  });

  describe('checkStatus', () => {
    test('returns exact matching flight by number', async () => {
      const flightNum = `CK${Date.now()}`;
      const mockData = [
        { ...mockFlightResponse[0], number: flightNum }, // Target
        { ...mockFlightResponse[0], number: 'UA 999' }
      ];
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: mockData });

      const result = await Flights.checkStatus(flightNum, '2026-05-21');
      expect(result).not.toBeNull();
      expect(result?.flightNumber).toBe(flightNum);
    });

    test('returns null when no results are found', async () => {
      const flightNum = `NULL${Date.now()}`;
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: [] });
      const result = await Flights.checkStatus(flightNum, '2026-05-21');
      expect(result).toBeNull();
    });
  });

  describe('searchByRoute', () => {
    test('combines AM and PM searches and caches the result', async () => {
      const depIata = `ROUTE${Date.now()}`;
      const arrIata = 'SFO';
      const amData = { departures: [{ ...mockFlightResponse[0], departure: { ...mockFlightResponse[0].departure, airport: { iata: depIata } } }] };
      const pmData = { departures: [{ ...mockFlightResponse[0], number: 'UA 456', departure: { ...mockFlightResponse[0].departure, airport: { iata: depIata } } }] };

      const getSpy = vi.spyOn(axios, 'get')
        .mockClear()
        .mockResolvedValueOnce({ data: amData })
        .mockResolvedValueOnce({ data: pmData });

      const results1 = await Flights.searchByRoute(depIata, arrIata, '2026-05-21');
      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(results1).toHaveLength(2);
      expect(results1[0].flightNumber).toBe('UA123');
      expect(results1[1].flightNumber).toBe('UA456');

      // Second call, should hit cache
      const results2 = await Flights.searchByRoute(depIata, arrIata, '2026-05-21');
      expect(getSpy).toHaveBeenCalledTimes(2); // Still 2
      expect(results2).toEqual(results1);
    }, 10000);

    test('returns empty array when API throws an error and no fallback', async () => {
      const depIata = `ERRROUTE${Date.now()}`;
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network Error'));
      const results = await Flights.searchByRoute(depIata, 'SFO', '2026-05-21');
      expect(results).toEqual([]);
    }, 10000);
  });
});
