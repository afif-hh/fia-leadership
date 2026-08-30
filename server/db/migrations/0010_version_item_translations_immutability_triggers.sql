-- Freeze the per-locale publish snapshot, the same way 0004 freezes the base one.
--
-- `assessment_version_item_translations` is written during publish, inside the same transaction
-- that fills `stem_snapshot` and flips status. From the moment the version is `published` the
-- rows must be unwritable: a student who answered the English rendering answered those sentences,
-- and a later edit to the bank translation must not change what the record says they were asked
-- (FR-005, #48).
--
-- The trigger, not the service, is the guarantee — same reasoning as 0004. The service guard
-- exists only to produce a friendlier message before the engine refuses.
--
-- IMPORTANT, mirroring 0004's own note: SQLite drops a table's triggers when the table is
-- rebuilt. Any future migration that rebuilds `assessment_version_item_translations` must
-- re-create these three afterwards:
--
--   DROP TRIGGER IF EXISTS assessment_version_item_translations_no_insert_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_item_translations_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_version_item_translations_no_delete_frozen;

CREATE TRIGGER assessment_version_item_translations_no_insert_frozen
BEFORE INSERT ON assessment_version_item_translations
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = NEW.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_translations is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_item_translations_no_update_frozen
BEFORE UPDATE ON assessment_version_item_translations
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = OLD.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_translations is immutable once its version is published or retired');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_version_item_translations_no_delete_frozen
BEFORE DELETE ON assessment_version_item_translations
FOR EACH ROW WHEN (
  SELECT v.status FROM assessment_versions v
  JOIN assessment_version_items vi ON vi.version_id = v.id
  WHERE vi.id = OLD.version_item_id
) IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'assessment_version_item_translations is immutable once its version is published or retired');
END;
