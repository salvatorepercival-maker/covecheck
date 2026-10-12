import type { Metadata } from 'next'
import { CalibrationView } from '@/components/calibration-view'

export const metadata: Metadata = {
  title: 'Calibration — CoveCheck',
  robots: { index: false, follow: false },
}

export default function CalibrationPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6 pb-12">
      <CalibrationView />
    </main>
  )
}
