/**
 * PROTOTYPE — throwaway fixture for issue #60 (The answering screen).
 *
 * Shaped like the real `assessment_version_items` snapshot (server/db/schema/assessment.ts on
 * master, not yet merged into this branch): flat `position`, no `sections` table, and a
 * `scalePointsSnapshot` of `{ value, label }[]`. There is no real item bank yet
 * (docs/assessment/kdpgk-v1.md ships none), so these 8 items and 2 scales are invented — one
 * scale with short anchors, one with deliberately long ones, to stress-test the Likert row on a
 * phone.
 */

export interface ScalePoint {
  value: number
  label: string
}

export interface FakeVersionItem {
  id: string
  position: number
  stemSnapshot: string
  scalePointsSnapshot: ScalePoint[]
}

const agreementScale: ScalePoint[] = [
  { value: 1, label: 'Sangat Tidak Setuju' },
  { value: 2, label: 'Tidak Setuju' },
  { value: 3, label: 'Netral' },
  { value: 4, label: 'Setuju' },
  { value: 5, label: 'Sangat Setuju' },
]

const frequencyScale: ScalePoint[] = [
  { value: 1, label: 'Hampir tidak pernah melakukan ini' },
  { value: 2, label: 'Jarang melakukan ini, hanya sesekali' },
  { value: 3, label: 'Kadang-kadang, tergantung situasi' },
  { value: 4, label: 'Sering melakukan ini dalam keseharian' },
  { value: 5, label: 'Hampir selalu melakukan ini secara konsisten' },
]

export const fakeItems: FakeVersionItem[] = [
  {
    id: 'item-1',
    position: 0,
    stemSnapshot:
      'Saya menjelaskan alasan di balik sebuah keputusan kepada tim, bukan hanya memberi instruksi.',
    scalePointsSnapshot: agreementScale,
  },
  {
    id: 'item-2',
    position: 1,
    stemSnapshot: 'Saya nyaman mendelegasikan tugas penting kepada anggota tim yang saya percaya.',
    scalePointsSnapshot: agreementScale,
  },
  {
    id: 'item-3',
    position: 2,
    stemSnapshot:
      'Ketika situasi berubah mendadak, saya menyesuaikan rencana tanpa kehilangan arah tim.',
    scalePointsSnapshot: frequencyScale,
  },
  {
    id: 'item-4',
    position: 3,
    stemSnapshot:
      'Saya meminta masukan dari anggota tim sebelum mengambil keputusan yang memengaruhi mereka.',
    scalePointsSnapshot: agreementScale,
  },
  {
    id: 'item-5',
    position: 4,
    stemSnapshot: 'Saya mengakui kesalahan saya secara terbuka di depan tim.',
    scalePointsSnapshot: frequencyScale,
  },
  {
    id: 'item-6',
    position: 5,
    stemSnapshot:
      'Saya memberikan pengakuan secara spesifik atas kontribusi anggota tim, bukan pujian umum.',
    scalePointsSnapshot: agreementScale,
  },
  {
    id: 'item-7',
    position: 6,
    stemSnapshot:
      'Saya mendorong anggota tim untuk mencoba pendekatan baru meskipun berisiko gagal.',
    scalePointsSnapshot: frequencyScale,
  },
  {
    id: 'item-8',
    position: 7,
    stemSnapshot:
      'Saya tetap tenang dan memberi arahan yang jelas saat tim menghadapi tekanan atau krisis.',
    scalePointsSnapshot: agreementScale,
  },
]

/** Seeds a resumed session: the first two items already answered, same as a student returning. */
export const fakeResumedAnswers: Record<string, number> = {
  'item-1': 4,
  'item-2': 5,
}
