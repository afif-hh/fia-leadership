-- Withdrawal for the optional `research-participation` consent (#59).
--
-- Nullable and additive: `ALTER TABLE … ADD COLUMN` is one of the few schema changes SQLite does
-- cheaply, so unlike a CHECK this genuinely could have waited. It ships now anyway, because the
-- opt-in this map introduces must not be an opt-in that can never be undone — the column is the
-- difference between "we will add withdrawal later" and "withdrawal is expressible today".
--
-- Nothing writes it yet. The surface a student withdraws through is identity/profile, out of the
-- taking flow's scope, and the export filter that reads it belongs to the `research` domain.
-- A withdrawn row is never deleted: the `restrict` FK on `user_id` is there because a consent
-- record is a legal record, and erasing it would leave the platform holding assessment data with
-- no surviving proof it was permitted to collect it. Answers are never deleted on withdrawal
-- either — scores and NFR-11 traceability depend on the response set staying intact.
--
-- ROLLBACK: `ALTER TABLE identity_consents DROP COLUMN withdrawn_at;`
-- Lossless only while no row has been withdrawn; after that it destroys the record of a
-- withdrawal, which is the one thing this column exists to preserve.

ALTER TABLE `identity_consents` ADD `withdrawn_at` integer;