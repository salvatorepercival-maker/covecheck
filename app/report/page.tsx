import type { Metadata } from 'next'
import { ReportForm } from '@/components/report-form'

export const metadata: Metadata = {
  title: 'Log what you saw — CoveCheck',
  description: 'Tell CoveCheck what the water was really like. Reports calibrate the forecast.',
}

export default function ReportPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-12">
      <ReportForm beachName="Cromwell’s" />
    </main>
  )
}
