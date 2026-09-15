# Graph Report - flight-ai-alerts  (2026-09-15)

## Corpus Check
- 79 files · ~43,866 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .css 2)

## Summary
- 539 nodes · 801 edges · 44 communities (23 shown, 11 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6337f004`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- profile.ts
- maps.ts
- trip.ts
- App.tsx
- core/package.json
- web/package.json
- twilio.ts
- Issue tracker: GitHub
- package.json
- Make My Flight (makemyflight)
- Agent skills
- Domain Docs
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
6. `formatLeaveTime()` - 9 edges
7. `TransitAlert` - 9 edges
8. `react` - 9 edges
9. `App()` - 9 edges
10. `Make My Flight` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Make My Flight Web Application Entrypoint HTML` --references--> `Vite Logo Asset`  [EXTRACTED]
  packages/web/index.html → packages/web/public/vite.svg
- `App()` --calls--> `formatFlightDate()`  [EXTRACTED]
  packages/web/src/App.tsx → packages/core/src/dateUtils.ts
- `App()` --calls--> `formatFlightTimeOnly()`  [EXTRACTED]
  packages/web/src/App.tsx → packages/core/src/dateUtils.ts
- `App()` --calls--> `normalizeFlightNumber()`  [EXTRACTED]
  packages/web/src/App.tsx → packages/core/src/dateUtils.ts
- `App()` --calls--> `filterNewFlights()`  [EXTRACTED]
  packages/web/src/App.tsx → packages/core/src/dateUtils.ts

## Import Cycles
- None detected.

## Communities (44 total, 11 thin omitted)

### Community 0 - "profile.ts"
Cohesion: 0.42
Nodes (8): confirmVerification(), decodeJWT(), dynamodb, get(), getUserIdFromEvent(), sendVerification(), twilioClient, update()

### Community 1 - "maps.ts"
Cohesion: 0.06
Nodes (64): alertMatchesAirport(), BART_STATIONS, bartToTransitAlerts(), formatBartAlertsSummary(), getBartAlerts(), getBartStationInfo(), isBartAirport(), OAK_KEYWORDS (+56 more)

### Community 2 - "trip.ts"
Cohesion: 0.09
Nodes (45): AirportInfo, AIRPORTS, getAirportAddress(), getAirportLabel(), getAirportTimezone(), calculateHoursUntilFlight(), calculateLeaveTime(), filterNewFlights() (+37 more)

### Community 3 - "App.tsx"
Cohesion: 0.07
Nodes (48): AddressAutocomplete(), AddressAutocompleteProps, loadGoogleMapsScript(), App(), FlightData, FlightSegment, formatDateOnly(), getTripDateOnly() (+40 more)

### Community 4 - "core/package.json"
Cohesion: 0.10
Nodes (20): dependencies, @aws-sdk/client-dynamodb, @aws-sdk/client-scheduler, @aws-sdk/lib-dynamodb, axios, date-fns, date-fns-tz, gtfs-realtime-bindings (+12 more)

### Community 5 - "web/package.json"
Cohesion: 0.05
Nodes (39): dependencies, aws-amplify, @aws-amplify/ui-react, axios, date-fns-tz, react, react-dom, react-router-dom (+31 more)

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

### Community 13 - "functions/package.json"
Cohesion: 0.09
Nodes (22): dependencies, @aws-sdk/client-lambda, @flight-ai/core, twilio, devDependencies, sst, @types/aws-lambda, @types/node (+14 more)

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
- **281 isolated node(s):** `name`, `private`, `workspaces`, `dev`, `deploy` (+276 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 314 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `web/package.json`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `formatFlightTimeOnly()` connect `trip.ts` to `App.tsx`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `@aws-sdk/client-lambda` connect `functions/package.json` to `trip.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `name`, `private`, `workspaces` to the rest of the system?**
  _281 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `maps.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05527805527805528 - nodes in this community are weakly interconnected._
- **Should `trip.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09013914095583787 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._