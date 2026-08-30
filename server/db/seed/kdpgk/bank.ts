/**
 * KDPGK v1 — the item bank, as data.
 *
 * **Synthetic and unvalidated.** `docs/assessment/kdpgk-v1.md` ships no item bank on purpose, and
 * `docs/assessment/validity-log.md` holds KDPGK v1 at status `draft`: no expert review, no pilot,
 * no item analysis, no internal-consistency evidence. Nothing here has been through any of that.
 *
 * What this is for is stated plainly so it cannot be mistaken for something else. The engine, the
 * ledger and the report are all built against a *shape* — forty items over ten styles, eight
 * domains and two Blake-Mouton axes, on a five-point Likert scale — and until an instrument of
 * that shape exists, none of them can be exercised end to end and no student journey can be
 * walked. This supplies the shape. `data-dictionary.md`'s Seed & Fixture Policy asks for exactly
 * that: synthetic items whose count and scale resemble the real instrument, so scoring's golden
 * tests mean something.
 *
 * It must **not** be used for a formal or research decision. That is not a matter of etiquette:
 * validity-log.md forbids it until the Status column reads `approved`, and the readiness bands
 * these items feed are not population norms.
 *
 * Replacing this with the real bank needs no code change here — a new assessment version with the
 * real items and a new scoring version approved against it, which is the flow FR-005 already
 * requires for any change to a published instrument.
 */

export interface Bilingual {
  id: string
  en: string
}

export interface DimensionSeed extends Bilingual {
  code: string
  kind: 'domain' | 'style' | 'axis'
}

/** The ten operational styles kdpgk-v1.md names, in its order. */
export const STYLES: DimensionSeed[] = [
  { code: 'directive', kind: 'style', id: 'Direktif/Otokratik', en: 'Directive/Autocratic' },
  {
    code: 'participative',
    kind: 'style',
    id: 'Partisipatif/Demokratik',
    en: 'Participative/Democratic',
  },
  { code: 'delegative', kind: 'style', id: 'Delegatif', en: 'Delegative' },
  { code: 'task_oriented', kind: 'style', id: 'Berorientasi Tugas', en: 'Task-Oriented' },
  { code: 'people_oriented', kind: 'style', id: 'Berorientasi Orang', en: 'People-Oriented' },
  { code: 'transformational', kind: 'style', id: 'Transformasional', en: 'Transformational' },
  { code: 'transactional', kind: 'style', id: 'Transaksional', en: 'Transactional' },
  { code: 'situational', kind: 'style', id: 'Situasional/Adaptif', en: 'Situational/Adaptive' },
  { code: 'ethical_authentic', kind: 'style', id: 'Etis-Autentik', en: 'Ethical-Authentic' },
  {
    code: 'innovative_digital',
    kind: 'style',
    id: 'Inovatif/Digital-Change',
    en: 'Innovative/Digital-Change',
  },
]

/** Eight domains, meeting kdpgk-v1.md's "≥8 domain sesuai instrumen". */
export const DOMAINS: DimensionSeed[] = [
  { code: 'self_awareness', kind: 'domain', id: 'Kesadaran Diri', en: 'Self-Awareness' },
  { code: 'influence', kind: 'domain', id: 'Pengaruh', en: 'Influence' },
  { code: 'decision_making', kind: 'domain', id: 'Pengambilan Keputusan', en: 'Decision Making' },
  { code: 'collaboration', kind: 'domain', id: 'Kolaborasi', en: 'Collaboration' },
  { code: 'adaptability', kind: 'domain', id: 'Adaptabilitas', en: 'Adaptability' },
  { code: 'integrity', kind: 'domain', id: 'Integritas', en: 'Integrity' },
  { code: 'execution', kind: 'domain', id: 'Eksekusi', en: 'Execution' },
  { code: 'innovation', kind: 'domain', id: 'Inovasi', en: 'Innovation' },
]

/** The two Blake-Mouton axes. `kind: 'axis'` is what lets a scoring version name them as such. */
export const AXES: DimensionSeed[] = [
  { code: 'concern_for_task', kind: 'axis', id: 'Perhatian pada Tugas', en: 'Concern for Task' },
  {
    code: 'concern_for_people',
    kind: 'axis',
    id: 'Perhatian pada Orang',
    en: 'Concern for People',
  },
]

export const DIMENSIONS = [...STYLES, ...DOMAINS, ...AXES]

export const SCALE_POINTS_ID = [
  { value: 1, label: 'Sangat tidak sesuai' },
  { value: 2, label: 'Tidak sesuai' },
  { value: 3, label: 'Netral' },
  { value: 4, label: 'Sesuai' },
  { value: 5, label: 'Sangat sesuai' },
]

export const SCALE_POINTS_EN = [
  { value: 1, label: 'Not at all like me' },
  { value: 2, label: 'Not like me' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Like me' },
  { value: 5, label: 'Very much like me' },
]

export interface ItemSeed extends Bilingual {
  code: string
  style: string
  domain: string
  axis: string | null
  /**
   * A negatively worded item. Six of the forty, spread across styles, and each one is genuinely
   * worded against its dimension rather than merely flagged — a reverse-coding flag on a
   * positively worded item is a silent scoring error nobody can see by reading the questionnaire.
   */
  reverse: boolean
}

const TASK = 'concern_for_task'
const PEOPLE = 'concern_for_people'

/**
 * Forty items, four per style.
 *
 * The axis mapping follows Blake-Mouton's own two concerns rather than being spread evenly:
 * directive, task-oriented and transactional items feed Concern for Task, and participative,
 * people-oriented and delegative items feed Concern for People. Twelve items per axis. The four
 * remaining styles feed neither, because transformational, situational, ethical and innovative
 * behaviour is not what that grid measures, and forcing them onto an axis would move a coordinate
 * for a reason the grid cannot explain.
 */
export const ITEMS: ItemSeed[] = [
  // Directive / Autocratic
  {
    code: 'kd01',
    style: 'directive',
    domain: 'decision_making',
    axis: TASK,
    reverse: false,
    id: 'Saya mengambil keputusan dengan cepat ketika situasi menuntut kejelasan arah.',
    en: 'I decide quickly when a situation calls for a clear direction.',
  },
  {
    code: 'kd02',
    style: 'directive',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya menetapkan instruksi yang rinci agar pekerjaan tim berjalan sesuai rencana.',
    en: 'I set detailed instructions so the team’s work follows the plan.',
  },
  {
    code: 'kd03',
    style: 'directive',
    domain: 'decision_making',
    axis: TASK,
    reverse: true,
    id: 'Saya menunda mengambil sikap sampai ada orang lain yang memutuskan lebih dulu.',
    en: 'I hold off taking a position until someone else has decided first.',
  },
  {
    code: 'kd04',
    style: 'directive',
    domain: 'influence',
    axis: TASK,
    reverse: false,
    id: 'Saya menyampaikan ekspektasi kinerja secara langsung dan tanpa berbelit.',
    en: 'I state performance expectations directly and without hedging.',
  },

  // Participative / Democratic
  {
    code: 'kd05',
    style: 'participative',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya mengumpulkan masukan anggota tim sebelum menetapkan keputusan penting.',
    en: 'I gather the team’s input before settling an important decision.',
  },
  {
    code: 'kd06',
    style: 'participative',
    domain: 'influence',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya membuka ruang bagi pandangan yang berbeda dengan pandangan saya sendiri.',
    en: 'I make room for views that differ from my own.',
  },
  {
    code: 'kd07',
    style: 'participative',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: true,
    id: 'Saya merasa diskusi kelompok memperlambat pekerjaan sehingga saya membatasinya.',
    en: 'I find group discussion slows the work down, so I keep it short.',
  },
  {
    code: 'kd08',
    style: 'participative',
    domain: 'self_awareness',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya meminta umpan balik tentang cara saya memimpin rapat.',
    en: 'I ask for feedback on how I run a meeting.',
  },

  // Delegative
  {
    code: 'kd09',
    style: 'delegative',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya mempercayakan tugas penuh kepada anggota tim yang sudah kompeten.',
    en: 'I hand a task over completely to a team member who is ready for it.',
  },
  {
    code: 'kd10',
    style: 'delegative',
    domain: 'execution',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya memberi kebebasan cara kerja selama sasaran tetap tercapai.',
    en: 'I leave the method open as long as the goal is met.',
  },
  {
    code: 'kd11',
    style: 'delegative',
    domain: 'adaptability',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya menyesuaikan seberapa besar wewenang yang saya limpahkan pada tiap orang.',
    en: 'I adjust how much authority I delegate to each person.',
  },
  {
    code: 'kd12',
    style: 'delegative',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: true,
    id: 'Saya sulit melepaskan pekerjaan karena khawatir hasilnya tidak sesuai harapan saya.',
    en: 'I struggle to let go of work for fear the result will not meet my standard.',
  },

  // Task-Oriented
  {
    code: 'kd13',
    style: 'task_oriented',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya memecah pekerjaan besar menjadi target yang bisa diukur setiap minggu.',
    en: 'I break large work into targets that can be measured each week.',
  },
  {
    code: 'kd14',
    style: 'task_oriented',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya memantau kemajuan pekerjaan terhadap tenggat yang sudah disepakati.',
    en: 'I track progress against the deadlines we agreed.',
  },
  {
    code: 'kd15',
    style: 'task_oriented',
    domain: 'decision_making',
    axis: TASK,
    reverse: false,
    id: 'Saya menetapkan prioritas ketika beberapa tugas bersaing memperebutkan waktu tim.',
    en: 'I set priorities when several tasks compete for the team’s time.',
  },
  {
    code: 'kd16',
    style: 'task_oriented',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya memastikan setiap orang tahu ukuran keberhasilan tugasnya.',
    en: 'I make sure everyone knows how their task will be judged successful.',
  },

  // People-Oriented
  {
    code: 'kd17',
    style: 'people_oriented',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya memperhatikan beban kerja anggota tim sebelum menambah tugas baru.',
    en: 'I check a team member’s workload before adding to it.',
  },
  {
    code: 'kd18',
    style: 'people_oriented',
    domain: 'self_awareness',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya menyadari bagaimana suasana hati saya memengaruhi orang di sekitar saya.',
    en: 'I notice how my own mood affects the people around me.',
  },
  {
    code: 'kd19',
    style: 'people_oriented',
    domain: 'collaboration',
    axis: PEOPLE,
    reverse: true,
    id: 'Saya jarang menanyakan kabar anggota tim di luar urusan pekerjaan.',
    en: 'I rarely ask how a team member is doing beyond the work itself.',
  },
  {
    code: 'kd20',
    style: 'people_oriented',
    domain: 'integrity',
    axis: PEOPLE,
    reverse: false,
    id: 'Saya menjaga kepercayaan yang diberikan orang lain kepada saya.',
    en: 'I keep the trust other people place in me.',
  },

  // Transformational
  {
    code: 'kd21',
    style: 'transformational',
    domain: 'influence',
    axis: null,
    reverse: false,
    id: 'Saya menjelaskan tujuan jangka panjang sehingga orang memahami makna pekerjaannya.',
    en: 'I explain the longer purpose so people see the meaning in their work.',
  },
  {
    code: 'kd22',
    style: 'transformational',
    domain: 'innovation',
    axis: null,
    reverse: false,
    id: 'Saya mendorong tim mencoba pendekatan baru meski hasilnya belum pasti.',
    en: 'I encourage the team to try a new approach even when the outcome is uncertain.',
  },
  {
    code: 'kd23',
    style: 'transformational',
    domain: 'influence',
    axis: null,
    reverse: false,
    id: 'Saya membantu orang melihat kemampuan yang belum mereka sadari.',
    en: 'I help people see an ability they had not recognised in themselves.',
  },
  {
    code: 'kd24',
    style: 'transformational',
    domain: 'self_awareness',
    axis: null,
    reverse: false,
    id: 'Saya meninjau kembali cara saya memimpin ketika hasilnya tidak seperti yang saya harapkan.',
    en: 'I revisit how I lead when the result is not what I hoped for.',
  },

  // Transactional
  {
    code: 'kd25',
    style: 'transactional',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya menyepakati imbalan dan konsekuensi yang jelas atas sebuah target.',
    en: 'I agree clear rewards and consequences attached to a target.',
  },
  {
    code: 'kd26',
    style: 'transactional',
    domain: 'decision_making',
    axis: TASK,
    reverse: true,
    id: 'Saya membiarkan kesepakatan kerja berjalan tanpa perlu ditinjau ulang.',
    en: 'I let a working agreement run without revisiting it.',
  },
  {
    code: 'kd27',
    style: 'transactional',
    domain: 'execution',
    axis: TASK,
    reverse: false,
    id: 'Saya memberi pengakuan segera setelah sebuah target tercapai.',
    en: 'I recognise a target the moment it is met.',
  },
  {
    code: 'kd28',
    style: 'transactional',
    domain: 'decision_making',
    axis: TASK,
    reverse: false,
    id: 'Saya menggunakan data kinerja sebagai dasar menilai pencapaian.',
    en: 'I use performance data as the basis for judging an achievement.',
  },

  // Situational / Adaptive
  {
    code: 'kd29',
    style: 'situational',
    domain: 'adaptability',
    axis: null,
    reverse: false,
    id: 'Saya mengubah gaya memimpin sesuai tingkat kesiapan orang yang saya pimpin.',
    en: 'I change how I lead according to the readiness of the person I am leading.',
  },
  {
    code: 'kd30',
    style: 'situational',
    domain: 'adaptability',
    axis: null,
    reverse: false,
    id: 'Saya membaca situasi sebelum memutuskan seberapa banyak arahan yang diperlukan.',
    en: 'I read the situation before deciding how much direction is needed.',
  },
  {
    code: 'kd31',
    style: 'situational',
    domain: 'decision_making',
    axis: null,
    reverse: false,
    id: 'Saya mengubah rencana ketika informasi baru menunjukkan rencana lama tidak lagi tepat.',
    en: 'I change the plan when new information shows the old one no longer fits.',
  },
  {
    code: 'kd32',
    style: 'situational',
    domain: 'adaptability',
    axis: null,
    reverse: false,
    id: 'Saya nyaman bekerja dalam situasi yang belum sepenuhnya jelas.',
    en: 'I am comfortable working in a situation that is not yet fully clear.',
  },

  // Ethical-Authentic
  {
    code: 'kd33',
    style: 'ethical_authentic',
    domain: 'integrity',
    axis: null,
    reverse: true,
    id: 'Saya bersedia mengesampingkan prinsip saya bila itu mempercepat tercapainya target.',
    en: 'I am willing to set a principle aside if it gets the target met sooner.',
  },
  {
    code: 'kd34',
    style: 'ethical_authentic',
    domain: 'integrity',
    axis: null,
    reverse: false,
    id: 'Saya menyampaikan keputusan yang tidak populer beserta alasannya secara terbuka.',
    en: 'I deliver an unpopular decision together with the reasoning behind it.',
  },
  {
    code: 'kd35',
    style: 'ethical_authentic',
    domain: 'self_awareness',
    axis: null,
    reverse: false,
    id: 'Saya mengakui kesalahan saya di hadapan tim ketika saya keliru.',
    en: 'I acknowledge my mistake in front of the team when I get something wrong.',
  },
  {
    code: 'kd36',
    style: 'ethical_authentic',
    domain: 'integrity',
    axis: null,
    reverse: false,
    id: 'Saya memperlakukan aturan yang sama untuk diri saya dan untuk orang lain.',
    en: 'I hold myself to the same rules I hold others to.',
  },

  // Innovative / Digital-Change
  {
    code: 'kd37',
    style: 'innovative_digital',
    domain: 'innovation',
    axis: null,
    reverse: false,
    id: 'Saya mencari cara kerja baru yang memanfaatkan perkakas digital.',
    en: 'I look for new ways of working that make use of digital tools.',
  },
  {
    code: 'kd38',
    style: 'innovative_digital',
    domain: 'innovation',
    axis: null,
    reverse: false,
    id: 'Saya mengajak tim menguji gagasan dalam skala kecil sebelum diterapkan luas.',
    en: 'I get the team to test an idea small before applying it widely.',
  },
  {
    code: 'kd39',
    style: 'innovative_digital',
    domain: 'adaptability',
    axis: null,
    reverse: false,
    id: 'Saya belajar keterampilan baru ketika tuntutan pekerjaan berubah.',
    en: 'I learn a new skill when what the work demands changes.',
  },
  {
    code: 'kd40',
    style: 'innovative_digital',
    domain: 'innovation',
    axis: null,
    reverse: false,
    id: 'Saya menghubungkan gagasan dari bidang lain ke dalam pekerjaan administrasi.',
    en: 'I bring ideas from other fields into administrative work.',
  },
]

/**
 * The readiness bands. Thresholds, so ADR-010 territory and Academic Lead approval — not a
 * constant anyone may tune. Half-open on the rounded overall score; the last band runs to 100.
 */
export const BANDS = [
  { code: 'emerging', min: 0 },
  { code: 'developing', min: 40 },
  { code: 'established', min: 60 },
  { code: 'advanced', min: 80 },
]

/**
 * Every dimension weighs the same in v1, and that is a deliberate position rather than a default
 * left unset. Unequal weights are a claim that one domain contributes more to administrative
 * leadership readiness than another, and no evidence supports such a claim before the validation
 * programme in kdpgk-v1.md has run. Equal weighting is the honest prior; ADR-010 records it as a
 * decision so that changing it later goes through approval rather than through a config edit.
 */
export const WEIGHT = 1
