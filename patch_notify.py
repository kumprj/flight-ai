import re

with open('packages/functions/src/notify.ts', 'r') as f:
    text = f.read()

# 1. Imports
text = re.sub(
    r'  resolveTimezone,\n\} from "@flight-ai/core";',
    '  resolveTimezone,\n  formatCtaAlertsSummary,\n  formatMtaAlertsSummary\n} from "@flight-ai/core";',
    text
)

# 2. Travel Time calculation
old_travel = """    // 4. Calculate Travel Time (Drive only)
    const travelInfo = await GoogleMaps.getTravelTime(
      payload.homeAddress,
      payload.airportCode
    );

    console.log("Travel estimate calculated:", JSON.stringify(travelInfo, null, 2));

    // Calculate final leave time using effective flight time (delay aware)
    const leaveMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const leaveTimeUTC = calculateLeaveTime(effectiveFlightUTC, leaveMinutes, arrivalPreference);
    const leaveTimeFormatted = formatLeaveTime(leaveTimeUTC, timezone);"""

new_travel = """    // 4. Calculate Travel Time (Multi-modal if transitEnabled)
    const transitEnabled = Boolean(profile.Item?.transitEnabled);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      payload.homeAddress,
      payload.airportCode,
      transitEnabled
    );
    const travelInfo = travelEstimate.drive;

    console.log("Travel estimate calculated:", JSON.stringify(travelEstimate, null, 2));

    // Calculate final drive leave time using effective flight time (delay aware)
    const driveMinutes = Math.ceil(travelEstimate.drive.durationSeconds / 60);
    const driveLeaveUTC = calculateLeaveTime(effectiveFlightUTC, driveMinutes, arrivalPreference);
    const driveLeaveFormatted = formatLeaveTime(driveLeaveUTC, timezone);

    // Calculate transit leave time if available
    let transitLeaveFormatted = "";
    let transitLineName = "";
    let transitAgency = "Public Transit";
    let transitAlertsSummary = "";

    if (transitEnabled) {
      if (travelEstimate.transit) {
        const transitMinutes = Math.ceil(travelEstimate.transit.durationSeconds / 60);
        const transitLeaveUTC = calculateLeaveTime(effectiveFlightUTC, transitMinutes, arrivalPreference);
        transitLeaveFormatted = formatLeaveTime(transitLeaveUTC, timezone);
        transitLineName = travelEstimate.transit.transitLine || "Transit";
        
        // Agency-specific formatting
        if (travelEstimate.stationInfo) {
          transitAgency = travelEstimate.stationInfo.agency === "CTA" ? "Chicago CTA" : "NYC MTA";
          if (travelEstimate.stationInfo.agency === "CTA") {
            transitAlertsSummary = formatCtaAlertsSummary(travelEstimate.ctaAlerts || []);
          } else {
            transitAlertsSummary = formatMtaAlertsSummary(travelEstimate.mtaAlerts || []);
          }
        }
      }
    }

    const leaveTimeFormatted = driveLeaveFormatted;"""
text = text.replace(old_travel, new_travel)

# 3. SMS text messages and fallback warning
fallback_warn = r'${transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? "\\n\\nNote: Public transit directions are currently unavailable for this route." : ""}'

text = re.sub(
    r'(      message = `.*?)\n\n` \+\n        `Safe travels!`;',
    r'\1' + fallback_warn + r'\n\n` +\n        `Safe travels!`;',
    text, flags=re.DOTALL
)

# 4. Email HTML
old_html_time = """      <div style="background: ${leaveBoxBg}; border-radius: 12px; padding: 24px; border-left: 4px solid ${accentColor};">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong> for your ${isUpdate ? 'updated ' : ''}${isDelayed ? 'delayed ' : ''}flight, you should leave at:
        </p>
        <p style="color: ${leaveTimeColor}; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTimeFormatted}
        </p>
      </div>"""

new_html_time = """      <!-- Drive Option -->
      <div style="background: ${leaveBoxBg}; border-radius: 12px; padding: 20px; border-left: 4px solid ${accentColor}; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: ${leaveTimeColor}; font-size: 16px;">🚗 Drive (Live Traffic)</span>
          <span style="font-weight: 700; color: ${leaveTimeColor}; font-size: 18px;">${travelEstimate.drive.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong> for your ${isUpdate ? 'updated ' : ''}${isDelayed ? 'delayed ' : ''}flight, leave by:</p>
        <p style="color: ${leaveTimeColor}; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${driveLeaveFormatted}
        </p>
      </div>

      ${travelEstimate.transit && transitLeaveFormatted ? `
      <!-- Public Transit Option -->
      <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #2563eb; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: #1e40af; font-size: 16px;">
            🚆 ${transitLineName}
          </span>
          <span style="font-weight: 700; color: #2563eb; font-size: 18px;">${travelEstimate.transit.durationText}</span>
        </div>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 6px 0;">Leave by:</p>
        <p style="color: #2563eb; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${transitLeaveFormatted}
        </p>
        ${travelEstimate.stationInfo?.fareDescription ? `
        <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">
          💳 Fare: ${travelEstimate.stationInfo.fareDescription}
        </p>` : ''}
      </div>

      ${transitAlertsSummary ? `
      <!-- Transit Alerts Banner -->
      <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #854d0e; font-size: 13px; margin: 0; font-weight: 600;">
          ${transitAlertsSummary}
        </p>
      </div>` : ''}
      ` : ''}"""
text = text.replace(old_html_time, new_html_time)

# 5. Fallback in HTML
html_fallback = r"""      ${transitEnabled && (!travelEstimate.transit || !transitLeaveFormatted) ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #991b1b; font-size: 13px; margin: 0; font-weight: 600;">
          ⚠️ Public transit directions are currently unavailable for this route.
        </p>
      </div>` : ''}"""
text = text.replace(
    '      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">',
    f"{html_fallback}\n      <div style=\"margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;\">"
)
text = text.replace(
    'Powered by Make My Flight</p>',
    'Powered by Make My Flight${transitAgency !== "Public Transit" ? ` & ${transitAgency}` : ""}</p>'
)

# 6. Checks for SMS and Email
text = re.sub(r'if \(profile\.Item\?\.phoneNumber && profile\.Item\?\.phoneVerified\) \{', r'if (profile.Item?.smsEnabled && profile.Item?.phoneNumber && profile.Item?.phoneVerified) {', text)
email_send_block = r'(await ses\.send\(\s*new SendEmailCommand\(\{.*?\n    \}\)\);\n\n    console\.log\("Notification email sent successfully!"\);)'
text = re.sub(email_send_block, r'if (profile.Item?.emailEnabled !== false) {\n      \1\n    } else {\n      console.log("Email notifications disabled, skipping email");\n    }', text, flags=re.DOTALL)


with open('packages/functions/src/notify.ts', 'w') as f:
    f.write(text)

