# CoveCheck decision log

Newest first. Each entry records what was decided, why, and what would reverse it.
`HANDOFF.md` is the product source of truth; this file records where implementation
deviates from it and why.

**On the numbering.** Entry numbers are permanent identifiers, not positions —
code comments, `AGENTS-CHARTER.md`, and other entries all cite them
(`grep -rn 'DECISIONS.*#[0-9]'`). Never renumber an entry; append the next number,
and use a suffix such as `#5b` for an entry that belongs beside an existing one.

**#14 is missing.** It was never written. `lib/providers/open-meteo.ts:95` cites
it for why the secondary and tertiary swell partitions are requested — the fix
landed in `da04034`, the decision entry did not. The number is left unused rather
than reassigned, so that citation is not silently pointed at the wrong decision.
Verified 2026-09-21: no `## 14.` has existed on any branch in this file's history.

---

## 15. The surf forecast cross-checks the model; it does not outvote it

**Decided:** 2026-08-03 · **Status:** active · **supersedes the SRF gating in #6 and #11**

The same structural failure happened twice, and the second time made the cause
unmistakable:

| | ceiling | NWS band | result |
| --- | --- | --- | --- |
| 2026-08-02 | 2 ft | 1–3 ft | all 91 hours capped |
| 2026-08-03 | 3 ft | 2–4 ft | all 91 hours capped |

Both times the response was to raise the ceiling. That was treating a role error
as a calibration error. South-shore surf varies seasonally, so **any** fixed
ceiling read against the upper bound of a drifting published range will wall off
the forecast again — the third occurrence was already loaded.

Worse, #1 already stated the correct rule and the code did not implement it:

> *"the NWS SRF south-facing band bounds magnitude but never gates a verdict alone"*

`SRF_MARGINAL_SURF` carried `negative` severity and its own thresholds. It never
read `exposedSwellHeightFt` at all, so it was not cross-checking anything — it
voted independently and could veto a week while the direction-filtered model said
the cove was calm. That inverts which figure is more relevant: NWS publishes one
number for an entire shore, the model figure is filtered to the directions this
specific cove is open to.

**The fix restores the intended role rather than picking a fourth number.**

*The comparison is categorical, never numeric.* A surf-face height and an offshore
height are different measurements — #1 forbids subtracting them, so "SRF is N ft
above the model" was not available. Instead `bandOf` places each in the same
three-way judgement (`calm` / `marginal` / `excessive`) and the *judgements* are
compared. Sound, and immune to the units confusion.

*Disagreement is reported, not enforced.* When the model reads calm and the shore
forecast is elevated, `SRF_DISAGREES_WITH_MODEL` fires as a `caveat`: it appears
in the reasoning and costs confidence, but does not force `caution`. When both
agree the model gates on its own and the cross-check stays silent, so one physical
situation is never counted twice.

*One unilateral gate remains, deliberately narrow.* `srfExtremeSurfFaceFt` (6 ft)
blocks outright — advisory-adjacent, matching the top of HANDOFF.md's "4–6 ft: not
recommended". Above that, no local sheltering argument should produce a
recommendation. Ordinary drift (2–4, 3–5) stays clear of it.

Effect on the live week: 0/91 great hours → 57/91, with tide the discriminating
factor, which is what it should have been all along.

**The wider lesson, and it is the same one as #12.** There, two gridded models
agreeing was mistaken for ground truth. Here, an authoritative-sounding source
disagreeing with the beach-specific number was mistaken for grounds to override
it. Both times the error was letting a broader, less local signal outrank a
narrower, more local one. A disagreement between sources is a reason to flag and
investigate, not to hand the verdict to whichever source sounds more official.

---

## 13. Tide is a band, not a scale — and the band is still open

**Decided:** 2026-08-02 · **Status:** band **provisional and now gating**
(0.0–1.5 ft MLLW, `n=1`); logic and labelling fixed; edges still open

> **Status corrected 2026-09-21** (`builder`, documentation only). This entry was
> written while the band was unset. A provisional band has since been set and it
> *does* gate verdicts — corrected inline below.

The original model was monotonic: more water over the reef scored better, and the
UI labelled a near-high tide "Plenty of water". **That is backwards at this
beach.** At a shallow reef-entry cove both ends are worse than the middle — low
exposes reef and rock, high means stronger current and less shallow standing area
for children.

Two changes followed:

**Unit.** Tide position moved from *fraction of the day's range* to **feet above
MLLW**. Reef coverage is absolute: the rock sits at a fixed elevation, so depth
over it is what matters, not where the tide sits within a varying daily swing.
This corrects #3, which was right that absolute feet are meaningless for "is the
tide relatively high" and wrong to conclude they are the wrong unit for "is there
enough water over the reef".

**Shape.** `favorableTideFt` is a band with a negative at *each* end
(`LOW_TIDE_OVER_REEF`, `HIGH_TIDE_LESS_SHALLOW`), and `tideFavorability` — 1
inside the band, tapering outside — replaces "more is better" in window ranking.

One in-water observation (2026-08-02 ~09:00, just after the 07:51 low of 0.0 ft,
rising — a good session) points the band **low-to-mid**. That is one point, not a
curve, so at the time of this decision the engine did not gate on tide at all and
the UI said the range was not yet set rather than implying a judgement.
`TIDE_NOT_CALIBRATED` is a `caveat`, not a `negative`: unlike wind, the swell
picture is fully assessable without tide, so it costs confidence rather than
capping the verdict.

**Superseded on the gating question** (corrected 2026-09-21). A provisional band
of `0.0–1.5 ft` MLLW is now set on the profile and **does** gate: both ends are
`negative` (`LOW_TIDE_OVER_REEF`, `HIGH_TIDE_LESS_SHALLOW` — `lib/engine/reasons.ts:131`
and `:140`), so tide can cap a verdict. `TIDE_NOT_CALIBRATED` now fires only while
the gap is `unresolved`; the gap is `provisional`, so instead every gated hour
carries `TIDE_BAND_PROVISIONAL`, a `caveat` that keeps the one-observation basis
attached to the verdict rather than leaving it in the repository. The UI marks the
band provisional too (`components/tide-card.tsx:206-208`).

Still open, and the reason the band is provisional rather than calibrated: where
the band edges sit — **no observation has tested the upper edge at all** — and
whether **stage** belongs in the model, since the good session was low *and
rising*, and rising may matter independently of height.

---

## 12. Two models agreeing is not ground truth

**Decided:** 2026-08-02 · **Status:** active · **supersedes the reasoning in #2**

Sequence worth recording, because the reasoning failed twice in opposite
directions:

1. Open-Meteo read 23 mph at the cove. The SRF *narrative* said "northeast winds
   15 to 20 mph", so a calibration gap was raised. **Wrong comparison** — that
   sentence is a rounded, zone-wide statement in the TONIGHT section, not a point
   forecast.
2. Checked against NWS *gridded* data for the exact beach point, the two agreed
   within ~2 mph, so the gap was closed and the data declared sound. **Also
   wrong** — for the opposite reason.
3. An in-water observation at 2026-08-02 ~09:00 reported **calm** water while both
   models read 23 mph sustained / 29 mph gusts ENE.

Both models run on grids of kilometres. This cove is tens of metres wide, in the
lee of Black Point and Diamond Head. Neither resolves the sheltering, so their
agreement measured shared blindness, not accuracy. **Only observation settles a
micro-location.**

The fix keeps the data honest and puts the shelter in the *threshold*: offshore
ceilings are anchored above the observed reading (`great: 25`, `caution: 32`
sustained) rather than the raw figure being offset downward. Anchored on **n=1** —
a genuinely rough ENE morning is needed to find where the ceiling really sits.

---

## 11. Wind gating is direction-dependent, because fetch is

**Decided:** 2026-08-02 · **Status:** active

A single speed limit treats 20 mph blowing out to sea the same as 20 mph blowing
in off it. Only the onshore case has ocean fetch to build chop on; offshore wind
flattens the surface. This is why Oahu's south shores are the swimmable ones in
trade season while the east shores are rough.

`windExposureFor` derives offshore / onshore / cross geometrically from
`shoreAspect`, so there is one source of truth. The hand-listed
`favorableWindDirections` arc was deleted — it was set to 315–45°, which excluded
the ENE trades that actually blow offshore here and were the dominant wind all
week. Cross-shore is gated with the stricter onshore limits, since alongshore
fetch can still build chop.

Also corrected in the same pass: `exposedSwellFt` and `srfSurfFaceFt` had been set
to identical values (2 / 3 ft), which is exactly what #1 forbids — a copy-paste
across two different measurements. And `srfSurfFaceFt.great` of 2 ft was
unreachable by construction: NWS publishes surf as a *range*, and 1–3 ft is about
the narrowest calm band it issues for a Hawaii south shore, so comparing the upper
bound against 2 ft could never pass in any conditions. Both are now 3 / 4 ft,
which coincide **empirically for this beach in summer, not as a rule** — the
comment in the profile says so explicitly, to stop a future edit merging them.

---

## 10. The screen shows the offshore-versus-exposed gap rather than hiding it

**Decided:** 2026-08-02 · **Status:** active

The expandable detail panel prints both figures side by side. On 2026-08-02 that
reads:

```
Reaching this beach          0.0 ft   inside 135–225°
Total sea state offshore     5.4 ft   from the E
Primary swell                2.2 ft   from the ENE
Wind-driven waves            4.1 ft   from the ENE
Weather Service surf face    up to 3 ft   south-facing shores
```

A sceptical local who knows the east shore is big that day can see exactly why
CoveCheck is not alarmed about a south-facing cove, instead of being asked to
trust a single number. Unresolved calibration gaps are printed in the same panel,
verbatim from the beach profile — a limitation the engine knows about should not
be visible only in the repository.

The colour system never carries meaning alone: every verdict pairs a distinct icon
*silhouette* (calm horizon, warning triangle, struck-through circle, question)
with a text label, and the hourly timeline encodes verdict in bar *height* as well
as hue.

---

## 9. Caching is split so freshness cannot lie

**Decided:** 2026-08-02 · **Status:** active

`getForecastBundle` is cached (`use cache` + `cacheTag`); `getBeachReport` is
dynamic, behind `connection()`. Only the six network calls are cached. Freshness,
staleness and "which hour is now" are recomputed per request, because a clock read
inside the cached function would freeze a timestamp into the cache entry and make
the "updated N minutes ago" line wrong.

`cacheLife` is `{ stale: 300, revalidate: 900, expire: 1800 }`. **The `expire`
value is not arbitrary**: it equals the tightest staleness limit in
`STALENESS_LIMITS_SECONDS` (alerts, 30 minutes). Serving an entry older than that
would make the engine correctly report its own inputs as stale and refuse to give
a verdict. If either number changes, both must.

The whole `BeachProfile` is passed as a cache-key argument so editing a threshold
or exposure window produces a new entry rather than serving a verdict computed
under old configuration.

The page is Partial Prerendered: branding and the shoreline framing prerender into
the static shell, the report streams in behind `<Suspense>`.

---

## 8. A recommendation is a tightened slice, not the whole favorable stretch

**Decided:** 2026-08-02 · **Status:** active

Grouping adjacent favorable hours produced a correct but useless answer: because
uncalibrated wind (see #7) caps every hour at the same verdict, every usable hour
merged into a single 06:00–18:00 block on all seven days. "Come to the beach
sometime today" is not the specific window HANDOFF.md asks for.

`bestSubWindow` slides a fixed-length frame (default three hours, never shorter
than `minWindowHours`) across the stretch and scores each position with the *same*
weights as the top-level ranking, so the recommended slice can never contradict
the day ranking. Live output now varies meaningfully by day — 06:00–08:00,
07:00–09:00, 11:00–13:00 — driven by real tide and wind movement.

Both are kept: `bestWindow` is the full favorable stretch, `recommendedWindow` is
what the UI should lead with.

---

## 7. Uncalibrated wind caps every verdict at "use caution"

**Decided:** 2026-08-02 · **Status:** **inert** — the gap it depends on (#2) is
resolved, so the cap no longer fires · mechanism retained and tested

> **Status corrected 2026-09-21** (`builder`, documentation only — no code
> changed). The reasoning below stands as written; three factual claims in it had
> gone stale and are fixed inline. Note what resolved the gap: a **single**
> in-water observation (`lib/beach/cromwells.ts:108`, `n=1`), which is the basis
> this entry itself argued was too thin to calibrate from. That tension is real
> and is left visible rather than edited away.

`WIND_NOT_CALIBRATED` has severity `negative`, not `caveat`, so no hour can be
rated `great` while the wind calibration gap is unresolved. When this was
decided, that meant **the product had no green days, by design.**

**That consequence no longer holds.** Gap #2 was resolved in `78cdc8a`, so
`WIND_NOT_CALIBRATED` no longer fires for Cromwell's and green hours are
reachable — that commit took the live week from 0/91 to 91/91 great hours. The
severity itself is unchanged (`lib/engine/reasons.ts:188`, asserted at
`lib/engine/reasons.test.ts:126`): the mechanism is intact and still applies to
any beach whose wind gap is open.

Wind is a primary determinant of calm water. HANDOFF.md is explicit that
uncertain data must not produce an enthusiastic green recommendation, and an
unassessable primary factor is exactly that. This also keeps the calibration gap
*visible* rather than papered over.

An intermediate approach was tried and rejected. Judging wind by its percentile
within the forecast period is bias-invariant, so it looked like a way to keep
gating on wind — but on a uniformly calm morning the top quartile is *still calm*,
and labelling a 8 mph hour "gusty" because 5 mph hours exist elsewhere would be
simply false. Fitting an offset from the observed cell-vs-shoreline difference was
also rejected: it would be unvalidated guesswork that drifts with wind direction.

What the relative signal is still used for, because ordering survives an unknown
bias: **ranking** windows, and reporting `CALM_WIND` as a positive. It is never
used to downgrade.

Resolving gap #2 flips every affected hour to absolute-threshold gating.
`CROMWELLS_FULLY_CALIBRATED` in `lib/engine/fixtures.ts` exercises that path so the
behavior is tested and the unlock is demonstrable. Gap #2 has since been resolved,
and that is exactly what happened.

---

## 6. The NWS surf-face bound is day-level and deliberately conservative

**Decided:** 2026-08-02 · **Status:** active, refine later

The SRF's columns are labelled by day and period — "Tonight PM", "Monday AM" —
and mapping those labels onto calendar hours means parsing relative day names
against an issuance time, which is fragile in exactly the way the fixed-width
table already is.

Until that mapping exists, `srfBoundFor` takes the **worst** south-facing band in
the product and applies it to every hour. This can over-constrain: a 1–3 ft
tonight alongside a 4–6 ft Monday bounds everything at 6 ft. That errs toward
caution, which is the correct direction to err, but it is a known imprecision and
the reason a day-level bound is recorded rather than an hourly one.

Only the beach's own `shoreAspect` row is read. The east-facing band — which is
what the raw wave model was actually reporting, per #1 — is ignored entirely.

---

## 5b. Usable hours bound candidate windows

**Decided:** 2026-08-02 · **Status:** active

Candidate windows are restricted to 06:00–18:00 local. Without it, "favor morning
hours" ranks 04:00 as the best window of the day. This is a usability bound, not a
safety threshold, and it is overridable per evaluation — Phase 5's alert
preferences ("earliest and latest acceptable time") will pass a user's own range.

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

**Decided:** 2026-08-02 · **Status:** cell pinning **active**; wind calibration
**resolved** in `78cdc8a` — provisionally, on `n=1`

> **Status corrected 2026-09-21** (`builder`, documentation only). The gap
> described below was resolved, and not by either of the two routes this entry
> anticipated — see the resolution note at the end.

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

**The gap, as originally recorded:** the pinned sea cell reported 23–24 mph sustained and 30–31 mph
gusts for the morning of 2026-08-02, while NWS gave shoreline wind as northeast
15–20 mph. Open water has no land friction so the sea cell reads high; the inland
cell read higher still (35 mph gusts). Neither matches the shoreline.

The spec's `≤ 8 mph` / `≤ 12 mph` gust thresholds are **shoreline-referenced**, so
they cannot be compared against raw cell values — doing so would block every hour
of every day on `STRONG_GUSTS`. This was recorded as a calibration gap on the
beach profile, originally named `wind-offshore-vs-shoreline`.

**The engine must consult that gap before gating on wind.** Resolving it needs
either shoreline observation across several mornings, or adopting the NWS point
forecast as the wind source. Deliberately *not* chosen: a fitted offset, which
would be unvalidated guesswork that drifts with wind direction.

**How it was actually resolved** (added 2026-09-21; the change itself landed in
`78cdc8a`). Neither route above was taken. The gap is now
`wind-gridded-models-cannot-resolve-this-cove` with `status: 'resolved'`, and the
shelter was put in the *threshold* rather than the data: offshore ceilings are
anchored above the observed reading (`great: 25`, `caution: 32` sustained) so the
raw figure stays honest. See #12 for why two gridded models agreeing settled
nothing here.

The basis is **one** in-water observation, not "several mornings" — so this is
resolved in status and provisional in strength, and the profile note says so. A
genuinely rough ENE morning is still the observation that would test it.

---

## 3. Tide position is a fraction of the local day's range, not absolute feet

**Decided:** 2026-08-02 · **Status:** **superseded by #13** on the unit question;
the `hilo`-derived stage and null-handling rules below are still active

> **Status corrected 2026-09-21** (`builder`, documentation only). #13 reversed
> this entry's headline conclusion: tide is now measured in **feet above MLLW**,
> not as a fraction of the day's range. The threshold named below no longer
> exists — see the inline note.

Honolulu's tidal range is small: 2026-08-02 spanned 0.16 to 1.74 ft MLLW, a total
swing of 1.58 ft. The spec's "prefer adequate water over the shallow reef,
commonly a mid-to-higher or rising tide" cannot be an absolute foot threshold at
that range, so `tideRangeFraction` expresses position within the local calendar
day's own swing (0 = day's low, 1 = day's high), and the threshold is
`minTideRangeFraction`.

**Dead identifier, corrected 2026-09-21:** `minTideRangeFraction` no longer
exists anywhere in the codebase. #13 replaced it with `favorableTideFt`, a band
in feet above MLLW, because reef coverage is absolute — the rock sits at a fixed
elevation. `tideRangeFraction` itself *is* still computed (`lib/tide.ts`,
`lib/types.ts`) and still used for reporting tide position, so this entry's
reasoning about the small Honolulu range remains the right reason not to read
"relatively high tide" off absolute feet. What it got wrong was concluding that
absolute feet are therefore the wrong unit for "is there enough water over the
reef" — see #13.

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

