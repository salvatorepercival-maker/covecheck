# CoveCheck decision log

Newest first. Each entry records what was decided, why, and what would reverse it.
`HANDOFF.md` is the product source of truth; this file records where implementation
deviates from it and why.

---

## 1. Surf height is direction-filtered, and every height field is named for its measurement

**Decided:** 2026-08-02 · **Status:** active

The wave model's raw output is not a usable surf signal for Cromwell's. Measured
against live data on 2026-08-02:

| Signal | Value | Source |
| --- | --- | --- |
| `modelSigWaveHeightFt` | 4.5–6.0 ft from ~104° | Open-Meteo `wave_height`, offshore, all partitions |
| NWS south-facing surf | 1–3 ft | NWS Oahu SRF, issued 15:55 HST |
| NWS east-facing surf | 4–6 ft | same product |
| `exposedSwellHeightFt` | 0.0–2.6 ft | partitions inside 135°–225°, combined in quadrature |

The model's 4.5–6.0 ft matches the **east-facing** band, because that is the
persistent trade-wind windswell. Cromwell's is south-facing. Applying the spec's
Cromwell's thresholds (`4–6 ft` = not recommended) to the raw figure returns
"Not recommended" on an ordinary calm south-shore morning — and since Oahu has
trade winds most of the year, it would do so most days. The failure is in the
conservative direction, so it is not a safety problem; it is an *existence*
problem, because a permanently-red product never surfaces the good family windows
it exists to find.

**The engine reasons about `exposedSwellHeightFt`**: each wave partition is
admitted only if its own direction falls inside the beach's exposure window, then
survivors are combined in quadrature. Partitions are judged independently, so a
4 ft east windswell alongside a 1 ft south swell yields 1 ft, not 4.1 ft.

**Naming rule, load-bearing:** every height field states the measurement that
produced it. There is deliberately no `waveHeightFt` field, which is a deviation
from the spec's suggested `HourlyBeachConditions`. A generically-named field
invites code to apply a surf-face threshold to a model number, which is the exact
bug above. `lib/normalize.test.ts` asserts the two stay separated, and that no
`waveHeightFt` key exists.

**Cross-check:** the NWS SRF south-facing band bounds magnitude but never gates a
verdict alone. `npm run spike` compares the two and warns on divergence beyond
3 ft. The SRF table is fixed-width text, so its parser degrades to "no bound
available" rather than failing a render.

**Would reverse this:** a nearshore model with real bathymetry (PacIOOS) that
reports surf-face height at the cove directly. Then `exposedSwellHeightFt` becomes
a fallback rather than the primary signal.

---

## 2. Provider grid cells are pinned explicitly, and the wind thresholds are not yet trustworthy

**Decided:** 2026-08-02 · **Status:** wind calibration **unresolved**

Open-Meteo silently relocates a requested coordinate to its nearest grid cell.
Passing Cromwell's own `21.2570, -157.7970`:

| Endpoint | Resolved cell | Displacement | Elevation |
| --- | --- | --- | --- |
| Marine | `21.2917, -157.7917` | 3.9 km inland | 4 m |
| Weather | `21.3357, -157.7982` | 8.8 km inland | 4 m |

Both are land cells. `cell_selection=sea` does not change the result — the
returned cell was byte-identical. The beach coordinate is therefore used only for
display and the NWS alerts point query; both Open-Meteo calls use a deliberately
chosen offshore point recorded in `CROMWELLS.cells`, along with the cell each one
resolved to and its elevation. `checkResolvedCell` fails the spike if a cell
drifts or stops being a sea cell, because a relocated cell still returns a valid
200 full of plausible numbers from the wrong place.

Note the two endpoints resolve the *same* request to *different* cells
(`21.208/-157.792` marine, `21.195/-157.752` weather) — the grids differ in
resolution, so each is recorded separately.

**Unresolved:** the pinned sea cell reported 23–24 mph sustained and 30–31 mph
gusts for the morning of 2026-08-02, while NWS gave shoreline wind as northeast
15–20 mph. Open water has no land friction so the sea cell reads high; the inland
cell read higher still (35 mph gusts). Neither matches the shoreline.

The spec's `≤ 8 mph` / `≤ 12 mph` gust thresholds are **shoreline-referenced**, so
they cannot be compared against raw cell values — doing so would block every hour
of every day on `STRONG_GUSTS`. This is recorded as calibration gap
`wind-offshore-vs-shoreline` on the beach profile with `status: 'unresolved'`.

**The engine must consult that gap before gating on wind.** Resolving it needs
either shoreline observation across several mornings, or adopting the NWS point
forecast as the wind source. Deliberately *not* chosen: a fitted offset, which
would be unvalidated guesswork that drifts with wind direction.

---

## 3. Tide position is a fraction of the local day's range, not absolute feet

**Decided:** 2026-08-02 · **Status:** active

Honolulu's tidal range is small: 2026-08-02 spanned 0.16 to 1.74 ft MLLW, a total
swing of 1.58 ft. The spec's "prefer adequate water over the shallow reef,
commonly a mid-to-higher or rising tide" cannot be an absolute foot threshold at
that range, so `tideRangeFraction` expresses position within the local calendar
day's own swing (0 = day's low, 1 = day's high), and the threshold is
`minTideRangeFraction`.

Tide *stage* is derived from the high/low turning points (`interval=hilo`), not by
differencing hourly samples — near a turn, hourly differences are small enough
that noise flips the sign. Both CO-OPS products are fetched because they are not
interchangeable.

A height that will not parse becomes `null`, never `0`: at the MLLW datum 0 ft is
a real, plausible low tide, so a coerced failure would be indistinguishable from
data.

---

## 4. Platform and toolchain choices

**Decided:** 2026-08-02 · **Status:** active

Next.js **16.2.12**, which differs materially from older App Router conventions.
Relevant constraints confirmed against `node_modules/next/dist/docs/`:

- **Cache Components** (`cacheComponents: true`) is the current caching model —
  `use cache` plus `cacheLife`/`cacheTag`, with PPR as the default. This is how
  forecast caching and freshness reporting will be built in Phase 2.
- `use cache` **cannot** appear in a Route Handler body; it must be extracted to a
  helper. This shapes the refresh endpoint.
- `revalidateTag` now requires a second `cacheLife` argument; the single-argument
  form is a type error. `updateTag` is the read-your-writes variant.
- `params`/`searchParams`/`cookies`/`headers` are async-only; sync access was
  removed, not merely deprecated.
- `middleware` is renamed `proxy`; `next lint` is removed in favour of the ESLint
  CLI.

**Vitest** for tests (`npm test` is hermetic and offline; `npm run spike` hits
live providers). **Zod** validates every provider response at the boundary — a 200
with an unexpected shape is a failure, not data. **No database** until alerts
(Phase 5); nothing before then needs persistence.

Timezone handling is pure string math against a constant UTC-10 offset because
Hawaiʻi does not observe daylight saving. **This assumption breaks for any beach
outside Hawaiʻi** and `lib/time.ts` must be revisited before adding one.

---

## 5. Failure is always distinguishable from data

**Decided:** 2026-08-02 · **Status:** active

Provider fetches return a result that must be destructured rather than throwing,
so "this source failed" cannot be mistaken for a reading. Nothing coerces a
missing value to `0`, which would read as flat calm.

The distinction that matters most: an **empty** NWS alert list means "no active
hazards" and can support a green verdict, whereas a **failed** alerts fetch means
the hazard state is unknown and must not. Normalization emits a warning making
that explicit, and the engine must treat the two differently.

Retries are capped (3 attempts, ceiling 5) with exponential backoff. Schema
mismatches and 4xx responses are not retried, since the response is deterministic.

