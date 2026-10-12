import type { BeachReport } from '@/lib/forecast'
import { SHORELINE_REMINDER } from '@/lib/engine'
import { formatClockTime, formatHour } from '@/lib/format'
import {
  dayTide,
  factorRows,
  focusDay,
  heroSentence,
  heroState,
  heroWindow,
  HERO_TITLE,
  hourBlocks,
  hourlyCaption,
  nextGoodDay,
  representativeHour,
  weekdayLong,
  weekRows,
} from '@/lib/presentation'
import { honoluluDateOf, honoluluHourOf, utcToHonoluluLocal } from '@/lib/time'
import type { BeachProfile } from '@/lib/types'
import { AlertsSignup } from './alerts-signup'
import { DayChart } from './day-chart'
import { DecidingFactors } from './deciding-factors'
import { HeadDownChecklist } from './head-down-checklist'
import { HeroCard } from './hero-card'
import { MoonIcon } from './icons'
import { WeekList } from './week-list'

/**
 * The beach screen, decision first.
 *
 * Order: the verdict and its window, what's deciding it, the day hour by hour,
 * a packing list on go days, the week, alerts, then the shoreline reminder. All
 * judgement comes from the engine; `lib/presentation.ts` only reads it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function ReportView({ report, profile }: { report: BeachReport; profile: BeachProfile }) {
  const { evaluation, conditionsByTimestamp } = report
  const nowUtc = new Date(evaluation.evaluatedAtUtc)
  const todayDate = honoluluDateOf(utcToHonoluluLocal(nowUtc))

  const focus = focusDay(evaluation, profile, nowUtc)
  if (!focus) {
    return (
      <p className="rounded-2xl bg-surface p-4 text-sm">No forecast is available for this beach right now.</p>
    )
  }

  const { day, isToday } = focus
  const { verdict, window } = heroState(focus, evaluation, nowUtc)
  const dayExtremes = report.tideExtremesByDate[day.date] ?? []

  // On today with no window ahead, the conditions shown are the current hour's.
  const hour =
    (isToday && !window && evaluation.current && honoluluDateOf(evaluation.current.timestamp) === day.date
      ? evaluation.current
      : undefined) ?? representativeHour(day, window)

  const rows = hour
    ? factorRows({ hour, conditionsByTimestamp, profile, dayHours: day.hours, dayExtremes })
    : []
  const week = weekRows(evaluation, profile, conditionsByTimestamp, todayDate)

  const [, month, dayOfMonth] = day.date.split('-').map(Number)
  const dayName = weekdayLong(day.date)
  const eyebrow = `${isToday ? 'Today' : `${dayName.slice(0, 3)}, ${MONTHS[month - 1]} ${dayOfMonth}`} · Kids snorkeling`
  const heroWin = window ? heroWindow(window, nowUtc, isToday) : null
  const showNextGood = verdict !== 'great'

  const shareText = `CoveCheck: ${HERO_TITLE[verdict]} at ${profile.name} ${isToday ? 'today' : `on ${dayName}`}${
    heroWin ? ` — best window ${heroWin.range}` : ''
  }. Always look at the water first.`

  const tideBandProvisional = profile.calibration.some(
    (gap) => gap.status === 'provisional' && gap.affectedThresholds.some((t) => t.toLowerCase().includes('tide')),
  )
  const tideBandUnset = profile.calibration.some(
    (gap) => gap.status === 'unresolved' && gap.affectedThresholds.some((t) => t.toLowerCase().includes('tide')),
  )

  const checklist = [
    'Rashguards and reef-safe sunscreen',
    ...(profile.entryNotes.some((note) => /rock|reef/i.test(note)) ? ['Water shoes for the rocky entry'] : []),
    'Look at the water before anyone goes in',
  ]

  const updated = formatClockTime(utcToHonoluluLocal(new Date(report.updatedAtUtc)))

  return (
    <div className="space-y-6">
      {focus.evening ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-sunk px-4 py-3 text-sm">
          <MoonIcon className="h-4 w-4 shrink-0 text-muted" />
          <span>
            {focus.evening.dark ? 'It’s dark out.' : 'The day’s nearly done.'} Showing{' '}
            <strong className="font-semibold">tomorrow</strong>
            {focus.evening.firstLight ? ` — first light ${focus.evening.firstLight}.` : '.'}
          </span>
        </p>
      ) : null}

      <HeroCard
        verdict={verdict}
        eyebrow={eyebrow}
        confidence={window?.confidence ?? hour?.confidence ?? null}
        sentence={heroSentence(verdict, rows, day.verdict === 'not_recommended')}
        window={heroWin}
        nextGood={showNextGood ? nextGoodDay(week, day.date) : null}
        shareText={shareText}
      />

      {rows.length > 0 ? (
        <DecidingFactors rows={rows} atLabel={hour ? `At ${formatHour(honoluluHourOf(hour.timestamp))}` : null} />
      ) : null}

      <DayChart
        title={`${isToday ? 'Today' : dayName}, hour by hour`}
        blocks={hourBlocks(day)}
        tide={dayTide(day, conditionsByTimestamp, dayExtremes)}
        band={tideBandUnset ? null : profile.thresholds.favorableTideFt}
        bandProvisional={tideBandProvisional}
        caption={hourlyCaption(day, window)}
      />

      {verdict === 'great' || verdict === 'caution' ? <HeadDownChecklist items={checklist} /> : null}

      <WeekList rows={week} />

      <AlertsSignup />

      <footer className="space-y-3 px-1 pb-10 text-sm">
        <p className="leading-relaxed text-muted">
          <strong className="font-semibold text-foreground">Always look at the water first.</strong> CoveCheck is a
          forecast, not a lifeguard. Follow posted signs and closures.
        </p>
        <details className="group">
          <summary className="cursor-pointer list-none font-medium underline underline-offset-2">
            How CoveCheck decides
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed text-muted">
            <p>
              Every hour is checked against this beach&rsquo;s own limits for swell reaching the cove, wind (which
              matters less when it blows offshore), tide over the reef, and official advisories. A good window needs
              at least {profile.thresholds.minWindowHours} good hours in a row, and uncertain or missing data never
              produces a go.
            </p>
            <p>{SHORELINE_REMINDER}</p>
            <p>
              It cannot see the shoreline entry, surge, water clarity, or every local hazard. Children and weaker
              swimmers need a more cautious choice than the forecast alone suggests.
            </p>
          </div>
        </details>
        <p className="text-xs text-muted">Updated {updated} · Black Point, Honolulu</p>
      </footer>
    </div>
  )
}
