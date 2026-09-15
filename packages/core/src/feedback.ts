import { FeedbackDiagnostics, FeedbackType } from './types';

export interface FormatGitHubIssueParams {
  type: FeedbackType;
  title: string;
  description: string;
  email: string;
  diagnostics?: FeedbackDiagnostics;
  stage?: string;
  timestamp?: string;
}

export interface FormattedGitHubIssue {
  title: string;
  body: string;
  labels: string[];
}

const TYPE_PREFIXES: Record<FeedbackType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  route: 'Route/Traffic',
  general: 'Feedback',
};

const TYPE_LABELS: Record<FeedbackType, string[]> = {
  bug: ['needs-triage', 'bug', 'feedback'],
  feature: ['needs-triage', 'enhancement', 'feedback'],
  route: ['needs-triage', 'routing', 'feedback'],
  general: ['needs-triage', 'feedback'],
};

/**
 * Formats a user feedback submission into a GitHub issue payload (title, markdown body, triage labels)
 * adhering to kumprj/flight-ai triage conventions.
 */
export function formatGitHubIssue({
  type,
  title,
  description,
  email,
  diagnostics,
  stage = 'production',
  timestamp = new Date().toISOString(),
}: FormatGitHubIssueParams): FormattedGitHubIssue {
  const prefix = TYPE_PREFIXES[type] || 'Feedback';
  const cleanTitle = title.trim();
  const issueTitle = `[${prefix}] ${cleanTitle}`;

  const labels = TYPE_LABELS[type] || ['needs-triage', 'feedback'];

  const diagSections: string[] = [];
  diagSections.push(`- **Reporter:** \`${email}\``);
  diagSections.push(`- **Environment:** \`${stage}\``);
  diagSections.push(`- **Submitted At:** ${timestamp}`);
  if (diagnostics?.platform) {
    diagSections.push(`- **Platform:** ${diagnostics.platform}`);
  }
  if (diagnostics?.viewport) {
    diagSections.push(`- **Viewport:** ${diagnostics.viewport}`);
  }
  if (diagnostics?.userAgent) {
    diagSections.push(`- **User Agent:** \`${diagnostics.userAgent}\``);
  }
  if (diagnostics?.currentTrip) {
    const { flightNumber, originAirport, destinationAirport, date } = diagnostics.currentTrip;
    diagSections.push(
      `- **Flight Context:** Flight ${flightNumber || 'N/A'} (${originAirport || '???'} → ${destinationAirport || '???'}) on ${date || 'N/A'}`
    );
  }

  const body = [
    `### Description`,
    description.trim(),
    '',
    `---`,
    `<details open>`,
    `<summary><b>System & Diagnostics Context</b></summary>`,
    '',
    ...diagSections,
    `</details>`,
  ].join('\n');

  return {
    title: issueTitle,
    body,
    labels,
  };
}
