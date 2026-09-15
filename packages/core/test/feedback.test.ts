import { describe, it, expect } from 'vitest';
import { formatGitHubIssue } from '../src/feedback';

describe('feedback module', () => {
  it('formats a bug report with triage labels and system diagnostics', () => {
    const issue = formatGitHubIssue({
      type: 'bug',
      title: 'Drive time estimate is too low for early morning flight',
      description: 'Expected around 45 mins at 5am, but received 20 mins.',
      email: 'user@example.com',
      stage: 'production',
      timestamp: '2026-09-15T12:00:00.000Z',
      diagnostics: {
        platform: 'iOS Safari',
        viewport: '390x844',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        currentTrip: {
          flightNumber: 'UA123',
          originAirport: 'ORD',
          destinationAirport: 'SFO',
          date: '2026-05-21T06:55:00',
        },
      },
    });

    expect(issue.title).toBe('[Bug] Drive time estimate is too low for early morning flight');
    expect(issue.labels).toEqual(['needs-triage', 'bug', 'feedback']);
    expect(issue.body).toContain('### Description');
    expect(issue.body).toContain('Expected around 45 mins at 5am, but received 20 mins.');
    expect(issue.body).toContain('- **Reporter:** `user@example.com`');
    expect(issue.body).toContain('- **Platform:** iOS Safari');
    expect(issue.body).toContain('- **Viewport:** 390x844');
    expect(issue.body).toContain('- **Flight Context:** Flight UA123 (ORD → SFO) on 2026-05-21T06:55:00');
  });

  it('formats a feature request with enhancement label', () => {
    const issue = formatGitHubIssue({
      type: 'feature',
      title: 'Support Southwest Airlines calendar sync',
      description: 'Would love automated scanning for Southwest flights.',
      email: 'traveler@test.com',
    });

    expect(issue.title).toBe('[Feature] Support Southwest Airlines calendar sync');
    expect(issue.labels).toEqual(['needs-triage', 'enhancement', 'feedback']);
    expect(issue.body).toContain('### Description');
    expect(issue.body).toContain('Would love automated scanning for Southwest flights.');
  });

  it('formats route and general feedback types correctly', () => {
    const routeIssue = formatGitHubIssue({
      type: 'route',
      title: 'Incorrect terminal directions at JFK',
      description: 'Route routed to Terminal 1 instead of Terminal 4.',
      email: 'ny@test.com',
    });

    expect(routeIssue.title).toBe('[Route/Traffic] Incorrect terminal directions at JFK');
    expect(routeIssue.labels).toEqual(['needs-triage', 'routing', 'feedback']);

    const generalIssue = formatGitHubIssue({
      type: 'general',
      title: 'Loving the new design',
      description: 'The floating bottom tabs look great!',
      email: 'fan@test.com',
    });

    expect(generalIssue.title).toBe('[Feedback] Loving the new design');
    expect(generalIssue.labels).toEqual(['needs-triage', 'feedback']);
  });
});
