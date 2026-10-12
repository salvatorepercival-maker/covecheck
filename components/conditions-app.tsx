'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { conditionTiles, dayHeadline, sunLine, weekSummary } from '@/lib/conditions/describe'
import type { DayFacts, HourFacts } from '@/lib/facts'
import { formatWindowRange } from '@/lib/format'
import { DEFAULT_LENSES, LENS_ORDER } from '@/lib/lenses/defaults'
import { evaluateDay, settingsSummary, withOverrides, type DayFit } from '@/lib/lenses/evaluate'
import { affectsFit, type LensId, type LensOverrides } from '@/lib/lenses/schema'
import { formatSunTime } from '@/lib/sun'
import type { BuoyComparison } from '@/lib/conditions/buoy'
import { CONFIDENCE_WORDS } from '@/lib/conditions/confidence'
import type { LongRangeDay } from '@/lib/planning/long-range'
import { weekOutlook } from '@/lib/planning/outlook'
import type { SwellTrain } from '@/lib/planning/swell-trains'
import { DataPanel } from './data-panel'
import { SpotGuide } from './spot-guide'
import { SPOT_GUIDE } from '@/lib/beach/spot-guide'
import { LongRangeList, Outlook, SwellTimeline } from './planning'
import { DaySection } from './day-section'
import { FitChip, TAG_LABEL, FIT_CHIP } from './fit'
import { MoonIcon } from './icons'
import { LensSettings } from './lens-settings'

/**
 * The beach screen.
 *
 * Default is "Just conditions": a plain description of the day with no fit
 * judgement and no red/green. Choosing an activity turns on that lens — a fit
 * card, per-tile tags, an hourly fit strip and week tags — judged against the
 * thresholds shown on the card, which the viewer can edit.
 */

type Activity = 'conditions' | LensId
const ACTIVITY_KEY = 'covecheck.activity.v1'
const OVERRIDES_KEY = 'covecheck.lensOverrides.v1'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

const hourTs = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00`

export function ConditionsApp({
  days,
  nowIso,
  updatedLabel,
  place,
  shore,
  tideBand,
  buoy,
  trains,
  longRange,
  hasSpotImage,
  modelGaps,
}: {
  /** Days where the tiles' model and the timeline's model differ noticeably. */
  modelGaps: { date: string; tilesFt: number; timelineFt: number }[]
  /** Whether Sal's aerial photo is in public/spot/. */
  hasSpotImage: boolean
  /** Swell trains over the next 10+ days (GFS-Wave). */
  trains: SwellTrain[]
  /** Days 8-16 as trends. */
  longRange: LongRangeDay[]
  days: DayFacts[]
  /** The buoy against the forecast right now, or null without a reading. */
  buoy: BuoyComparison | null
  nowIso: string
  /** "10:05 PM" */
  updatedLabel: string
  /** "Black Point, Honolulu" */
  place: string
  /** "south" — the shore the NWS surf figure is for. */
  shore: string
  /** The beach's tide band, or null while unset. */
  tideBand: { minFt: number; maxFt: number } | null
}) {
  const [activity, setActivity] = useState<Activity>('conditions')
  const [overrides, setOverrides] = useState<Partial<Record<LensId, LensOverrides>>>({})
  const [editing, setEditing] = useState(false)

  // Remembered choices load after mount, so server and first client render agree.
  useEffect(() => {
    // A shared link (?activity=snorkel) wins over the remembered choice.
    const fromUrl = new URLSearchParams(window.location.search).get('activity')
    const saved = fromUrl ?? readStorage<Activity>(ACTIVITY_KEY, 'conditions')
    const savedOverrides = readStorage<Partial<Record<LensId, LensOverrides>>>(OVERRIDES_KEY, {})
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser storage
    setActivity(saved === 'conditions' || saved in DEFAULT_LENSES ? (saved as Activity) : 'conditions')
    setOverrides(savedOverrides)
  }, [])

  const choose = (next: Activity) => {
    setActivity(next)
    writeStorage(ACTIVITY_KEY, next)
  }

  // ---- Which day, and which hour the tiles describe ------------------------
  const now = new Date(nowIso)
  const nowLocal = new Date(now.getTime() - 10 * 3_600_000).toISOString()
  const todayDate = nowLocal.slice(0, 10)
  const hourNow = Number(nowLocal.slice(11, 13))
  const minutesNow = hourNow * 60 + Number(nowLocal.slice(14, 16))

  const todayIndex = days.findIndex((d) => d.date === todayDate)
  const showTomorrow = todayIndex >= 0 && hourNow > 18 && days[todayIndex + 1] !== undefined
  const day = days[showTomorrow ? todayIndex + 1 : Math.max(0, todayIndex)]
  const isToday = day?.date === todayDate
  const dark = showTomorrow && (days[todayIndex].sunset === null || minutesNow >= days[todayIndex].sunset! + 25)

  const lens = activity === 'conditions' ? null : withOverrides(DEFAULT_LENSES[activity], overrides[activity])

  const dayFit: DayFit | null = useMemo(() => (lens && day ? evaluateDay(lens, day) : null), [lens, day])
  // On today, "best hours" only looks ahead.
  const aheadFit: DayFit | null = useMemo(
    () => (lens && day ? (isToday ? evaluateDay(lens, day, { fromHour: hourNow }) : dayFit) : null),
    [lens, day, isToday, hourNow, dayFit],
  )

  if (!day) {
    return <p className="rounded-2xl bg-surface p-4 text-sm">No forecast is available for this beach right now.</p>
  }

  const clampHour = (h: number) => Math.min(18, Math.max(6, h))
  const focusHour: HourFacts | undefined =
    (lens ? aheadFit?.keyHour : undefined) ??
    day.hours.find((h) => h.hour === (isToday ? clampHour(hourNow) : 9)) ??
    day.hours[0]

  // The buoy line says "now", so it belongs on the tile whichever day is shown.
  const tiles = focusHour ? conditionTiles(day, focusHour, shore, buoy) : []
  const confidence = focusHour?.confidence
  const TAG_RANK = { good: 0, mixed: 1, unknown: 2, poor: 3 } as const
  const tagFor = (tile: (typeof tiles)[number]) => {
    if (!lens || !focusHour) return null
    const hourFit = (aheadFit ?? dayFit)?.hours.find((h) => h.timestamp === focusHour.timestamp)
    const tags = [tile.factor, ...(tile.alsoFactors ?? [])]
      .map((f) => hourFit?.tags[f])
      .filter((t): t is 'good' | 'mixed' | 'poor' | 'unknown' => t !== undefined && t !== 'off')
    return tags.length ? tags.reduce((a, b) => (TAG_RANK[b] > TAG_RANK[a] ? b : a)) : null
  }

  const [, month, dom] = day.date.split('-').map(Number)
  const dayName = isToday ? 'today' : weekdayOf(day.date)
  const nwsHazards = focusHour?.nwsHazards ?? []

  return (
    <div className="space-y-6">
      {showTomorrow ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-sunk px-4 py-3 text-sm">
          <MoonIcon className="h-4 w-4 shrink-0 text-muted" />
          <span>
            {dark ? 'It’s dark out.' : 'The day’s nearly done.'} Showing <strong className="font-semibold">tomorrow</strong>
            {day.sunrise !== null ? ` — sunrise ${formatSunTime(day.sunrise)?.replace(/(am|pm)$/, (s) => ` ${s.toUpperCase()}`)}.` : '.'}
          </span>
        </p>
      ) : null}

      {/* ---------- The day, described ---------- */}
      <section aria-labelledby="day-headline">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {weekdayOf(day.date).slice(0, 3)}, {MONTHS[month - 1]} {dom} · {place}
        </p>
        <h1 id="day-headline" className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-tight">
          {dayHeadline(day)}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>Forecast for daylight hours · updated {updatedLabel}</span>
          {confidence ? (
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                confidence.level === 'high' ? 'bg-surface text-foreground' : confidence.level === 'medium' ? 'bg-close-tint text-close-ink' : 'bg-skip-tint text-skip-ink'
              }`}
            >
              {CONFIDENCE_WORDS[confidence.level]}
            </span>
          ) : null}
        </p>
        {confidence && confidence.reasons.length ? (
          <p className="mt-1 text-xs text-muted">Because {confidence.reasons.join('; ')}.</p>
        ) : null}
      </section>

      {/* ---------- Activity picker ---------- */}
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-semibold">
          What are you heading out for?
        </h2>
        <div role="radiogroup" aria-labelledby="activity-heading" className="mt-2 flex flex-wrap gap-2">
          {(['conditions', ...LENS_ORDER] as Activity[]).map((id) => {
            const selected = activity === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-[#15232d] bg-[#15232d] text-white dark:border-white dark:bg-white dark:text-[#15232d]'
                    : 'border-border bg-surface hover:bg-surface-sunk'
                }`}
              >
                {id === 'conditions' ? 'Just conditions' : DEFAULT_LENSES[id].name}
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Lens card ---------- */}
      {lens && aheadFit ? (
        <section aria-labelledby="lens-heading" className="rounded-3xl bg-hero-skip p-5 text-white shadow-lg shadow-black/10">
          <div className="flex items-start justify-between gap-3">
            <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75">
              {lens.activity.replace(/^a /, '')} · {isToday ? 'Today' : weekdayOf(day.date)}
            </p>
            <FitChip fit={aheadFit.fit} />
          </div>
          <h2 id="lens-heading" className="mt-2 text-[1.6rem] font-bold leading-tight tracking-tight">
            {aheadFit.headline}
          </h2>
          <p className="mt-2 text-[15px] leading-snug text-white/85">{aheadFit.reason}</p>
          <div className="mt-4 border-t border-white/15 pt-4">
            <p className="text-xs text-white/65">Best hours</p>
            <p className="mt-0.5 font-semibold">
              {aheadFit.bestHours
                ? formatWindowRange(hourTs(day.date, aheadFit.bestHours.start), hourTs(day.date, aheadFit.bestHours.end))
                : isToday
                  ? 'No good window left today'
                  : `No good window ${dayName}`}
            </p>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <p className="text-xs leading-relaxed text-white/65">
              Judged against your settings: {settingsSummary(lens)}
              {overrides[lens.id] ? ' (edited)' : ''}
            </p>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold underline underline-offset-2">
              Edit
            </button>
          </div>
        </section>
      ) : null}

      <Outlook
        lines={weekOutlook(
          days,
          trains,
          todayDate,
          lens ? days.flatMap((d) => {
            const f = evaluateDay(lens, d, d.date === todayDate ? { fromHour: hourNow } : {})
            return f.bestHours ? [{ date: d.date, ...f.bestHours }] : []
          }) : null,
          lens?.activity ?? null,
        )}
      />

      {nwsHazards.length > 0 ? (
        <p className="rounded-2xl bg-close-tint px-4 py-3 text-sm text-close-ink">
          <strong className="font-semibold">{nwsHazards.map((h) => h.event).join(', ')}</strong> in effect from the National Weather
          Service.
        </p>
      ) : null}

      {/* ---------- Conditions tiles ---------- */}
      <section aria-labelledby="tiles-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tiles-heading" className="text-[17px] font-semibold tracking-tight">
            Conditions
          </h2>
          {focusHour ? (
            <span className="text-xs text-muted">
              {isToday && focusHour.hour === Math.min(18, Math.max(6, hourNow)) && !lens ? 'Now' : `At ${focusHour.hour % 12 || 12} ${focusHour.hour < 12 ? 'AM' : 'PM'}`}
            </span>
          ) : null}
        </div>
        <ul className="mt-2.5 grid grid-cols-2 gap-2.5">
          {tiles.map((tile) => {
            const tag = tagFor(tile)
            return (
              <li key={tile.id} className="flex min-h-[8.5rem] flex-col rounded-2xl bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{tile.label}</p>
                <p className="mt-1 text-[1.35rem] font-bold leading-tight tracking-tight">{tile.value}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{tile.detail}</p>
                {tile.note ? <p className="mt-1 text-[11px] font-medium leading-snug text-foreground/70">{tile.note}</p> : null}
                {tag ? (
                  <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                    <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${FIT_CHIP[tag]}`}>
                      {TAG_LABEL[tag]}
                    </span>
                    {lens && !affectsFit(lens.factors[tile.factor]) ? (
                      <span className="text-[10px] text-muted">Not yet calibrated</span>
                    ) : null}
                  </span>
                ) : tile.factor === 'clarity' ? (
                  <span className="mt-auto pt-2 text-[10px] text-muted">Not yet calibrated</span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 px-1 text-xs text-muted">
          Clarity is an estimate from swell, wind and recent rain. It doesn&rsquo;t count toward any fit until 10 visit reports
          have calibrated it.
        </p>
      </section>

      <DaySection
        title={`${isToday ? 'Today' : weekdayOf(day.date)} through the day`}
        day={day}
        band={tideBand}
        dayFit={dayFit}
        activity={lens?.activity ?? null}
        sunLine={sunLine(day)}
      />

      {SPOT_GUIDE.enabled && hasSpotImage ? <SpotGuide day={day} hasImage={hasSpotImage} /> : null}

      {/* ---------- The week ---------- */}
      <section id="week" aria-labelledby="week-heading" className="scroll-mt-4">
        <h2 id="week-heading" className="text-[17px] font-semibold tracking-tight">
          This week
        </h2>
        <ul className="mt-2.5 divide-y divide-border rounded-2xl bg-surface px-4">
          {days.map((d) => {
            const summary = weekSummary(d)
            const fit = lens ? evaluateDay(lens, d).fit : null
            return (
              <li key={d.date} className="flex items-center gap-4 py-3">
                <span className="w-10 shrink-0 text-sm font-semibold">
                  {d.date === todayDate ? 'Today' : weekdayOf(d.date).slice(0, 3)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{summary.title}</p>
                  {summary.detail || d.hours.find((h) => h.hour === 9)?.confidence.level === 'low' ? (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[summary.detail, d.hours.find((h) => h.hour === 9)?.confidence.level === 'low' ? 'low confidence' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                {fit ? <FitChip fit={fit} short /> : null}
              </li>
            )
          })}
        </ul>
      </section>

      <SwellTimeline trains={trains} startDate={todayDate} modelGaps={modelGaps} />

      <LongRangeList days={longRange} />

      <DataPanel />

      {/* ---------- Ground truth ---------- */}
      <section aria-labelledby="report-cta-heading" className="rounded-2xl bg-surface p-5">
        <h2 id="report-cta-heading" className="text-[19px] font-semibold tracking-tight">
          Been in the water today?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Tell us what it was really like. Every report sharpens the forecast for everyone.
        </p>
        <Link
          href="/report"
          className="mt-4 block w-full rounded-xl bg-[#15232d] px-4 py-3 text-center text-sm font-semibold text-white dark:bg-white dark:text-[#15232d]"
        >
          Log what you saw
        </Link>
      </section>

      <footer className="space-y-2 px-1 pb-10 text-sm">
        <p className="leading-relaxed text-muted">
          <strong className="font-semibold text-foreground">CoveCheck reports forecasts, not safety.</strong> Conditions can
          change quickly. Look at the water before going in, and follow lifeguards, posted signs and closures.
        </p>
        <p className="text-xs text-muted">Updated {updatedLabel} · {place}</p>
      </footer>

      {editing && lens ? (
        <LensSettings
          lens={lens}
          defaults={DEFAULT_LENSES[lens.id]}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            const all = { ...overrides }
            if (next) all[lens.id] = next
            else delete all[lens.id]
            setOverrides(all)
            writeStorage(OVERRIDES_KEY, all)
            setEditing(false)
          }}
        />
      ) : null}
    </div>
  )
}
