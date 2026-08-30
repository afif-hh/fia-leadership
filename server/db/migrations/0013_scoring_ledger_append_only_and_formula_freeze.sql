-- Custom migration. The database half of two guarantees `docs/assessment/scoring-spec.md` states
-- and that no CHECK can hold: the score ledger is append-only, and an approved formula never
-- changes again.
--
-- Same standing as 0001, 0004 and 0007: a trigger is the PRIMARY mechanism here, not a fallback.
-- Turso's fine-grained token permissions are unverified on the libSQL engine Drizzle reaches and
-- absent entirely against a local file, so the trigger is what makes an integration test able to
-- assert the real guarantee locally and in the cloud alike.
--
-- Why each group exists:
--
-- 1. Ledger append-only (`profile_score_runs`, `profile_scores`, `profile_snapshots`). The spec
--    says "Score ledger append-only. Tidak ada UPDATE pada `scores` yang sudah authoritative",
--    and SC-08 asks that a historical report be unchanged after a new formula ships. A repository
--    with no update method is a convention; this is the guarantee. Re-scoring writes a *new* run,
--    which is why forbidding UPDATE outright costs nothing.
--
--    DELETE is included with UPDATE. A deleted run is a score whose disappearance is
--    indistinguishable from one that never happened, and NFR-11's traceability is exactly the
--    property that loses.
--
-- 2. Approved-formula freeze (`assessment_scoring_versions`, `assessment_scoring_rules`). A
--    scoring version that has produced scores must keep meaning what it meant. Editing a weight
--    in place would silently redefine every historical score that cites it, with no new row to
--    notice — the same failure `assessment_versions` is frozen against in 0004, one level up.
--
--    The one permitted UPDATE is `approved → retired`, touching `status` and `retired_at` only.
--    Retiring means "stop handing this formula out", never "recompute what it produced", so it
--    changes no number. Every other column is compared to itself in the WHEN clause, which is how
--    the trigger allows that single transition without allowing an edit dressed up as one.
--
-- 3. Approve gate (`assessment_scoring_versions_approve_requires_rules`). A formula with no
--    weights scores nothing, and approving one would put an unusable configuration in the single
--    slot the "one approved per version" index reserves. A per-row CHECK cannot see a child table,
--    so this is the same shape as 0004's publish gate.
--
-- Residual risk: a credential with DDL rights can `DROP TRIGGER`, the same position every trigger
-- migration in this repo takes. This defends against bugs and accidents, not a compromised
-- credential.
--
-- ROLLBACK: run the statements below. No data is altered, so nothing is lost but the guarantees.
--   DROP TRIGGER IF EXISTS profile_score_runs_no_update;
--   DROP TRIGGER IF EXISTS profile_score_runs_no_delete;
--   DROP TRIGGER IF EXISTS profile_scores_no_update;
--   DROP TRIGGER IF EXISTS profile_scores_no_delete;
--   DROP TRIGGER IF EXISTS profile_snapshots_no_update;
--   DROP TRIGGER IF EXISTS profile_snapshots_no_delete;
--   DROP TRIGGER IF EXISTS assessment_scoring_versions_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_scoring_versions_no_delete_frozen;
--   DROP TRIGGER IF EXISTS assessment_scoring_rules_no_insert_frozen;
--   DROP TRIGGER IF EXISTS assessment_scoring_rules_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_scoring_rules_no_delete_frozen;
--   DROP TRIGGER IF EXISTS assessment_scoring_versions_approve_requires_rules;

CREATE TRIGGER profile_score_runs_no_update
BEFORE UPDATE ON profile_score_runs
BEGIN
  SELECT RAISE(ABORT, 'profile_score_runs is append-only; re-scoring writes a new run');
END;
--> statement-breakpoint
CREATE TRIGGER profile_score_runs_no_delete
BEFORE DELETE ON profile_score_runs
BEGIN
  SELECT RAISE(ABORT, 'profile_score_runs is append-only; a score run is never removed');
END;
--> statement-breakpoint
CREATE TRIGGER profile_scores_no_update
BEFORE UPDATE ON profile_scores
BEGIN
  SELECT RAISE(ABORT, 'profile_scores is append-only; re-scoring writes a new run');
END;
--> statement-breakpoint
CREATE TRIGGER profile_scores_no_delete
BEFORE DELETE ON profile_scores
BEGIN
  SELECT RAISE(ABORT, 'profile_scores is append-only; a score is never removed');
END;
--> statement-breakpoint
CREATE TRIGGER profile_snapshots_no_update
BEFORE UPDATE ON profile_snapshots
BEGIN
  SELECT RAISE(ABORT, 'profile_snapshots is append-only; a report already shown never changes');
END;
--> statement-breakpoint
CREATE TRIGGER profile_snapshots_no_delete
BEFORE DELETE ON profile_snapshots
BEGIN
  SELECT RAISE(ABORT, 'profile_snapshots is append-only; a report already shown is never removed');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_versions_no_update_frozen
BEFORE UPDATE ON assessment_scoring_versions
FOR EACH ROW WHEN OLD.status IN ('approved', 'retired') AND NOT (
  OLD.status = 'approved' AND NEW.status = 'retired'
  AND NEW.id = OLD.id
  AND NEW.version_id = OLD.version_id
  AND NEW.scoring_no = OLD.scoring_no
  AND NEW.bands = OLD.bands
  AND NEW.task_axis_dimension_id IS OLD.task_axis_dimension_id
  AND NEW.people_axis_dimension_id IS OLD.people_axis_dimension_id
  AND NEW.created_at = OLD.created_at
  AND NEW.created_by = OLD.created_by
  AND NEW.approved_at IS OLD.approved_at
  AND NEW.approved_by IS OLD.approved_by
)
BEGIN
  SELECT RAISE(ABORT, 'an approved scoring version is immutable; only retiring it is allowed');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_versions_no_delete_frozen
BEFORE DELETE ON assessment_scoring_versions
FOR EACH ROW WHEN OLD.status IN ('approved', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'an approved scoring version is immutable and cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_rules_no_insert_frozen
BEFORE INSERT ON assessment_scoring_rules
FOR EACH ROW WHEN (
  SELECT status FROM assessment_scoring_versions WHERE id = NEW.scoring_version_id
) IN ('approved', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'the rules of an approved scoring version are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_rules_no_update_frozen
BEFORE UPDATE ON assessment_scoring_rules
FOR EACH ROW WHEN (
  SELECT status FROM assessment_scoring_versions WHERE id = OLD.scoring_version_id
) IN ('approved', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'the rules of an approved scoring version are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_rules_no_delete_frozen
BEFORE DELETE ON assessment_scoring_rules
FOR EACH ROW WHEN (
  SELECT status FROM assessment_scoring_versions WHERE id = OLD.scoring_version_id
) IN ('approved', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'the rules of an approved scoring version are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_scoring_versions_approve_requires_rules
BEFORE UPDATE ON assessment_scoring_versions
FOR EACH ROW WHEN NEW.status = 'approved' AND OLD.status <> 'approved' AND NOT EXISTS (
  SELECT 1 FROM assessment_scoring_rules WHERE scoring_version_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'a scoring version with no rules scores nothing and cannot be approved');
END;
