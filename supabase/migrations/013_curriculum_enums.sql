-- Two enum values, alone in their own migration.
--
-- Postgres allows `alter type ... add value` inside a transaction but
-- forbids *using* the new value in that same transaction, and the
-- migration runner wraps each file in one. Keeping these apart from
-- 014 is what lets 014 reference them.

alter type exposure_source add value if not exists 'lesson';
alter type conversation_kind add value if not exists 'curriculum';
