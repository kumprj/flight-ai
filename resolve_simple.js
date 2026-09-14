const fs = require('fs');

// dateUtils.ts
let dateUtils = fs.readFileSync('packages/core/src/dateUtils.ts', 'utf-8');
dateUtils = dateUtils.replace(/<<<<<<< HEAD\nimport { getAirportTimezone } from '.\/timezones';\n=======\nimport { getAirportTimezone } from '.\/airports';\n>>>>>>> [a-f0-9]+\n/, "import { getAirportTimezone } from './airports';\n");
dateUtils = dateUtils.replace(/<<<<<<< HEAD\n  \/\/ If already an IANA timezone \(e\.g\. contains '\/'\), use directly\n=======\n  \/\/ If already an IANA timezone \(contains '\/'\), use directly\n>>>>>>> [a-f0-9]+\n/, "  // If already an IANA timezone (e.g. contains '/'), use directly\n");
fs.writeFileSync('packages/core/src/dateUtils.ts', dateUtils);

// types.ts
let types = fs.readFileSync('packages/core/src/types.ts', 'utf-8');
types = types.replace(/<<<<<<< HEAD\n=======\n([\s\S]*?)>>>>>>> [a-f0-9]+\n/, "$1");
types = types.replace(/<<<<<<< HEAD\n  transitEnabled\?: boolean;\n=======\n>>>>>>> [a-f0-9]+\n/, "  transitEnabled?: boolean;\n");
fs.writeFileSync('packages/core/src/types.ts', types);

// index.ts
let index = fs.readFileSync('packages/core/src/index.ts', 'utf-8');
index = index.replace(/<<<<<<< HEAD\nexport \* from "\.\/cta";\nexport \* from "\.\/mta";\n=======\n>>>>>>> [a-f0-9]+\n/, "export * from \"./cta\";\nexport * from \"./mta\";\n");
fs.writeFileSync('packages/core/src/index.ts', index);

// cron.ts
let cron = fs.readFileSync('packages/functions/src/cron.ts', 'utf-8');
cron = cron.replace(/<<<<<<< HEAD\nimport { parseFlightTimeToUTC, calculateHoursUntilFlight } from "@flight-ai\/core";\n=======\nimport {\n  parseFlightTimeToUTC,\n  calculateHoursUntilFlight,\n  Flights,\n} from "@flight-ai\/core";\n>>>>>>> [a-f0-9]+\n/, "import {\n  parseFlightTimeToUTC,\n  calculateHoursUntilFlight,\n  Flights,\n} from \"@flight-ai/core\";\n");
cron = cron.replace(/<<<<<<< HEAD\n      \/\/ Convert naive local date string to true UTC using the origin airport's timezone\n      const flightDate = parseFlightTimeToUTC\(item\.date, item\.originAirport \|\| item\.timezone\);\n      const hoursUntilFlight = calculateHoursUntilFlight\(flightDate, now\);\n=======\n      \/\/ 2\. Initial flight time calculation\n      let effectiveDateStr = item\.revisedDate \|\| item\.date;\n      let flightDateUTC = parseFlightTimeToUTC\(effectiveDateStr, item\.originAirport \|\| item\.timezone\);\n      let hoursUntilFlight = calculateHoursUntilFlight\(flightDateUTC, now\);\n\n      console\.log\(`Trip \$\{item\.sk\}: Initial flight in \$\{hoursUntilFlight\.toFixed\(2\)\} hours`\);\n>>>>>>> [a-f0-9]+\n/, "      // 2. Initial flight time calculation\n      let effectiveDateStr = item.revisedDate || item.date;\n      let flightDateUTC = parseFlightTimeToUTC(effectiveDateStr, item.originAirport || item.timezone);\n      let hoursUntilFlight = calculateHoursUntilFlight(flightDateUTC, now);\n\n      console.log(`Trip ${item.sk}: Initial flight in ${hoursUntilFlight.toFixed(2)} hours`);\n");
fs.writeFileSync('packages/functions/src/cron.ts', cron);

