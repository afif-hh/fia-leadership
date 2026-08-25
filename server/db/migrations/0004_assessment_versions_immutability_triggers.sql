-- Custom migration. FR-005: a `published` assessment_versions row is immutable, and #48 held
-- retirement to the same standard — a `retired` version is still the instrument some historical
-- report was scored against, so editing it corrupts the past exactly as much.
--
-- Nine triggers, same reasoning as 0001: a CHECK is per-row and cannot see a parent/child row,
-- and Turso's fine-grained token permissions are unverified on the libSQL engine Drizzle reaches
-- (absent entirely against a local file), so the trigger is the PRIMARY mechanism, not a
-- fallback — it is what behaves identically locally, under `turso dev`, and on Turso Cloud, and
-- what lets an integration test assert the real guarantee. See #44, #47, #48, #49.
--
-- Scope: only `assessment_versions` and its two children, `assessment_version_items` and
-- `assessment_version_item_dimensions`. The bank tables (`assessment_instruments`,
-- `assessment_items`, `assessment_dimensions`, `assessment_scales`) need no protection at all —
-- #47's snapshot-on-publish means a published version no longer depends on them, so they stay
-- freely editable forever.
--
-- The one permitted mutation on a frozen `assessment_versions` row is `published -> retired`
-- plus a `retired_at` write; every other column is compared and any difference aborts.
-- `published -> draft` is illegal (#48) — un-publishing would make `assessment_version_id` stop
-- identifying a fixed instrument, breaking NFR-11 traceability.
--
-- INSERT is included on both child tables deliberately: adding a row to a frozen version's
-- selection or dimension snapshot changes what that version measures just as much as editing
-- one would. Both child triggers subselect their parent's status through `version_id` /
-- `version_item_id`, which costs one indexed lookup and also runs on ordinary draft-authoring
-- writes — real but negligible.
--
-- The publish gate (`assessment_versions_publish_requires_snapshot`) is the highest-value check
-- in the set: it is what keeps a bad publish from happening, where the eight triggers above are
-- what make a bad publish unfixable once it has. Publish has to fill the snapshot columns and
-- then flip status, in one interactive transaction — flipping first would make these same
-- triggers block their own snapshot writes — which leaves a gap the CHECK constraints cannot
-- close: nothing stops a version becoming `published` while a child row still has a NULL
-- snapshot. This trigger closes that gap at the transition itself.
--
-- IMPORTANT for any future migration that rebuilds `assessment_versions`, `assessment_version_items`,
-- or `assessment_version_item_dimensions`: a `BEFORE DELETE` trigger does not block `DROP TABLE`,
-- and is dropped along with the table it guards. Any rebuild must recreate all nine triggers below
-- IN THE SAME MIGRATION, or the tables silently become mutable and nothing detects it.
-- `server/tests/integration/assessment-immutability.test.ts` asserts the triggers exist after ALL
-- migrations have run, not merely after this one — same shape as `append-only.test.ts` uses for
-- `audit_logs`.
--
-- Residual risk, stated rather than hidden: a credential with DDL rights can `DROP TRIGGER`. This
-- defends against bugs and accidents, not a compromised credential. Same position 0001 took.
--
-- ROLLBACK: drop the nine triggers below. No data is altered by this migration, so rolling it
-- back loses no rows — it loses only the guarantees, which is exactly why the rebuild note above
-- matters.
--   DROP TRIGGER IF EXISTS assessment_versions_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_versions_no_delete_frozen;
--   DROP TRIGGER IF EXISTS assessment_versions_publish_requires_snapshot;
--   DROP TRIGGER IF EXISTS assessment_version_items_no_insert_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_items_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_items_no_delete_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_item_dimensions_no_insert_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_item_dimensions_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_item_dimensions_no_delete_frozen;

CREATE TRIGGER assessment_versions_no_update_frozen
BEFORE UPDATE ON assessment_versions
FOR EACH ROW WHEN OLD.status IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_versions is immutable once published or retired')
  WHERE NOT (
    OLD.status = 'published'
    AND NEW.status = 'retired'
    AND NEW.id = OLD.id
    AND NEW.instrument_id = OLD.instrument_id
    AND NEW.version_no = OLD.version_no
    AND NEW.published_at = OLD.published_at
    AND NEW.source_version_id IS OLD.source_version_id
    AND NEW.created_at = OLD.created_at
    AND NEW.created_by = OLD.created_by
  );
END;
--> statement-breakpoint
CREATE TRIGGER assessment_versions_no_delete_frozen
BEFORE DELETE ON assessment_versions
FOR EACH ROW WHEN OLD.status IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_versions is immutable once published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_versions_publish_requires_snapshot
BEFORE UPDATE ON assessment_versions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'publish requires a complete snapshot')
  WHERE OLD.status <> 'published' AND NEW.status = 'published'
    AND (
      NOT EXISTS (SELECT 1 FROM assessment_version_items WHERE version_id = NEW.id)
      OR EXISTS (
        SELECT 1 FROM assessment_version_items
        WHERE version_id = NEW.id
          AND (stem_snapshot IS NULL OR scale_points_snapshot IS NULL)
      )
    );
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_items_no_insert_frozen
BEFORE INSERT ON assessment_version_items
FOR EACH ROW WHEN (
  SELECT status FROM assessment_versions WHERE id = NEW.version_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_items is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_items_no_update_frozen
BEFORE UPDATE ON assessment_version_items
FOR EACH ROW WHEN (
  SELECT status FROM assessment_versions WHERE id = OLD.version_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_items is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_items_no_delete_frozen
BEFORE DELETE ON assessment_version_items
FOR EACH ROW WHEN (
  SELECT status FROM assessment_versions WHERE id = OLD.version_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_items is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_item_dimensions_no_insert_frozen
BEFORE INSERT ON assessment_version_item_dimensions
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = NEW.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_dimensions is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_item_dimensions_no_update_frozen
BEFORE UPDATE ON assessment_version_item_dimensions
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = OLD.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_dimensions is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_item_dimensions_no_delete_frozen
BEFORE DELETE ON assessment_version_item_dimensions
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = OLD.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_dimensions is immutable once its version is published or retired');
END;
