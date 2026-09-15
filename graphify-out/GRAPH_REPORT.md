# Graph Report - flight-ai  (2026-09-15)

## Corpus Check
- 85 files · ~46,820 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .css 2)

## Summary
- 569 nodes · 845 edges · 45 communities (25 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `817b42b5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?
- maps.ts
- trip.ts
- App.tsx
- core/package.json
- web/package.json
- Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?
- Issue tracker: GitHub
- package.json
- Make My Flight (makemyflight)
- Agent skills
- Domain Docs
- devDependencies
- functions/package.json
- compilerOptions
- React + TypeScript + Vite
- compilerOptions
- workflows/graphify.md
- compilerOptions
- core/src/feedback.ts
- google-maps.d.ts
- triage-labels.md
- pnpm Monorepo Workspace Configuration
- resolve_simple.js
- compilerOptions
- flights.ts
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
3. `parseFlightTimeToUTC()` - 13 edges
4. `compilerOptions` - 13 edges
5. `compilerOptions` - 10 edges
6. `react` - 10 edges
7. `formatLeaveTime()` - 9 edges
8. `TransitAlert` - 9 edges
9. `App()` - 9 edges
10. `Config` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Make My Flight Web Application Entrypoint HTML` --references--> `Vite Logo Asset`  [EXTRACTED]
  packages/web/index.html → packages/web/public/vite.svg
- `CalendarImport()` --calls--> `filterNewFlights()`  [EXTRACTED]
  packages/web/src/CalendarImport.tsx → packages/core/src/dateUtils.ts
- `resolveTimezone()` --calls--> `getAirportTimezone()`  [EXTRACTED]
  packages/core/src/dateUtils.ts → packages/core/src/airports.ts
- `create()` --calls--> `getAirportTimezone()`  [EXTRACTED]
  packages/functions/src/trip.ts → packages/core/src/airports.ts
- `update()` --calls--> `getAirportTimezone()`  [EXTRACTED]
  packages/functions/src/trip.ts → packages/core/src/airports.ts

## Import Cycles
- None detected.

## Communities (45 total, 10 thin omitted)

### Community 0 - "Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Why does getAirportTimezone() connect Make My Flight Core Backend & Data to AWS Serverless SDK Dependencies?, Source Nodes

### Community 1 - "maps.ts"
Cohesion: 0.05
Nodes (65): alertMatchesAirport(), BART_STATIONS, bartToTransitAlerts(), formatBartAlertsSummary(), getBartAlerts(), getBartStationInfo(), isBartAirport(), OAK_KEYWORDS (+57 more)

### Community 2 - "trip.ts"
Cohesion: 0.09
Nodes (45): AirportInfo, AIRPORTS, getAirportAddress(), getAirportLabel(), getAirportTimezone(), calculateHoursUntilFlight(), calculateLeaveTime(), filterNewFlights() (+37 more)

### Community 3 - "App.tsx"
Cohesion: 0.06
Nodes (49): AddressAutocomplete(), AddressAutocompleteProps, loadGoogleMapsScript(), FlightData, FlightSegment, MultiSegmentResult, parseLocalDate(), Step (+41 more)

### Community 4 - "core/package.json"
Cohesion: 0.07
Nodes (32): dependencies, @aws-sdk/client-dynamodb, @aws-sdk/client-scheduler, @aws-sdk/lib-dynamodb, axios, date-fns, date-fns-tz, gtfs-realtime-bindings (+24 more)

### Community 5 - "web/package.json"
Cohesion: 0.05
Nodes (40): dependencies, aws-amplify, @aws-amplify/ui-react, axios, date-fns-tz, react, react-dom, react-router-dom (+32 more)

### Community 6 - "Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How does traffic prediction work from departure airport to Google Maps Routes API in Make My Flight?, Source Nodes

### Community 7 - "Issue tracker: GitHub"
Cohesion: 0.29
Nodes (6): Conventions, Issue tracker: GitHub, Pull requests as a triage surface, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 8 - "package.json"
Cohesion: 0.06
Nodes (33): dependencies, @aws-sdk/client-ses, date-fns, date-fns-tz, react-datepicker, @types/react-datepicker, devDependencies, dotenv (+25 more)

### Community 9 - "Make My Flight (makemyflight)"
Cohesion: 0.29
Nodes (6): Database Schema (DynamoDB Single-Table Design), Development & Operations, Key Domain Logic & Conventions, Make My Flight (makemyflight), Monorepo Architecture, Overview

### Community 10 - "Agent skills"
Cohesion: 0.33
Nodes (5): Agent Guidelines - Make My Flight, Agent skills, Domain docs, Issue tracker, Triage labels

### Community 11 - "Domain Docs"
Cohesion: 0.33
Nodes (5): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 12 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @types/node (+6 more)

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

### Community 19 - "core/src/feedback.ts"
Cohesion: 0.22
Nodes (11): Database, formatGitHubIssue(), FormatGitHubIssueParams, FormattedGitHubIssue, TYPE_LABELS, TYPE_PREFIXES, FeedbackDiagnostics, FeedbackType (+3 more)

### Community 20 - "google-maps.d.ts"
Cohesion: 0.14
Nodes (8): AddressComponent, Autocomplete, AutocompleteOptions, ComponentRestrictions, google.maps.event, google.maps.places, PlaceResult, Window

### Community 24 - "resolve_simple.js"
Cohesion: 0.33
Nodes (5): cron, dateUtils, fs, index, types

### Community 26 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, module, moduleResolution, paths, skipLibCheck, strict (+4 more)

### Community 31 - "flights.ts"
Cohesion: 0.27
Nodes (7): aeroHeaders(), cache, fetchWithRetry(), FlightResult, Flights, mapFlight(), parseLocalTime()

### Community 35 - "compilerOptions"
Cohesion: 0.40
Nodes (4): compilerOptions, module, moduleResolution, exclude

### Community 53 - "Make My Flight"
Cohesion: 0.08
Nodes (23): API Endpoints, APIs, Architecture, AWS Infrastructure, Backend, Deployment, Environment Variables, Features (+15 more)

## Knowledge Gaps
- **296 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `deploy` (+291 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 331 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `web/package.json`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `formatFlightTimeOnly()` connect `trip.ts` to `App.tsx`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `@aws-sdk/client-lambda` connect `trip.ts` to `functions/package.json`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _296 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `maps.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054203180785459264 - nodes in this community are weakly interconnected._
- **Should `trip.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08591466978375219 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._