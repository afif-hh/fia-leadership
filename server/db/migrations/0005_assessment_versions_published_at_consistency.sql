-- Custom migration. `assessment_versions.published_at` must be present exactly when the version
-- has been published — that is, `published_at IS NOT NULL` if and only if the status is
-- `published` or `retired`. A retired version keeps its `published_at`: it was published, and
-- 0004's update trigger requires that column to be unchanged across `published -> retired`.
--
-- 0003 shipped only one direction of that rule:
--
--   CHECK (status <> 'published' OR published_at IS NOT NULL)
--
-- which says a published row must carry a timestamp, but permits a `draft` row that already
-- carries one, and a `retired` row carrying none. Both are nonsense states — "this draft was
-- published on Tuesday" — and either would make `published_at` unusable as the answer to "when did
-- this version freeze", which is the question NFR-11 traceability asks of it.
--
-- Triggers rather than a corrected CHECK, and the choice is about risk, not preference. SQLite
-- cannot alter a CHECK; changing one means the 12-step table rebuild, and `assessment_versions`
-- carries three of 0004's nine `RAISE(ABORT)` triggers, a self-referencing foreign key
-- (`source_version_id`) and the partial unique index that enforces one open version per
-- instrument. Triggers are dropped with the table they guard, so a rebuild has to recreate every
-- one of them correctly in the same migration — 0004's own header says exactly this — and a
-- trigger that is silently missing afterwards fails OPEN: the table simply becomes mutable and
-- nothing detects it. Two new triggers reach the identical guarantee, add nothing to drop, and
-- put nothing already in place at risk. The weaker CHECK in 0003 stays; it is now redundant
-- rather than wrong, and removing it would itself require the rebuild this migration exists to
-- avoid.
--
-- Both triggers compare two boolean expressions. In SQLite each yields 0 or 1, so `!=` between
-- them is precisely "these disagree", i.e. the `iff` is violated.
--
-- Reachability: neither state is reachable through `server/domain/assessment/repository.ts` today.
-- `publish` sets status and `published_at` together and `retire` touches neither, so this is
-- defence in depth against a future writer, a manual fix applied under pressure, or a bulk import
-- — the same standing this project gives its other engine-level controls (ADR-005).
--
-- ROLLBACK: run the two statements below. No data is altered, so this loses no rows.
--   DROP TRIGGER IF EXISTS assessment_versions_published_at_insert_consistent;
--   DROP TRIGGER IF EXISTS assessment_versions_published_at_update_consistent;

CREATE TRIGGER assessment_versions_published_at_insert_consistent
BEFORE INSERT ON assessment_versions
FOR EACH ROW WHEN
  (NEW.published_at IS NOT NULL) != (NEW.status IN ('published', 'retired'))
BEGIN
  SELECT RAISE(
    ABORT,
    'assessment_versions.published_at must be set exactly when status is published or retired'
  );
END;
--> statement-breakpoint

-- The update side is not covered by 0004's frozen-row trigger: that one only guards rows that are
-- already `published` or `retired`, so an open draft could still be updated into a
-- published_at-carrying state without ever changing status.
CREATE TRIGGER assessment_versions_published_at_update_consistent
BEFORE UPDATE ON assessment_versions
FOR EACH ROW WHEN
  (NEW.published_at IS NOT NULL) != (NEW.status IN ('published', 'retired'))
BEGIN
  SELECT RAISE(
    ABORT,
    'assessment_versions.published_at must be set exactly when status is published or retired'
  );
END;
