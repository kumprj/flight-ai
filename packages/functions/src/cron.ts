import { EventBridgeHandler } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { Resource } from "sst";
import {
  parseFlightTimeToUTC,
  calculateHoursUntilFlight,
  Flights,
  GoogleMaps,
  shouldAlertDriveTimeChange,
} from "@flight-ai/core";

const dynamodb = DynamoDBDocument.from(new DynamoDB({}));
const lambda = new LambdaClient({});

export const handler: EventBridgeHandler<string, any, void> = async (event) => {
  console.log("Cron job triggered:", new Date().toISOString());

  try {
    // Scan for all trips
    const result = await dynamodb.scan({
      TableName: Resource.Table.name,
      FilterExpression: "begins_with(sk, :tripPrefix)",
      ExpressionAttributeValues: {
        ":tripPrefix": "TRIP#",
      },
    });

    console.log(`Found ${result.Items?.length || 0} trips`);

    if (!result.Items || result.Items.length === 0) {
      console.log("No trips to process");
      return;
    }

    const now = new Date();

    for (const item of result.Items) {
      try {
        const userId = item.pk.replace("USER#", "");

        // 1. Get user profile for arrival preference
        const profile = await dynamodb.get({
          TableName: Resource.Table.name,
          Key: { pk: item.pk, sk: "PROFILE" },
        });

        const arrivalPreference = profile.Item?.arrivalPreference || 2;

        // 2. Initial flight time calculation
        let effectiveDateStr = item.revisedDate || item.date;
        let flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);
        let hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);

        console.log(`Trip ${item.sk}: Initial flight in ${hoursUntilFlight.toFixed(2)} hours`);

        // 3. Check live status if flight is within 24 hours (and not departed)
        // Rate-limit checks to at most once every 30 minutes per active trip
        const timeSinceLastCheck = item.lastStatusCheck ? (now.getTime() - item.lastStatusCheck) : Infinity;
        const shouldCheckStatus = hoursUntilFlight > 0 && hoursUntilFlight <= 24 && timeSinceLastCheck >= 30 * 60 * 1000;

        if (shouldCheckStatus) {
          console.log(`Checking live flight status for ${item.flightNumber} on ${item.date}...`);
          const flightStatus = await Flights.checkStatus(item.flightNumber, item.date);

          if (flightStatus) {
            console.log(`Live status for ${item.flightNumber}:`, JSON.stringify(flightStatus));

            // Case A: Canceled flight
            if (flightStatus.status === 'Canceled') {
              console.warn(`Flight ${item.flightNumber} has been CANCELED`);
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "Canceled",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });

              // Trigger immediate cancellation alert if not previously alerted
              if (item.status !== 'Canceled') {
                await lambda.send(new InvokeCommand({
                  FunctionName: process.env.WORKER_ARN!,
                  InvocationType: "Event",
                  Payload: JSON.stringify({
                    tripId: item.sk,
                    userId: userId,
                    homeAddress: item.homeAddress,
                    airportCode: item.originAirport,
                    isCanceled: true,
                  }),
                }));
              }
              continue; // Skip normal leave notification
            }

            // Case B: Delayed flight
            if (flightStatus.revisedDepartureTime && flightStatus.revisedDepartureTime !== item.date) {
              const delayMins = flightStatus.delayMinutes || 0;
              const previousRevisedDate = item.revisedDate;
              const delayChanged = previousRevisedDate && previousRevisedDate !== flightStatus.revisedDepartureTime;
              console.log(`Flight ${item.flightNumber} is delayed by ${delayMins}m. New departure: ${flightStatus.revisedDepartureTime}${delayChanged ? ` (changed from ${previousRevisedDate})` : ''}`);

              effectiveDateStr = flightStatus.revisedDepartureTime;
              flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);
              hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);

              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET revisedDate = :revDate, delayMinutes = :delayMins, #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":revDate": flightStatus.revisedDepartureTime,
                  ":delayMins": delayMins,
                  ":status": "Delayed",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });

              item.revisedDate = flightStatus.revisedDepartureTime;
              item.delayMinutes = delayMins;
              item.status = "Delayed";

              // Trigger delay-change re-notification if user was already notified AND
              // the delay amount has materially changed (different revisedDate or >=15m shift)
              const alreadyNotified = Boolean(item.notified12h || item.notifiedDeparture);
              const lastNotifiedDelay = item.lastDelayNotifiedMinutes ?? -1;
              const significantChange = Math.abs(delayMins - lastNotifiedDelay) >= 15;

              if (delayChanged && alreadyNotified && significantChange) {
                console.log(`Delay changed significantly for ${item.flightNumber}: ${lastNotifiedDelay}m → ${delayMins}m. Sending update notification.`);
                await lambda.send(new InvokeCommand({
                  FunctionName: process.env.WORKER_ARN!,
                  InvocationType: "Event",
                  Payload: JSON.stringify({
                    tripId: item.sk,
                    userId: userId,
                    homeAddress: item.homeAddress,
                    airportCode: item.originAirport,
                    isDelayed: true,
                    delayMinutes: delayMins,
                    isUpdate: true,
                  }),
                }));

                // Record that we notified at this delay level
                await dynamodb.update({
                  TableName: Resource.Table.name,
                  Key: { pk: item.pk, sk: item.sk },
                  UpdateExpression: "SET lastDelayNotifiedMinutes = :ldnm",
                  ExpressionAttributeValues: { ":ldnm": delayMins },
                });
              }
            } else if (item.status === 'Delayed' && !flightStatus.revisedDepartureTime) {
              // Case B2: Flight was delayed but is now back on schedule
              console.log(`Flight ${item.flightNumber} is back on schedule (was delayed by ${item.delayMinutes}m)`);
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt REMOVE revisedDate, delayMinutes, lastDelayNotifiedMinutes",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": flightStatus.status || "Scheduled",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });

              // Notify user of the good news if they were previously notified about a delay
              const wasNotifiedAboutDelay = Boolean(item.notified12h || item.notifiedDeparture);
              if (wasNotifiedAboutDelay) {
                console.log(`Sending back-on-schedule notification for ${item.flightNumber}`);
                await lambda.send(new InvokeCommand({
                  FunctionName: process.env.WORKER_ARN!,
                  InvocationType: "Event",
                  Payload: JSON.stringify({
                    tripId: item.sk,
                    userId: userId,
                    homeAddress: item.homeAddress,
                    airportCode: item.originAirport,
                    isDelayed: false,
                    delayMinutes: 0,
                    isUpdate: true,
                  }),
                }));
              }

              effectiveDateStr = item.date;
              flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);
              hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);
              item.revisedDate = undefined;
              item.delayMinutes = 0;
              item.status = flightStatus.status || "Scheduled";
            } else {
              // Case C: On time / scheduled
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET #status = :status, lastStatusCheck = :lastCheck, updatedAt = :updatedAt",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": flightStatus.status || "Scheduled",
                  ":lastCheck": now.getTime(),
                  ":updatedAt": now.getTime(),
                },
              });
            }
          }
        }

        console.log(`Trip ${item.sk}: Effective flight in ${hoursUntilFlight.toFixed(2)} hours`);

        // 4. Notification window evaluation based on effective departure time
        const notify12h = hoursUntilFlight > 11 && hoursUntilFlight <= 12;
        const notifyDeparture = hoursUntilFlight > 0 && hoursUntilFlight <= (arrivalPreference + 2);

        // De-duplication: skip if this window was already notified
        const already12h = Boolean(item.notified12h);
        const alreadyDeparture = Boolean(item.notifiedDeparture);
        const should12h = notify12h && !already12h;
        const shouldDeparture = notifyDeparture && !alreadyDeparture;

        if (should12h || shouldDeparture) {
          const reason = should12h ? '12-hour advance notice' : `${arrivalPreference + 2}-hour departure window`;
          const isDelayed = item.status === 'Delayed' || Boolean(item.revisedDate);
          console.log(`Triggering notification for ${item.flightNumber} (${reason}, Delayed: ${isDelayed})`);

          // Calculate initial drive time if sending departure notification
          let initialDriveMinutes: number | undefined;
          if (shouldDeparture) {
            try {
              const estimatedLeaveUTC = new Date(flightDateUTC.getTime() - (arrivalPreference * 60 * 60 * 1000));
              const driveEstimate = await GoogleMaps.getTravelTime(item.homeAddress, item.originAirport, estimatedLeaveUTC, "DRIVE");
              initialDriveMinutes = Math.ceil(driveEstimate.durationSeconds / 60);
              console.log(`Initial drive time for ${item.flightNumber}: ${initialDriveMinutes}m`);
            } catch (err) {
              console.warn(`Could not calculate initial drive time in cron for ${item.flightNumber}:`, err);
            }
          }

          await lambda.send(new InvokeCommand({
            FunctionName: process.env.WORKER_ARN!,
            InvocationType: "Event",
            Payload: JSON.stringify({
              tripId: item.sk,
              userId: userId,
              homeAddress: item.homeAddress,
              airportCode: item.originAirport,
              isDelayed,
              delayMinutes: item.delayMinutes || 0,
            }),
          }));

          // Mark this window as notified so it won't fire again
          const updateParts: string[] = ['updatedAt = :updatedAt'];
          const exprValues: Record<string, any> = { ':updatedAt': now.getTime() };

          if (should12h) {
            updateParts.push('notified12h = :n12h');
            exprValues[':n12h'] = now.getTime();
          }
          if (shouldDeparture) {
            updateParts.push('notifiedDeparture = :nDep');
            exprValues[':nDep'] = now.getTime();
            if (initialDriveMinutes !== undefined) {
              updateParts.push('lastDriveTimeMinutes = :ldtm');
              exprValues[':ldtm'] = initialDriveMinutes;
              item.lastDriveTimeMinutes = initialDriveMinutes;
            }
          }
          // Track delay level at time of notification for change detection
          if (isDelayed && item.delayMinutes) {
            updateParts.push('lastDelayNotifiedMinutes = :ldnm');
            exprValues[':ldnm'] = item.delayMinutes;
          }

          await dynamodb.update({
            TableName: Resource.Table.name,
            Key: { pk: item.pk, sk: item.sk },
            UpdateExpression: `SET ${updateParts.join(', ')}`,
            ExpressionAttributeValues: exprValues,
          });

          console.log(`Notification triggered for ${item.flightNumber} (${reason})`);
        } else if (alreadyDeparture && hoursUntilFlight > 0 && hoursUntilFlight <= (arrivalPreference + 2)) {
          // 5. Re-assess drive time as we get closer to the flight
          try {
            const estimatedLeaveUTC = new Date(flightDateUTC.getTime() - (arrivalPreference * 60 * 60 * 1000));
            const driveEstimate = await GoogleMaps.getTravelTime(item.homeAddress, item.originAirport, estimatedLeaveUTC, "DRIVE");
            const currentDriveMinutes = Math.ceil(driveEstimate.durationSeconds / 60);
            const lastNotifiedDrive = item.lastDriveTimeMinutes;

            console.log(`Re-assessing drive time for ${item.flightNumber}: current = ${currentDriveMinutes}m, last notified = ${lastNotifiedDrive}m`);

            if (lastNotifiedDrive === undefined) {
              // Establish baseline if not set previously
              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET lastDriveTimeMinutes = :ldtm, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                  ":ldtm": currentDriveMinutes,
                  ":updatedAt": now.getTime(),
                },
              });
              item.lastDriveTimeMinutes = currentDriveMinutes;
            } else if (shouldAlertDriveTimeChange(currentDriveMinutes, lastNotifiedDrive, 15)) {
              const diff = Math.abs(currentDriveMinutes - lastNotifiedDrive);
              console.log(`Drive time changed significantly for ${item.flightNumber}: ${lastNotifiedDrive}m → ${currentDriveMinutes}m (diff: ${diff}m > 15m). Sending update notification.`);

              const isDelayed = item.status === 'Delayed' || Boolean(item.revisedDate);
              await lambda.send(new InvokeCommand({
                FunctionName: process.env.WORKER_ARN!,
                InvocationType: "Event",
                Payload: JSON.stringify({
                  tripId: item.sk,
                  userId: userId,
                  homeAddress: item.homeAddress,
                  airportCode: item.originAirport,
                  isDelayed,
                  delayMinutes: item.delayMinutes || 0,
                  isDriveTimeUpdate: true,
                  previousDriveMinutes: lastNotifiedDrive,
                  currentDriveMinutes: currentDriveMinutes,
                }),
              }));

              await dynamodb.update({
                TableName: Resource.Table.name,
                Key: { pk: item.pk, sk: item.sk },
                UpdateExpression: "SET lastDriveTimeMinutes = :ldtm, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                  ":ldtm": currentDriveMinutes,
                  ":updatedAt": now.getTime(),
                },
              });
              item.lastDriveTimeMinutes = currentDriveMinutes;
            } else {
              const diff = Math.abs(currentDriveMinutes - lastNotifiedDrive);
              console.log(`Drive time change for ${item.flightNumber} (${diff}m) is within 15-minute threshold. Skipping notification.`);
            }
          } catch (driveErr) {
            console.error(`Failed to check drive time update for ${item.flightNumber}:`, driveErr);
          }
        } else if (notify12h && already12h) {
          console.log(`Skipping 12h notification for ${item.flightNumber} — already sent`);
        } else if (hoursUntilFlight <= 0) {
          console.log(`Flight ${item.flightNumber} has already departed`);
        } else {
          console.log(`Flight ${item.flightNumber} is outside notification window (${hoursUntilFlight.toFixed(2)} hours)`);
        }
      } catch (tripError) {
        console.error(`Failed to process trip ${item.sk}:`, tripError);
      }
    }

    console.log("Cron job completed successfully");
  } catch (error) {
    console.error("Cron job failed:", error);
    throw error;
  }
};
