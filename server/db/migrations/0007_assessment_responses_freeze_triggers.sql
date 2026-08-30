-- Custom migration. #58: an answer upserts freely while its session is `in_progress`, then is
-- frozen once the session is `submitted`.
--
-- Three triggers, same reasoning as 0001 and 0004: a CHECK is per-row and cannot see the parent
-- session's status, and Turso's fine-grained token permissions are unverified on the libSQL
-- engine Drizzle reaches (absent entirely against a local file), so the trigger is the PRIMARY
-- mechanism rather than a fallback — it behaves identically locally, under `turso dev`, and on
-- Turso Cloud, which is what lets an integration test assert the real guarantee.
--
-- Why freezing matters here specifically: NFR-11 requires a score to be traceable to the response
-- set that produced it. A mutable response set makes an old score irreproducible, so this is the
-- database-level half of that guarantee. #58 rejected the two alternatives explicitly — plain
-- upsert with no freeze (nothing stops an answer changing after submission), and append-only
-- history (an edit trail is behavioural data nobody requested, scoring does not read, and that is
-- more revealing than the final answer if it leaks).
--
-- INSERT is included alongside UPDATE and DELETE deliberately, extending #58's resolution, which
-- named only the latter two. Adding a row to a submitted session changes the response set a score
-- was computed from just as much as editing one would, and 0004 includes INSERT on both its child
-- triggers for exactly this reason. Flagged in the issue rather than made silently.
--
-- The status list is spelled out rather than written as `<> 'in_progress'`, matching 0004's style.
-- That is safe because `status` is closed by a CHECK constraint, and widening it means rebuilding
-- the table — which the note in 0006 already requires bringing these triggers with it, so the
-- author of that rebuild is reading this file anyway.
--
-- Residual risk: a credential with DDL rights can `DROP TRIGGER` (same position as 0001 and 0004).
-- This defends against bugs and accidents, not a compromised credential.
--
-- ROLLBACK: run the three statements below. No data is altered, so this loses no rows — only the
-- guarantee, which is why the rebuild note in 0006 matters.
--   DROP TRIGGER IF EXISTS assessment_responses_no_insert_frozen;
--   DROP TRIGGER IF EXISTS assessment_responses_no_update_frozen;
--   DROP TRIGGER IF EXISTS assessment_responses_no_delete_frozen;

CREATE TRIGGER assessment_responses_no_insert_frozen
BEFORE INSERT ON assessment_responses
FOR EACH ROW WHEN (
  SELECT status FROM assessment_sessions WHERE id = NEW.session_id
) IN ('submitted', 'scored')
BEGIN
  SELECT RAISE(ABORT, 'assessment_responses is frozen once its session is submitted');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_responses_no_update_frozen
BEFORE UPDATE ON assessment_responses
FOR EACH ROW WHEN (
  SELECT status FROM assessment_sessions WHERE id = OLD.session_id
) IN ('submitted', 'scored')
BEGIN
  SELECT RAISE(ABORT, 'assessment_responses is frozen once its session is submitted');
END;
--> statement-breakpoint
CREATE TRIGGER assessment_responses_no_delete_frozen
BEFORE DELETE ON assessment_responses
FOR EACH ROW WHEN (
  SELECT status FROM assessment_sessions WHERE id = OLD.session_id
) IN ('submitted', 'scored')
BEGIN
  SELECT RAISE(ABORT, 'assessment_responses is frozen once its session is submitted');
END;
