import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapFlight, parseLocalTime } from '../src/flights.js';
import {
  parseFlightTimeToUTC,
  calculateLeaveTime,
  formatLeaveTime,
  calculateHoursUntilFlight,
} from '../src/dateUtils.js';

describe('Flight Delay & Status Tracking', () => {
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
