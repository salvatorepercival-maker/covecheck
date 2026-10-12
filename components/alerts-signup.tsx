/**
 * Text alerts, as designed — but not live. There is no messaging backend yet, so
 * the form is disabled and says so rather than collecting numbers it cannot use.
 */
export function AlertsSignup() {
  return (
    <section aria-labelledby="alerts-heading" className="rounded-2xl bg-cream p-5">
      <h2 id="alerts-heading" className="text-[19px] font-semibold tracking-tight">
        Get a text when it&rsquo;s good
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        We&rsquo;ll message you the evening before a go day, with the best time to head down.
      </p>
      <label htmlFor="alerts-phone" className="mt-4 block text-xs font-semibold">
        Mobile number
      </label>
      <input
        id="alerts-phone"
        type="tel"
        inputMode="tel"
        placeholder="(808) 555-0123"
        disabled
        aria-describedby="alerts-unavailable"
        className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm disabled:opacity-70"
      />
      <button
        type="button"
        disabled
        aria-describedby="alerts-unavailable"
        className="mt-3 w-full rounded-xl bg-[#15232d] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-[#15232d]"
      >
        Turn on alerts
      </button>
      <p id="alerts-unavailable" className="mt-2 text-xs text-muted">
        Coming soon — alerts aren&rsquo;t live yet, so this doesn&rsquo;t send anything.
      </p>
    </section>
  )
}
