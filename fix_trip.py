import re

with open('packages/functions/src/trip.ts', 'r') as f:
    text = f.read()

fallback_warn = r'${profile?.transitEnabled ? "\\n\\nNote: Public transit directions are currently unavailable for this route at the targeted time." : ""}'

text = text.replace(
    r"`✈️ TEST Flight Alert for ${trip.flightNumber}!\n\nCurrent travel time from ${trip.homeAddress} to ${trip.originAirport} is ${travelEstimate.drive.durationText}.\n\nIn order to arrive ${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early for your flight, you should leave at ${driveLeaveFormatted}.\n\nThis is a test notification. Safe travels!`;",
    f"`✈️ TEST Flight Alert for ${{trip.flightNumber}}!\\n\\nCurrent travel time from ${{trip.homeAddress}} to ${{trip.originAirport}} is ${{travelEstimate.drive.durationText}}.\\n\\nIn order to arrive ${{arrivalPreference}} hour${{arrivalPreference !== 1 ? 's' : ''}} early for your flight, you should leave at ${{driveLeaveFormatted}}.{fallback_warn}\\n\\nThis is a test notification. Safe travels!`;"
)

# And for email fallback warning (in HTML)
html_fallback = r"""${profile?.transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 600;">
          ⚠️ Public transit directions are currently unavailable for this route.
        </p>
      </div>` : ''}"""

text = re.sub(
    r'(      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">)',
    rf"{html_fallback}\n\1",
    text
)

with open('packages/functions/src/trip.ts', 'w') as f:
    f.write(text)

