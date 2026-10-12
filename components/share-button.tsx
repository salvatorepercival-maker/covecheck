'use client'

import { useState } from 'react'
import { ShareIcon } from './icons'

/**
 * "Share with family": the system share sheet where there is one, otherwise the
 * link and summary go to the clipboard.
 */
export function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CoveCheck', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Dismissing the share sheet throws; nothing to report.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
    >
      <ShareIcon className="h-4 w-4" />
      <span aria-live="polite">{copied ? 'Link copied' : 'Share with family'}</span>
    </button>
  )
}
