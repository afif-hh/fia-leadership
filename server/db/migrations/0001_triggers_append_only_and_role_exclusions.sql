-- Custom migration. Two guarantees SQLite cannot express as constraints.
--
-- 1. `audit_logs` is append-only. A CHECK cannot forbid an UPDATE or a DELETE, and Turso's
--    fine-grained token permissions are unverified on the libSQL engine Drizzle reaches (and
--    absent entirely against a local file), so the trigger is the PRIMARY mechanism rather than
--    a fallback: it behaves identically locally, under `turso dev`, and on Turso Cloud, which
--    is what lets an integration test assert the real guarantee. See issues #34, #27, #23.
--
-- 2. Two role combinations are forbidden. A CHECK is per-row and cannot see sibling rows, so
--    mutual exclusion has to be a trigger. See issue #37.
--
-- IMPORTANT for any future migration that rebuilds `audit_logs`: a BEFORE DELETE trigger does
-- not block DROP TABLE, and is dropped along with the table it guards. Any rebuild must
-- recreate these triggers IN THE SAME MIGRATION, or the table silently becomes mutable and
-- nothing detects it. `server/tests/integration/append-only.test.ts` asserts the triggers exist
-- after ALL migrations have run, not merely after this one.
--
-- ROLLBACK: drop the four triggers created below.
--   DROP TRIGGER IF EXISTS audit_logs_no_update;
--   DROP TRIGGER IF EXISTS audit_logs_no_delete;
--   DROP TRIGGER IF EXISTS identity_user_roles_exclusions_insert;
--   DROP TRIGGER IF EXISTS identity_user_roles_exclusions_update;
-- No data is altered by this migration, so rolling it back loses no rows — it loses only the
-- guarantees, which is precisely why the rebuild note above matters.

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER identity_user_roles_exclusions_insert
BEFORE INSERT ON identity_user_roles
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'lab_admin and academic_lead are mutually exclusive')
  WHERE (
    NEW.role = 'lab_admin' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'academic_lead'
    )
  ) OR (
    NEW.role = 'academic_lead' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'lab_admin'
    )
  );

  SELECT RAISE(ABORT, 'external_partner cannot be combined with an internal role')
  WHERE (
    NEW.role = 'external_partner' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role <> 'external_partner'
    )
  ) OR (
    NEW.role <> 'external_partner' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'external_partner'
    )
  );
END;
--> statement-breakpoint
CREATE TRIGGER identity_user_roles_exclusions_update
BEFORE UPDATE OF role ON identity_user_roles
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'lab_admin and academic_lead are mutually exclusive')
  WHERE (
    NEW.role = 'lab_admin' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'academic_lead' AND id <> NEW.id
    )
  ) OR (
    NEW.role = 'academic_lead' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'lab_admin' AND id <> NEW.id
    )
  );

  SELECT RAISE(ABORT, 'external_partner cannot be combined with an internal role')
  WHERE (
    NEW.role = 'external_partner' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role <> 'external_partner' AND id <> NEW.id
    )
  ) OR (
    NEW.role <> 'external_partner' AND EXISTS (
      SELECT 1 FROM identity_user_roles
      WHERE user_id = NEW.user_id AND role = 'external_partner' AND id <> NEW.id
    )
  );
END;
