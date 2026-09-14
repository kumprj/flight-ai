import re

with open('packages/functions/src/notify.ts', 'r') as f:
    text = f.read()

fallback_warn = r'${transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? "\\n\\nNote: Public transit directions are currently unavailable for this route." : ""}'

# Add fallback warning to the SMS message construction
text = re.sub(
    r'(      message = `.*?)\n\n` \+\n        `Safe travels!`;',
    r'\1' + fallback_warn + r'\n\n` +\n        `Safe travels!`;',
    text, flags=re.DOTALL
)

html_fallback = r"""${transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? `
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

with open('packages/functions/src/notify.ts', 'w') as f:
    f.write(text)

