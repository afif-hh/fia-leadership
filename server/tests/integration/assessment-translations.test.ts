import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BaseLocaleNotTranslatableError,
  createAssessmentRepository,
  getInstrument,
  getInstrumentTranslations,
  getVersionDetail,
  getSession,
  listScales,
  startSession,
  type AssessmentRepository,
} from '../../domain/assessment'
import { assessmentVersionItemTranslations } from '../../db/schema/assessment'
import { freshDb, insertUser, type TestDb } from '../setup/db'

/**
 * Assessment content in a second language.
 *
 * Three rules carry the whole design, and each is easy to break in a way no type catches:
 *
 * 1. **The base row is the fallback**, so an untranslated item renders in Indonesian rather than
 *    as a hole. A partly translated instrument is an ordinary state, not an error.
 * 2. **Stem and anchors move together.** A translated question above an untranslated ladder puts
 *    the answers in a different language from the question.
 * 3. **Publish freezes the translation too.** A student who answered the English rendering
 *    answered those sentences, and editing the bank afterwards must not change what the record
 *    says they were asked.
 */

const ACTOR = 'tester'

async function seed(repo: AssessmentRepository) {
  const instrumentId = await repo.createInstrument({
    code: 'kdpgk_tr',
    name: 'KDPGK',
    createdBy: ACTOR,
  })
  const scaleId = await repo.createScale({
    instrumentId,
    code: 'likert5',
    name: 'Likert 5',
    points: [
      { value: 1, label: 'Sangat tidak sesuai' },
      { value: 5, label: 'Sangat sesuai' },
    ],
  })
  const dimensionId = await repo.createDimension({
    instrumentId,
    code: 'directive',
    name: 'Direktif',
    kind: 'style',
  })
  const itemId = await repo.createItem({
    instrumentId,
    code: 'kd01',
    stem: 'Saya membuat keputusan tanpa berkonsultasi.',
    scaleId,
    createdBy: ACTOR,
  })
  await repo.setItemDimensions(itemId, [dimensionId])

  const { versionId } = await repo.createVersion({ instrumentId, actorUserId: ACTOR })
  await repo.addVersionItem({ versionId, itemId, position: 0 })

  return { instrumentId, scaleId, dimensionId, itemId, versionId }
}

describe('assessment content in a second language', () => {
  let t: TestDb
  let repo: AssessmentRepository

  beforeEach(async () => {
    t = await freshDb()
    repo = createAssessmentRepository(t.db)
  })
  afterEach(() => t.drop())

  describe('the bank', () => {
    it('falls back to the authored text for a language with no translation', async () => {
      const { instrumentId, versionId } = await seed(repo)

      const english = await getVersionDetail(t.db, versionId, 'en')
      expect(english.items[0]!.stem).toBe('Saya membuat keputusan tanpa berkonsultasi.')
      expect((await getInstrument(t.db, instrumentId, 'en')).name).toBe('KDPGK')
    })

    it('renders the translation once it exists, and leaves the base row alone', async () => {
      const { instrumentId, itemId, scaleId, versionId } = await seed(repo)

      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'I decide without consulting.' })
      await repo.setScaleTranslation({
        scaleId,
        locale: 'en',
        name: 'Likert 5',
        points: [
          { value: 1, label: 'Strongly disagree' },
          { value: 5, label: 'Strongly agree' },
        ],
      })
      await repo.setInstrumentTranslation({ instrumentId, locale: 'en', name: 'KDPGK (EN)' })

      const english = await getVersionDetail(t.db, versionId, 'en')
      expect(english.items[0]!.stem).toBe('I decide without consulting.')
      expect(english.items[0]!.scalePoints).toEqual([
        { value: 1, label: 'Strongly disagree' },
        { value: 5, label: 'Strongly agree' },
      ])
      expect((await getInstrument(t.db, instrumentId, 'en')).name).toBe('KDPGK (EN)')

      const indonesian = await getVersionDetail(t.db, versionId, 'id')
      expect(indonesian.items[0]!.stem).toBe('Saya membuat keputusan tanpa berkonsultasi.')
      expect((await getInstrument(t.db, instrumentId, 'id')).name).toBe('KDPGK')
    })

    it('keeps the question and its answers in one language', async () => {
      // A translated stem above an untranslated ladder would put the question in English and the
      // answers in Indonesian. The pair is chosen as a pair, so this falls back whole.
      const { itemId, versionId } = await seed(repo)
      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'I decide without consulting.' })

      const english = await getVersionDetail(t.db, versionId, 'en')
      expect(english.items[0]!.stem).toBe('Saya membuat keputusan tanpa berkonsultasi.')
      expect(english.items[0]!.scalePoints).toEqual([
        { value: 1, label: 'Sangat tidak sesuai' },
        { value: 5, label: 'Sangat sesuai' },
      ])
    })

    it('replaces a translation rather than accumulating rows', async () => {
      const { instrumentId, itemId } = await seed(repo)
      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'First attempt.' })
      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'Second attempt.' })

      const stored = await getInstrumentTranslations(t.db, instrumentId, 'en')
      expect(stored.items).toEqual([{ itemId, stem: 'Second attempt.' }])
    })

    it('refuses the base language, which lives on the row itself', async () => {
      const { itemId } = await seed(repo)
      await expect(
        repo.setItemTranslation({ itemId, locale: 'id', stem: 'Tidak boleh.' })
      ).rejects.toBeInstanceOf(BaseLocaleNotTranslatableError)
    })

    it('reports what has been translated, without the fallback standing in for it', async () => {
      // The resolved reads cannot tell a real translation from a fallback, which is exactly why
      // the authoring screen needs this one.
      const { instrumentId, itemId } = await seed(repo)
      expect((await getInstrumentTranslations(t.db, instrumentId, 'en')).items).toEqual([])

      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'I decide without consulting.' })
      expect((await getInstrumentTranslations(t.db, instrumentId, 'en')).items).toEqual([
        { itemId, stem: 'I decide without consulting.' },
      ])
    })
  })

  describe('publish', () => {
    async function publishWithEnglish() {
      const seeded = await seed(repo)
      await repo.setItemTranslation({
        itemId: seeded.itemId,
        locale: 'en',
        stem: 'I decide without consulting.',
      })
      await repo.setScaleTranslation({
        scaleId: seeded.scaleId,
        locale: 'en',
        name: 'Likert 5',
        points: [
          { value: 1, label: 'Strongly disagree' },
          { value: 5, label: 'Strongly agree' },
        ],
      })
      await repo.advanceToReview(seeded.versionId)
      await repo.publish(seeded.versionId, ACTOR)
      return seeded
    }

    it('freezes the translated wording alongside the Indonesian one', async () => {
      const { versionId, itemId } = await publishWithEnglish()

      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'Reworded after publish.' })

      const english = await getVersionDetail(t.db, versionId, 'en')
      expect(english.items[0]!.stem).toBe('I decide without consulting.')
    })

    it('writes no translated snapshot for a language the bank had not been translated into', async () => {
      const seeded = await seed(repo)
      await repo.advanceToReview(seeded.versionId)
      await repo.publish(seeded.versionId, ACTOR)

      const rows = await t.db.select().from(assessmentVersionItemTranslations)
      expect(rows).toEqual([])

      // And the reader gets the Indonesian snapshot rather than nothing.
      const english = await getVersionDetail(t.db, seeded.versionId, 'en')
      expect(english.items[0]!.stem).toBe('Saya membuat keputusan tanpa berkonsultasi.')
    })

    it('refuses a write to the translated snapshot once the version is published', async () => {
      // Migration 0010's trigger, not the service, is the guarantee — same pairing as #48.
      const { versionId } = await publishWithEnglish()
      const detail = await getVersionDetail(t.db, versionId, 'en')
      const versionItemId = detail.items[0]!.versionItemId

      // Raw SQL through the client, like the other immutability tests: the point is that the
      // engine refuses, not that a service method declines to ask.
      await expect(
        t.client.execute({
          sql: 'UPDATE assessment_version_item_translations SET stem_snapshot = ? WHERE version_item_id = ?',
          args: ['Tampered.', versionItemId],
        })
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' })
    })

    it('shows a student the frozen translation rather than the bank text of today', async () => {
      const { versionId, itemId } = await publishWithEnglish()
      const userId = await insertUser(t.db)
      await repo.setItemTranslation({ itemId, locale: 'en', stem: 'Reworded after publish.' })

      const started = await startSession(t.db, {
        versionId,
        userId,
        consentPolicyVersion: 'v1',
      })
      const session = await getSession(t.db, {
        sessionId: started.session.id,
        userId,
        locale: 'en',
      })

      expect(session.items[0]!.stem).toBe('I decide without consulting.')
      expect(session.items[0]!.scalePoints).toEqual([
        { value: 1, label: 'Strongly disagree' },
        { value: 5, label: 'Strongly agree' },
      ])
    })
  })

  describe('the scale ladder', () => {
    it('is translated whole, so a reader never sees a half-translated ladder', async () => {
      const { instrumentId, scaleId } = await seed(repo)
      await repo.setScaleTranslation({
        scaleId,
        locale: 'en',
        name: 'Likert 5',
        points: [
          { value: 1, label: 'Strongly disagree' },
          { value: 5, label: 'Strongly agree' },
        ],
      })

      const [scale] = await listScales(t.db, instrumentId, 'en')
      expect(scale!.points).toEqual([
        { value: 1, label: 'Strongly disagree' },
        { value: 5, label: 'Strongly agree' },
      ])
    })
  })
})
