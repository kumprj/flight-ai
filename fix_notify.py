import re

with open('notify_conflicts.txt', 'r') as f:
    text = f.read()

# Fix imports
text = re.sub(
    r'<<<<<<< HEAD\n  formatCtaAlertsSummary,\n  formatMtaAlertsSummary\n=======\n  formatFlightTimeOnly,\n  resolveTimezone,\n>>>>>>> [a-f0-9]+\n',
    "  formatFlightTimeOnly,\n  resolveTimezone,\n  formatCtaAlertsSummary,\n  formatMtaAlertsSummary\n",
    text
)

# Fix 3. Resolve timezone
text = re.sub(
    r'<<<<<<< HEAD\n    // 3\. Resolve airport timezone and convert naive date string to true UTC\n    const flightUTC = parseFlightTimeToUTC\(trip\.Item\.date, trip\.Item\.originAirport \|\| trip\.Item\.timezone\);\n=======\n    const timezone = resolveTimezone\(trip\.Item\.originAirport \|\| trip\.Item\.timezone\);\n    const recipientEmail = profile\.Item\?\.email \|\| "rkump24@gmail\.com";\n',
    '    // 3. Resolve airport timezone and convert naive date string to true UTC\n    const flightUTC = parseFlightTimeToUTC(trip.Item.date, trip.Item.originAirport || trip.Item.timezone);\n    const timezone = resolveTimezone(trip.Item.originAirport || trip.Item.timezone);\n    const recipientEmail = profile.Item?.email || "rkump24@gmail.com";\n',
    text
)
text = re.sub(r'>>>>>>> [a-f0-9]+\n', '', text, count=1)

# Fix 4. Travel Time
replace_travel = """<<<<<<< HEAD
    // 4. Calculate Travel Time (Multi-modal if transitEnabled)
    const transitEnabled = Boolean(profile.Item?.transitEnabled);
    const travelEstimate = await GoogleMaps.getMultiModalTravelTime(
      payload.homeAddress,
      payload.airportCode,
      transitEnabled
    );

    const travelInfo = travelEstimate.drive;
=======
    // 4. Calculate Travel Time (Drive only)
    const travelInfo = await GoogleMaps.getTravelTime(
      payload.homeAddress,
      payload.airportCode
>>>>>>> [a-f0-9]+
    );

    console.log("Travel estimate calculated:", JSON.stringify(travelEstimate, null, 2));

<<<<<<< HEAD
    // Calculate final drive leave time
    const driveMinutes = Math.ceil(travelEstimate.drive.durationSeconds / 60);
    const driveLeaveUTC = calculateLeaveTime(flightUTC, driveMinutes, arrivalPreference);
    const driveLeaveFormatted = formatLeaveTime(driveLeaveUTC, trip.Item.originAirport || trip.Item.timezone);

    // Calculate transit leave time (if available)
    let transitLeaveFormatted = "";
    let transitLineName = "";
    let transitAgency = "Public Transit";
    let transitAlertsSummary = "";

    if (transitEnabled) {
      if (travelEstimate.transit) {
        const transitMinutes = Math.ceil(travelEstimate.transit.durationSeconds / 60);
        const transitLeaveUTC = calculateLeaveTime(flightUTC, transitMinutes, arrivalPreference);
        transitLeaveFormatted = formatLeaveTime(transitLeaveUTC, trip.Item.originAirport || trip.Item.timezone);
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

    // Default legacy variables (for SMS/subject)
    const leaveTimeFormatted = driveLeaveFormatted;
    const leaveTimeUTC = driveLeaveUTC;
=======
    const leaveMinutes = Math.ceil(travelInfo.durationSeconds / 60);
    const leaveTimeUTC = calculateLeaveTime(effectiveFlightUTC, leaveMinutes, arrivalPreference);
    const leaveTimeFormatted = formatLeaveTime(leaveTimeUTC, timezone);
>>>>>>> [a-f0-9]+"""

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

    // Calculate transit leave time (if available)
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

    // Default legacy variables (for SMS/subject)
    const leaveTimeFormatted = driveLeaveFormatted;
    const leaveTimeUTC = driveLeaveUTC;"""

text = re.sub(r'<<<<<<< HEAD\n    // 4\. Calculate Travel Time.*?>>>>>>> [a-f0-9]+\n', new_travel, text, flags=re.DOTALL)


# Email HTML conflicts
replace_html = """<<<<<<< HEAD
        <p style="color: #4b5563; font-size: 14px; margin: 4px 0 0 0;">
          Target arrival: <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>
=======
        <p style="color: ${accentColor}; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">${travelInfo.durationText}</p>
      </div>
      
      <div style="background: ${leaveBoxBg}; border-radius: 12px; padding: 24px; border-left: 4px solid ${accentColor};">
        <p style="color: #4b5563; font-size: 15px; margin: 0 0 12px 0; line-height: 1.6;">
          To arrive <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong> for your ${isUpdate ? 'updated ' : ''}${isDelayed ? 'delayed ' : ''}flight, you should leave at:
        </p>
        <p style="color: ${leaveTimeColor}; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
          ${leaveTimeFormatted}
>>>>>>> [a-f0-9]+"""
new_html = """        <p style="color: #4b5563; font-size: 14px; margin: 4px 0 0 0;">
          Target arrival: <strong>${arrivalPreference} hour${arrivalPreference !== 1 ? 's' : ''} early</strong>
        </p>"""
text = re.sub(r'<<<<<<< HEAD\n        <p style="color: #4b5563; font-size: 14px; margin: 4px 0 0 0;">.*?>>>>>>> [a-f0-9]+\n', new_html, text, flags=re.DOTALL)

# HTML End Conflict
replace_html_end = """<<<<<<< HEAD
        Subject: {Data: `⏰ Time to Leave for Flight ${trip.Item.flightNumber}!`},
=======
        Subject: {Data: subject},
>>>>>>> [a-f0-9]+"""
new_html_end = """        Subject: {Data: subject},"""
text = re.sub(r'<<<<<<< HEAD\n        Subject: {Data: `⏰ Time to Leave for Flight \$\{trip\.Item\.flightNumber\}!`\},\n=======\n        Subject: \{Data: subject\},\n>>>>>>> [a-f0-9]+\n', new_html_end, text)

# Add SMS enabled check
text = re.sub(r'if \(profile\.Item\?\.phoneNumber && profile\.Item\?\.phoneVerified\) \{', r'if (profile.Item?.smsEnabled && profile.Item?.phoneNumber && profile.Item?.phoneVerified) {', text)

# Add email enabled check
email_send_block = r'(await ses\.send\(\s*new SendEmailCommand\(\{.*?\n    \}\)\);\n\n    console\.log\("Notification email sent successfully!"\);)'
text = re.sub(email_send_block, r'if (profile.Item?.emailEnabled !== false) {\n      \1\n    } else {\n      console.log("Email notifications disabled, skipping email");\n    }', text, flags=re.DOTALL)


with open('packages/functions/src/notify.ts', 'w') as f:
    f.write(text)

