```
ADR-009: Bilingual platform — Indonesian base, English translation beside it
Status: Proposed — requires Academic Lead approval before the assessment half ships
Date: 2026-08-30
Type: architecture, assessment
Context: The platform must serve Indonesian and English across every surface. Two
  kinds of text are involved and they are not the same problem. Interface copy is
  written by developers, changes with the code, and is wrong only in the ordinary
  sense. Assessment content — instrument names, dimensions, scale anchors, item
  stems — is authored under governance, frozen at publish (FR-005, #48), and is
  what a student answers; a translated instrument is, psychometrically, a
  different instrument until it has been validated as the same one
  (docs/assessment/validity-log.md). Consent text is a third case again: a
  consent row is a legal record, and `policy_hash` attests to exact bytes.
Decision: Three mechanisms, one per kind of text.
  1. Interface copy: `@nuxtjs/i18n` with `strategy: 'prefix_except_default'`,
     Indonesian at the bare paths and English under `/en`. Messages live in
     `i18n/locales/{id,en}.json`; `fallbackLocale: 'id'` means a missing English
     key renders Indonesian, never a raw key. The server ships stable identifiers
     — error codes, nav item ids — and never display strings.
  2. Assessment content: side-car translation tables keyed `(row, locale)`. The
     base row keeps the Indonesian text, so nothing is backfilled and the default
     read path is unchanged. Publish freezes the translated stem and the whole
     anchor ladder into `assessment_version_item_translations`, under the same
     immutability triggers as the base snapshot. Stem and anchors are chosen as a
     pair on every read: a translated question above an untranslated ladder is
     refused in favour of falling back whole.
  3. Consent: one version, several languages. `identity_consents.policy_locale`
     records which text the student read, and `policy_hash` is the digest of that
     language's bytes. The gate verifies the stored locale's hash, never the
     request's.
  Indonesian is authoritative. Each English policy document says so in its own
  text, and the consent page states it outright when a document falls back.
Consequences: A translated instrument is treated as a rendering of the same
  version, not as a new instrument. That is the load-bearing claim in this ADR
  and it is the Academic Lead's to accept or refuse: if a translated KDPGK must
  be revalidated before use, the correct model is a separate instrument, and the
  tables here would then carry only a display translation that no version may be
  published with. Until that is decided, the schema supports translation but
  nothing obliges an instrument to be published with one — an untranslated
  version renders Indonesian to every reader, which is the safe default.
  Adding a third language is a migration, because the locale vocabulary is
  engine-held (ADR-005). `identity_consents.policy_locale` is the exception, and
  0011 says why.
Rollback: The interface layer is removable by deleting the module and the message
  files; the strings would have to come back inline. The content layer is
  additive — dropping the four translation tables and
  `assessment_version_item_translations` leaves every base row and every base
  snapshot intact, so the platform reverts to Indonesian-only with no data loss.
  `identity_consents.policy_locale` is lossless to drop only while every recorded
  consent is Indonesian.
```

Open question for the Academic Lead, and the reason this ADR is Proposed rather
than Accepted: whether an English rendering of a validated instrument may be
published as the same version, or whether it must be validated as an instrument in
its own right. The engineering supports either answer; the decision is academic,
not technical. Follow `skills/assessment-scoring-change/SKILL.md` to record it.
