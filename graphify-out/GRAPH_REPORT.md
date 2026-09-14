# Graph Report - flight-ai  (2026-09-14)

## Corpus Check
- 64 files · ~26,001 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .css 2)

## Summary
- 445 nodes · 591 edges · 39 communities (24 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dccc7eff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- googleCalendar.ts
- maps.ts
- trip.ts
- App.tsx
- web/package.json
- core/package.json
- Issue tracker: GitHub
- package.json
- Make My Flight (makemyflight)
- Agent skills
- Domain Docs
- Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?
- functions/package.json
- compilerOptions
- React + TypeScript + Vite
- compilerOptions
- workflows/graphify.md
- compilerOptions
- devDependencies
- google-maps.d.ts
- triage-labels.md
- pnpm Monorepo Workspace Configuration
- Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?
- flights.ts
- compilerOptions
- compilerOptions
- web/tsconfig.json
- sst-env.d.ts
- rules/graphify.md
- Make My Flight
- Make My Flight Web Application Entrypoint HTML
- authTheme.ts
- test-maps.ts
- React Logo Asset

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `compilerOptions` - 18 edges
3. `compilerOptions` - 13 edges
4. `parseFlightTimeToUTC()` - 11 edges
5. `react` - 10 edges
6. `Make My Flight` - 9 edges
7. `formatLeaveTime()` - 8 edges
8. `getAirportTimezone()` - 7 edges
9. `formatFlightTime()` - 7 edges
10. `testNotify()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Make My Flight Web Application Entrypoint HTML` --references--> `Vite Logo Asset`  [EXTRACTED]
  packages/web/index.html → packages/web/public/vite.svg
- `handler()` --calls--> `formatCtaAlertsSummary()`  [EXTRACTED]
  packages/functions/src/notify.ts → packages/core/src/cta.ts
- `testNotify()` --calls--> `formatCtaAlertsSummary()`  [EXTRACTED]
  packages/functions/src/trip.ts → packages/core/src/cta.ts
- `handler()` --calls--> `formatMtaAlertsSummary()`  [EXTRACTED]
  packages/functions/src/notify.ts → packages/core/src/mta.ts
- `testNotify()` --calls--> `formatMtaAlertsSummary()`  [EXTRACTED]
  packages/functions/src/trip.ts → packages/core/src/mta.ts

## Import Cycles
- None detected.

## Communities (39 total, 10 thin omitted)

### Community 0 - "googleCalendar.ts"
Cohesion: 0.25
Nodes (13): CalendarImport(), Props, cacheToken(), CalendarFlight, fetchCalendarEvents(), getAccessToken(), getCachedToken(), initTokenClient() (+5 more)

### Community 1 - "maps.ts"
Cohesion: 0.10
Nodes (24): AirportInfo, AIRPORTS, getAirportAddress(), CHICAGO_STATIONS, formatCtaAlertsSummary(), getCtaAlerts(), getCtaStationInfo(), isChicagoAirport() (+16 more)

### Community 2 - "trip.ts"
Cohesion: 0.15
Nodes (25): getAirportTimezone(), calculateHoursUntilFlight(), calculateLeaveTime(), formatFlightDate(), formatFlightTime(), formatFlightTimeOnly(), formatLeaveTime(), parseFlightTimeToUTC() (+17 more)

### Community 3 - "App.tsx"
Cohesion: 0.15
Nodes (21): AddressAutocomplete(), AddressAutocompleteProps, loadGoogleMapsScript(), FlightData, Step, Trip, Config, CustomDatePicker() (+13 more)

### Community 5 - "web/package.json"
Cohesion: 0.05
Nodes (40): dependencies, aws-amplify, @aws-amplify/ui-react, axios, date-fns-tz, react, react-dom, react-router-dom (+32 more)

### Community 6 - "core/package.json"
Cohesion: 0.07
Nodes (33): dependencies, @aws-sdk/client-dynamodb, @aws-sdk/client-scheduler, @aws-sdk/lib-dynamodb, axios, date-fns, date-fns-tz, twilio (+25 more)

### Community 7 - "Issue tracker: GitHub"
Cohesion: 0.29
Nodes (6): Conventions, Issue tracker: GitHub, Pull requests as a triage surface, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 8 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, @aws-sdk/client-ses, date-fns, date-fns-tz, react-datepicker, @types/react-datepicker, devDependencies, dotenv (+19 more)

### Community 9 - "Make My Flight (makemyflight)"
Cohesion: 0.29
Nodes (6): Database Schema (DynamoDB Single-Table Design), Development & Operations, Key Domain Logic & Conventions, Make My Flight (makemyflight), Monorepo Architecture, Overview

### Community 10 - "Agent skills"
Cohesion: 0.33
Nodes (5): Agent Guidelines - Make My Flight, Agent skills, Domain docs, Issue tracker, Triage labels

### Community 11 - "Domain Docs"
Cohesion: 0.33
Nodes (5): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 12 - "Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?, Source Nodes

### Community 13 - "functions/package.json"
Cohesion: 0.09
Nodes (21): dependencies, @aws-sdk/client-lambda, @flight-ai/core, twilio, devDependencies, sst, @types/aws-lambda, @types/node (+13 more)

### Community 14 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 15 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

### Community 16 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 18 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+7 more)

### Community 19 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @types/node (+6 more)

### Community 20 - "google-maps.d.ts"
Cohesion: 0.14
Nodes (8): AddressComponent, Autocomplete, AutocompleteOptions, ComponentRestrictions, google.maps.event, google.maps.places, PlaceResult, Window

### Community 23 - "Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?, Source Nodes

### Community 25 - "flights.ts"
Cohesion: 0.28
Nodes (5): cache, FlightResult, Flights, mapFlight(), parseLocalTime()

### Community 26 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, module, moduleResolution, paths, extends, @flight-ai/core/*, @tsconfig/node18/tsconfig.json

### Community 35 - "compilerOptions"
Cohesion: 0.40
Nodes (4): compilerOptions, module, moduleResolution, exclude

### Community 53 - "Make My Flight"
Cohesion: 0.08
Nodes (23): API Endpoints, APIs, Architecture, AWS Infrastructure, Backend, Deployment, Environment Variables, Features (+15 more)

## Knowledge Gaps
- **254 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `deploy` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 286 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `googleCalendar.ts`, `web/package.json`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `parseFlightTimeToUTC()` connect `trip.ts` to `core/package.json`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `vitest` connect `functions/package.json` to `maps.ts`, `trip.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `maps.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0960960960960961 - nodes in this community are weakly interconnected._
- **Should `trip.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14516129032258066 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1471264367816092 - nodes in this community are weakly interconnected._