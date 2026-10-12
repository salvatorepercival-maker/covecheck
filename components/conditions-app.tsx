'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { SPOT_GUIDE } from '@/lib/beach/spot-guide'
import type { BuoyComparison } from '@/lib/conditions/buoy'
import { CONFIDENCE_WORDS } from '@/lib/conditions/confidence'
import { conditionTiles, dayHeadline, sunLine } from '@/lib/conditions/describe'
import type { DayFacts, HourFacts } from '@/lib/facts'
import { DEFAULT_LENSES, LENS_ORDER } from '@/lib/lenses/defaults'
import { evaluateDay, withOverrides, type DayFit } from '@/lib/lenses/evaluate'
import { heroCopy } from '@/lib/lenses/hero'
import { affectsFit, type LensId, type LensOverrides } from '@/lib/lenses/schema'
import type { LongRangeDay } from '@/lib/planning/long-range'
import { weekOutlook } from '@/lib/planning/outlook'
import type { SwellTrain } from '@/lib/planning/swell-trains'
import { formatSunTime } from '@/lib/sun'
import { DataPanel } from './data-panel'
import { DaySection } from './day-section'
import { FIT_CHIP, TAG_LABEL } from './fit'
import { Hero } from './hero'
import { MoonIcon } from './icons'
import { LensSettings } from './lens-settings'
import { LensTabs } from './lens-tabs'
import { LongRangeList, Outlook, SwellTimeline } from './planning'
import { SpotGuide } from './spot-guide'
import { TidePanel } from './tide-panel'
import { WeekList } from './week-list'

/**
 * The beach screen, lens first.
 *
 * Pick an activity and the page leads with the call for it: a hero with the
 * best window on the day's tide, then what's deciding it, the week, and the
 * swells coming. "Show raw conditions" turns the lens off for a plain,
 * judgement-free description of the water.
 */

const LENS_KEY = 'covecheck.lens.v1'
const RAW_KEY = 'covecheck.raw.v1'
/** v2's single activity key: 'conditions' or a lens id. Read once for migration. */
const LEGACY_ACTIVITY_KEY = 'covecheck.activity.v1'
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

const isLens = (v: unknown): v is LensId => typeof v === 'string' && v in DEFAULT_LENSES
const TAG_RANK = { good: 0, mixed: 1, unknown: 2, poor: 3 } as const

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
  /** Swell trains over the next 10 days (GFS-Wave). */
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
  const [lensId, setLensId] = useState<LensId>('snorkel')
  const [raw, setRaw] = useState(false)
  const [overrides, setOverrides] = useState<Partial<Record<LensId, LensOverrides>>>({})
  const [editing, setEditing] = useState(false)

  // Remembered choices load after mount, so server and first client render agree.
  useEffect(() => {
    // A shared link (?activity=surf or ?activity=conditions) wins over memory.
    const fromUrl = new URLSearchParams(window.location.search).get('activity')
    const legacy = readStorage<string | null>(LEGACY_ACTIVITY_KEY, null)
    const choice = fromUrl ?? null
    const savedLens = readStorage<string | null>(LENS_KEY, null)
    const nextRaw = choice ? choice === 'conditions' : readStorage<boolean | null>(RAW_KEY, null) ?? legacy === 'conditions'
    const nextLens = isLens(choice) ? choice : isLens(savedLens) ? savedLens : isLens(legacy) ? legacy : 'snorkel'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser storage
    setLensId(nextLens)
    setRaw(nextRaw)
    setOverrides(readStorage<Partial<Record<LensId, LensOverrides>>>(OVERRIDES_KEY, {}))
  }, [])

  const chooseLens = (id: LensId) => {
    setLensId(id)
    setRaw(false)
    writeStorage(LENS_KEY, id)
    writeStorage(RAW_KEY, false)
  }
  const chooseRaw = (next: boolean) => {
    setRaw(next)
    writeStorage(RAW_KEY, next)
  }

  // ---- Which day, and which hour the readings describe ---------------------
  const now = new Date(nowIso)
  const nowLocal = new Date(now.getTime() - 10 * 3_600_000).toISOString()
  const todayDate = nowLocal.slice(0, 10)
  const hourNow = Number(nowLocal.slice(11, 13))
  const minutesNow = hourNow * 60 + Number(nowLocal.slice(14, 16))
  const timeLabel = `${hourNow % 12 === 0 ? 12 : hourNow % 12}:${nowLocal.slice(14, 16)} ${hourNow < 12 ? 'AM' : 'PM'}`

  const todayIndex = days.findIndex((d) => d.date === todayDate)
  const showTomorrow = todayIndex >= 0 && hourNow > 18 && days[todayIndex + 1] !== undefined
  const day = days[showTomorrow ? todayIndex + 1 : Math.max(0, todayIndex)]
  const isToday = day?.date === todayDate
  const dark = showTomorrow && (days[todayIndex].sunset === null || minutesNow >= days[todayIndex].sunset! + 25)

  const lens = raw ? null : withOverrides(DEFAULT_LENSES[lensId], overrides[lensId])

  const dayFit: DayFit | null = useMemo(() => (lens && day ? evaluateDay(lens, day) : null), [lens, day])
  // On today, the call and its best hours only look ahead.
  const aheadFit: DayFit | null = useMemo(
    () => (lens && day ? (isToday ? evaluateDay(lens, day, { fromHour: hourNow }) : dayFit) : null),
    [lens, day, isToday, hourNow, dayFit],
  )
  const weekFits = useMemo(() => days.map((d) => (lens ? evaluateDay(lens, d) : null)), [lens, days])

  if (!day) {
    return <p className="rounded-2xl bg-surface p-4 text-sm">No forecast is available for this beach right now.</p>
  }

  const daylightNow = isToday && hourNow >= 6 && hourNow <= 18
  // "Now" while it's light; otherwise the hour the call rests on.
  const focusHour: HourFacts | undefined =
    (daylightNow ? day.hours.find((h) => h.hour === hourNow) : undefined) ??
    (lens ? aheadFit?.keyHour : undefined) ??
    day.hours.find((h) => h.hour === 9) ??
    day.hours[0]

  const tiles = focusHour ? conditionTiles(day, focusHour, shore, buoy) : []
  const confidence = focusHour?.confidence
  const tagFor = (tile: (typeof tiles)[number]) => {
    if (!lens || !focusHour) return null
    const hourFit = dayFit?.hours.find((h) => h.timestamp === focusHour.timestamp)
    const tags = [tile.factor, ...(tile.alsoFactors ?? [])]
      .map((f) => hourFit?.tags[f])
      .filter((t): t is 'good' | 'mixed' | 'poor' | 'unknown' => t !== undefined && t !== 'off')
    return tags.length ? tags.reduce((a, b) => (TAG_RANK[b] > TAG_RANK[a] ? b : a)) : null
  }

  // The bands the tide-first lenses use; the snorkel rule's when no lens is on.
  const tideRule = (lens ?? DEFAULT_LENSES.snorkel).factors.waves
  const snorkelRule = DEFAULT_LENSES.snorkel.factors.waves
  const tideBands =
    tideRule.kind === 'tideSwell'
      ? { lowFt: tideRule.lowTideFt, highFt: tideRule.risenTideFt }
      : snorkelRule.kind === 'tideSwell'
        ? { lowFt: snorkelRule.lowTideFt, highFt: snorkelRule.risenTideFt }
        : { lowFt: 0.6, highFt: 1.4 }

  const [, month, dom] = day.date.split('-').map(Number)
  const nwsHazards = focusHour?.nwsHazards ?? []
  const outlook = weekOutlook(
    days,
    trains,
    todayDate,
    lens
      ? days.flatMap((d) => {
          const f = evaluateDay(lens, d, d.date === todayDate ? { fromHour: hourNow } : {})
          return f.bestHours ? [{ date: d.date, ...f.bestHours }] : []
        })
      : null,
    lens?.activity ?? null,
  )

  return (
    <div className="space-y-5">
      {showTomorrow ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-sunk px-4 py-2.5 text-[13px]">
          <MoonIcon className="h-4 w-4 shrink-0 text-muted" />
          <span>
            {dark ? 'It’s dark out.' : 'The day’s nearly done.'} Showing <strong className="font-semibold">tomorrow</strong>
            {day.sunrise !== null ? ` — sunrise ${formatSunTime(day.sunrise)?.replace(/(am|pm)$/, (s) => ` ${s.toUpperCase()}`)}.` : '.'}
          </span>
        </p>
      ) : null}

      <LensTabs
        lenses={LENS_ORDER.map((id) => ({ id, name: DEFAULT_LENSES[id].name }))}
        active={lensId}
        onChoose={chooseLens}
        raw={raw}
        onRaw={chooseRaw}
      />

      {lens && aheadFit && dayFit ? (
        <Hero
          eyebrow={`${isToday ? 'Today' : weekdayOf(day.date)} · ${lens.name}`}
          timeLabel={timeLabel}
          copy={heroCopy(lens, aheadFit, day, isToday)}
          fit={aheadFit}
          stripFit={dayFit}
          day={day}
          nowHour={isToday ? minutesNow / 60 : null}
          band={tideBand}
          reading={focusHour}
          confidence={confidence}
          buoy={buoy}
          edited={Boolean(overrides[lens.id])}
          onEdit={() => setEditing(true)}
        />
      ) : (
        /* ---------- Raw conditions: the day described, no judgement ---------- */
        <section aria-labelledby="day-headline" className="rounded-[28px] bg-surface p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            {weekdayOf(day.date).slice(0, 3)}, {MONTHS[month - 1]} {dom} · {place}
          </p>
          <h1 id="day-headline" className="mt-2 font-display text-[2.6rem] font-extrabold leading-[0.95]">
            {dayHeadline(day)}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>Forecast for daylight hours · updated {updatedLabel}</span>
            {confidence ? (
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  confidence.level === 'high' ? 'bg-go-tint text-go-ink' : confidence.level === 'medium' ? 'bg-close-tint text-close-ink' : 'bg-skip-tint text-skip-ink'
                }`}
              >
                {CONFIDENCE_WORDS[confidence.level]}
              </span>
            ) : null}
          </p>
          {confidence && confidence.reasons.length ? <p className="mt-1 text-xs text-muted">Because {confidence.reasons.join('; ')}.</p> : null}
        </section>
      )}

      <Outlook lines={outlook} />

      {nwsHazards.length > 0 ? (
        <p className="rounded-2xl bg-close-tint px-4 py-3 text-sm text-close-ink">
          <strong className="font-semibold">{nwsHazards.map((h) => h.event).join(', ')}</strong> in effect from the National Weather
          Service.
        </p>
      ) : null}

      {/* ---------- What's deciding it ---------- */}
      <section aria-labelledby="tiles-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tiles-heading" className="font-display text-[2rem] font-extrabold leading-none">
            {lens ? 'What’s deciding it' : 'Conditions'}
          </h2>
          {focusHour ? (
            <span className="font-mono text-[10px] text-muted">
              {daylightNow ? 'Now' : `At ${focusHour.hour % 12 || 12} ${focusHour.hour < 12 ? 'AM' : 'PM'}`}
            </span>
          ) : null}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2.5">
          {tiles.map((tile) => {
            const tag = tagFor(tile)
            const infoOnly = lens && tag && !affectsFit(lens.factors[tile.factor])
            return (
              <li key={tile.id} className="flex min-h-[9rem] flex-col rounded-[18px] bg-surface p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{tile.label}</p>
                <p className="mt-1.5 font-mono text-[1.35rem] font-bold leading-tight tracking-tight">{tile.value}</p>
                <p className="mt-1.5 text-[12px] leading-snug text-muted">{tile.detail}</p>
                {tile.note ? <p className="mt-1 text-[11px] leading-snug text-foreground/70">{tile.note}</p> : null}
                {tag ? (
                  <span
                    className={`mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 pt-0.5 text-[11px] font-semibold ${
                      infoOnly ? 'bg-unknown-tint text-muted' : FIT_CHIP[tag]
                    }`}
                    style={{ marginTop: 'auto' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {infoOnly ? 'Info only' : TAG_LABEL[tag]}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 px-1 text-[12px] text-muted">
          Clarity is an estimate from swell, wind and recent rain, not yet calibrated by your visits. It counts toward no fit
          until 10 visit reports have calibrated it.
        </p>
      </section>

      <TidePanel
        day={day}
        nextMidnightFt={days[days.indexOf(day) + 1]?.hours.find((h) => h.hour === 0)?.tideFt ?? null}
        week={days}
        nowMinutes={isToday ? minutesNow : null}
        bands={tideBands}
        best={lens ? (aheadFit?.bestHours ?? null) : null}
      />

      {raw ? (
        <DaySection
          title={`${isToday ? 'Today' : weekdayOf(day.date)} through the day`}
          day={day}
          band={tideBand}
          dayFit={null}
          activity={null}
          sunLine={sunLine(day)}
        />
      ) : null}

      {SPOT_GUIDE.enabled && hasSpotImage ? <SpotGuide day={day} hasImage={hasSpotImage} /> : null}

      <WeekList days={days} fits={weekFits} highlightDate={day.date} />

      <SwellTimeline trains={trains} startDate={todayDate} modelGaps={modelGaps} />

      <LongRangeList days={longRange} />

      {/* ---------- Ground truth ---------- */}
      <section aria-labelledby="report-cta-heading" className="rounded-[22px] bg-report p-5 text-[#2a0f06]">
        <h2 id="report-cta-heading" className="font-display text-[2rem] font-extrabold leading-none">
          Been in today?
        </h2>
        <p className="mt-2 text-[15px] leading-snug">Tell us what it was really like. Your reports calibrate every call on this page.</p>
        <Link href="/report" className="mt-4 block w-full rounded-xl bg-hero px-4 py-3 text-center text-sm font-semibold text-hero-ink">
          Log what you saw
        </Link>
      </section>

      <DataPanel />

      <footer className="space-y-2 px-1 pb-10 text-sm">
        <p className="leading-relaxed text-muted">
          <strong className="font-semibold text-foreground">CoveCheck reports forecasts, not safety.</strong> Conditions can
          change quickly. Look at the water before going in, and follow lifeguards, posted signs and closures.
        </p>
        <p className="font-mono text-[11px] text-muted">
          Updated {updatedLabel} · {place}
        </p>
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
