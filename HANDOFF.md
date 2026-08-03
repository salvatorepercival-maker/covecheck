# CoveCheck — Claude Code Project Handoff

Use this document as the initial project brief for Claude Code. Treat it as the product source of truth unless I explicitly override it later.

## Your role

Act as my senior product engineer, UX designer, and pragmatic technical partner. Help me build CoveCheck incrementally. Favor a polished, dependable MVP over an oversized architecture.

Before implementing anything:

1. Inspect the repository and summarize the existing stack, structure, and reusable components.
2. Identify conflicts or missing decisions.
3. Propose a short implementation plan with small, verifiable phases.
4. Wait for my approval before making major architectural choices.

When implementing, preserve existing working code, keep changes scoped, run relevant checks, and explain any important tradeoffs in plain language.

## Product

**Name:** CoveCheck  
**Domain:** CoveCheck.com  
**Working tagline:** Know when the water is right.

CoveCheck tells ordinary people when conditions at a specific beach are favorable for calm family water activities—especially snorkeling and swimming.

It is not a surf forecast. Most ocean products are designed for surfers and describe bigger waves as “good.” CoveCheck reverses that perspective: calm, clear, low-energy water is good. The experience should answer one question immediately:

> Is this a good time for my family to snorkel here?

The initial reference location is **Cromwell’s Beach near Black Point in Honolulu, Hawaiʻi**, approximately `21.2570, -157.7970`.

The product must eventually support many beaches, because favorable conditions depend on each beach’s orientation, reef, entry, wind exposure, swell exposure, tide behavior, and local hazards.

## Target user

The primary user is a parent or recreational beachgoer, not an ocean-data expert. They may understand “waves,” “wind,” and “tide,” but should not need to interpret swell partitions, model grids, compass bearings, or marine forecast tables.

Users want:

- A clear, conservative recommendation
- The best two- or three-hour window
- Alerts when a good window is predicted
- A simple explanation of why conditions are good or poor
- Enough technical detail to verify the recommendation if desired
- A reminder that the final decision must be made at the shoreline

## Product principles

1. **Decision first, data second.** Lead with the recommendation and best window.
2. **Beach-specific, not island-wide.** The same forecast can affect neighboring beaches differently.
3. **Conservative for families.** Uncertain or borderline data should not produce an enthusiastic green recommendation.
4. **Explain the verdict.** Never show an unexplained score.
5. **No false safety guarantee.** Avoid declaring any beach “safe.” Use phrases such as “favorable forecast,” “good family window,” “use caution,” and “not recommended.”
6. **Not a surfing product.** Do not use surf-culture language, surfer ratings, aggressive wave imagery, or a dense surf-report layout.
7. **Beautifully simple.** The product should feel warm, calm, coastal, trustworthy, and modern—not clinical or nautical.

## Core interface

The home screen for a saved beach should contain:

1. CoveCheck branding and selected beach
2. A large current verdict:
   - **Great window**
   - **Possible—use caution**
   - **Not recommended**
   - **Not enough confidence**
3. A specific recommended time window, such as `7:15–9:45 AM`
4. A short explanation, such as “Calm water, gentle wind, and no active advisories”
5. A five- to seven-day selector using both words/icons and color
6. Four primary conditions:
   - Surf/wave energy
   - Wind and gusts
   - Tide stage
   - Active advisories
7. A compact hourly timeline showing when conditions improve or deteriorate
8. A primary action: **Alert me on great days**
9. Expandable forecast details for advanced users
10. A visible shoreline-check reminder

The UI must work extremely well on mobile, remain accessible, and never rely on color alone.

## MVP scope

### Include

- One supported beach initially: Cromwell’s Beach
- Seven-day hourly forecast ingestion
- A deterministic, explainable conditions engine
- Best-window calculation
- Current and future day views
- Email or push-style alert subscription
- One evening-ahead alert and an optional morning reconfirmation
- Active hazard suppression
- Data freshness and last-updated information
- Basic logging of inputs, output verdict, and reason codes
- A disclaimer and visible final shoreline assessment guidance

### Exclude initially

- Native iOS or Android apps
- User-generated condition reports
- Social features
- Live webcams or computer vision
- AI-generated safety verdicts
- Payments
- Hundreds of beaches
- Precise underwater visibility claims
- A universal 0–100 score presented without explanation

Start as a responsive web app/PWA unless the existing repository strongly supports another approach.

## Data sources

Use server-side adapters so providers can be swapped later. Never expose provider-specific response formats directly to the UI.

### 1. Open-Meteo Marine API

Documentation: `https://open-meteo.com/en/docs/marine-weather-api`

Base endpoint:

`https://marine-api.open-meteo.com/v1/marine`

Initial hourly variables:

- `wave_height`
- `wave_direction`
- `wave_period`
- `swell_wave_height`
- `swell_wave_direction`
- `swell_wave_period`
- Secondary swell variables when available

Use `timezone=Pacific/Honolulu`, imperial units in the UI, and sea-cell selection where appropriate.

Important: modeled offshore significant wave height is not the same thing as breaking surf-face height at the beach. Preserve this distinction in the data model and product copy.

### 2. Open-Meteo Weather API

Base endpoint:

`https://api.open-meteo.com/v1/forecast`

Initial hourly variables:

- `wind_speed_10m`
- `wind_direction_10m`
- `wind_gusts_10m`
- `precipitation`

### 3. NOAA CO-OPS tide predictions

Documentation: `https://api.tidesandcurrents.noaa.gov/api/prod/`

Initial station: **Honolulu 1612340**

Use:

- `product=predictions`
- `datum=MLLW`
- `time_zone=lst_ldt`
- `units=english`
- JSON format

Retrieve enough interval data to determine tide height, direction, rate of change, high/low times, and whether a candidate window is rising, falling, or near slack.

### 4. National Weather Service alerts

Point endpoint:

`https://api.weather.gov/alerts/active?point=21.257,-157.797`

Include the descriptive `User-Agent` header requested by NWS.

Hazards should override an otherwise favorable score when applicable. Pay particular attention to:

- High Surf Advisory or Warning
- Beach Hazards Statement
- Coastal Flood Advisory or Warning
- Flooding and heavy-rain hazards

### 5. Future validation sources

Design adapters with room for:

- NWS Honolulu Surf Zone Forecast
- PacIOOS nearshore models and buoys
- NOAA/NDBC buoy observations
- Hawaiʻi beach safety or water-quality advisories

Do not scrape fragile pages in the first implementation if a stable API or structured feed is available.

## Normalized data model

Create provider-neutral types resembling:

```ts
type HourlyBeachConditions = {
  timestamp: string;
  waveHeightFt: number | null;
  waveDirectionDeg: number | null;
  wavePeriodSec: number | null;
  swellHeightFt: number | null;
  swellDirectionDeg: number | null;
  swellPeriodSec: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  windDirectionDeg: number | null;
  precipitationIn: number | null;
  tideHeightFt: number | null;
  tideStage: "rising" | "falling" | "near-high" | "near-low" | "unknown";
  activeHazards: BeachHazard[];
  sourceFreshness: SourceFreshness;
};

type BeachProfile = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  tideStationId: string;
  exposedSwellDirections: DirectionRange[];
  favorableWindDirections: DirectionRange[];
  thresholds: BeachThresholds;
  entryNotes: string[];
};
```

Keep beach-specific judgment in versioned configuration, not scattered conditionals.

## Initial Cromwell’s profile

Treat these as conservative starting assumptions to be calibrated through observation—not scientifically proven constants:

- Coordinates: `21.2570, -157.7970`
- Timezone: `Pacific/Honolulu`
- Tide station: `1612340`
- Direct swell exposure: approximately SE through SW (`135°–225°`)
- Favorable family window: generally morning, especially before stronger trade winds develop
- Initial preferred wind: `<= 8 mph`
- Initial maximum gust: `<= 12 mph`
- Initial preferred south-shore surf concept: approximately `0–2 ft`
- `3 ft` or uncertain: caution for a family recommendation
- `4–6 ft`: not recommended
- Prefer adequate water over the shallow reef, commonly a mid-to-higher or rising tide, but do not assume high tide automatically creates good conditions
- Recent heavy rain and poor water-quality advisories should block a green verdict

Because modeled offshore wave height and NWS surf-face height differ, do not blindly apply the same numeric threshold to both. Name every threshold by its underlying measurement.

## Recommendation engine

Build this as deterministic functions with unit tests. Do not use an LLM to determine safety or conditions.

For each hourly record:

1. Validate freshness and required fields.
2. Apply hard blockers:
   - Relevant active hazard
   - Clearly excessive wave/surf conditions
   - Extreme gusts
   - Stale or critically incomplete inputs
3. Evaluate factors:
   - Wave/swell energy and direction
   - Wind speed, gusts, and direction
   - Tide height and stage
   - Rain and water-quality risk when available
   - Forecast confidence/data completeness
4. Return:
   - verdict
   - machine-readable reason codes
   - plain-language reasons
   - confidence level
5. Combine adjacent favorable hours into candidate windows.
6. Require at least two continuous favorable hours for a “Great window.”
7. Rank candidate windows, favoring lower wave energy, lighter wind, adequate tide, morning hours, and higher confidence.

Suggested internal verdicts:

```ts
type Verdict = "great" | "caution" | "not_recommended" | "insufficient_data";
```

Example reason codes:

```ts
type ReasonCode =
  | "CALM_WIND"
  | "LOW_WAVE_ENERGY"
  | "FAVORABLE_TIDE"
  | "DIRECT_SOUTH_SWELL"
  | "STRONG_GUSTS"
  | "ACTIVE_BEACH_HAZARD"
  | "RECENT_HEAVY_RAIN"
  | "STALE_DATA"
  | "INSUFFICIENT_WINDOW";
```

The UI should produce explanations from stable reason-code copy, not arbitrary generated language.

## Alert behavior

Users subscribe to a beach and choose:

- Days they are available
- Earliest and latest acceptable time
- Minimum window duration
- Evening-before alert
- Morning reconfirmation

An alert should state:

- Beach
- Verdict
- Best forecast window
- Two or three supporting reasons
- Any uncertainty
- Forecast update time
- Reminder to reassess at the shoreline

Avoid notification spam. Do not resend unless the recommendation materially improves, worsens, or the morning reconfirmation is due.

## Safety and language requirements

CoveCheck is decision support, not a safety certification.

Required concepts:

- Conditions can change rapidly.
- Forecast models cannot see the exact shoreline entry, surge, visibility, or every local hazard.
- Users should observe the water before entering.
- Users should follow lifeguards, posted signs, closures, and official warnings.
- When uncertain, do not enter.
- Children and weak swimmers require more conservative choices.

Never write:

- “The beach is safe.”
- “Guaranteed good snorkeling.”
- “No risk.”

Prefer:

- “Forecast conditions look favorable.”
- “Good family window.”
- “Possible—use caution.”
- “Not recommended at this beach.”

## Suggested architecture

Adapt this to the repository rather than forcing it:

- Responsive web application/PWA
- TypeScript end to end
- Server-side API routes or functions for provider calls
- Provider adapter layer
- Normalized forecast storage/cache
- Deterministic recommendation-engine package
- Scheduled forecast refresh and alert evaluation
- Database tables for beaches, users/subscriptions, forecast runs, verdicts, and alert deliveries
- Structured logs for source failures and verdict reasoning

Keep API calls and secrets server-side. Add caching and provider timeouts. A failed provider should degrade gracefully rather than crash the page or silently present old data as current.

## Data and reliability rules

- Store fetched-at and source observation/forecast timestamps separately.
- Show users when the recommendation was updated.
- Define staleness thresholds per provider.
- Preserve raw provider responses for short-term debugging where reasonable.
- Validate all external responses at runtime.
- Use retries with limits and exponential backoff.
- Do not turn `null`, missing, or failed data into zero.
- Log which engine/configuration version produced each verdict.
- Make time-zone handling explicit; Cromwell’s uses Hawaiʻi Standard Time year-round.

## Testing expectations

At minimum, test:

- Direction-range handling across 0°/360°
- Unit conversions
- Tide interpolation and tide-stage calculation
- Missing and stale data
- Active-hazard overrides
- Direct south swell penalties
- Adjacent-hour window grouping
- Minimum window length
- Ranking two candidate windows
- Day boundaries in `Pacific/Honolulu`
- No green verdict from incomplete critical inputs

Use fixtures for:

1. Excellent calm morning
2. Borderline 2–3 ft south swell
3. High surf advisory
4. Calm weather but stale marine data
5. Good early window followed by strengthening wind
6. Strong offshore wind despite small waves
7. Favorable tide but excessive swell

## Visual direction

The product should feel:

- Calm
- Approachable
- Premium but not luxurious
- Family-friendly without looking childish
- Ocean-inspired without defaulting to generic turquoise gradients everywhere

Use generous space, restrained icons, strong typography, and a clear status focal point. Technical data should be progressively disclosed. Green/caution/red must always be paired with labels and icons.

Do not design it like:

- Surfline
- A marine navigation console
- A generic weather app
- A tourism booking website
- A children’s cartoon app

## First implementation request

After inspecting the repository, propose the smallest vertical slice that proves the product:

1. Fetch real Cromwell’s marine, wind, tide, and alert data server-side.
2. Normalize it into one hourly structure.
3. Run a tested initial recommendation engine.
4. Calculate the best two-hour window.
5. Render one polished mobile-first beach screen.
6. Clearly label forecast freshness and uncertainty.

Do not begin with authentication, payments, maps, or multi-beach search. Prove the Cromwell’s recommendation first.

## How I want you to work with me

- Be opinionated when a decision affects product quality.
- Explain tradeoffs concisely.
- Ask before expanding scope.
- Do not replace specific requirements with generic boilerplate.
- Show me the actual UI frequently.
- Validate with real API payloads, not only mocked happy paths.
- Keep a short project decision log.
- At the end of each phase, summarize what changed, what was tested, and what remains uncertain.

---

# Suggested follow-up prompts for Claude Code

Use these one at a time after the initial handoff.

## Prompt 1 — Repository assessment

> Read the CoveCheck handoff and inspect this repository. Do not edit anything yet. Tell me what stack already exists, what can be reused, the key technical risks, and your recommended vertical-slice plan. Identify every product or architecture decision you need from me before implementation.

## Prompt 2 — Data spike

> Implement a narrow data-source spike for Cromwell’s Beach. Call the selected marine, weather, tide, and NWS alert sources from the server, validate their responses, normalize them into typed hourly records, and add fixtures/tests. Do not build the final UI yet. Show me sample normalized output and explicitly identify any mismatch between offshore wave-model data and beach surf conditions.

## Prompt 3 — Recommendation engine

> Build the first deterministic CoveCheck recommendation engine using versioned Cromwell’s configuration. Add hard blockers, reason codes, confidence handling, adjacent-hour window grouping, and comprehensive unit tests. Do not use an LLM or unexplained score. Show how the engine evaluates the supplied excellent, caution, hazard, and stale-data fixtures.

## Prompt 4 — Product UI

> Build the polished mobile-first Cromwell’s beach screen against the normalized engine output. The first screen must answer whether conditions are favorable, show the best window, explain why, display the next five to seven days, and progressively disclose technical details. Preserve all safety language and avoid a surf-dashboard aesthetic. Run the app and verify the main mobile and desktop layouts.

## Prompt 5 — Alerts

> Add CoveCheck alert subscriptions for a saved beach. Support availability days, acceptable hours, minimum window length, evening-ahead alerts, and optional morning reconfirmation. Prevent duplicate alerts and record the forecast/verdict version used for each send. First implement one delivery channel cleanly rather than several incomplete channels.

## Prompt 6 — Production-readiness review

> Audit the CoveCheck MVP for incorrect ocean-data assumptions, unsafe language, stale-data behavior, time-zone bugs, provider failure modes, alert duplication, accessibility, mobile layout, and missing tests. Rank findings by severity. Fix only critical and high-severity issues after showing me the audit.
