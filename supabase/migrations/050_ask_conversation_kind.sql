-- One enum value, alone in its own migration -- see 013 for why.
--
-- Postgres allows `alter type ... add value` inside a transaction but
-- forbids *using* the new value in that same transaction, and the
-- migration runner wraps each file in one. Everything that writes an
-- `ask` conversation or reads one back is in 051.

-- A conversation the reader started from the corner of the page, about
-- whatever was on screen. The three kinds before it were all started by
-- the app; this is the first one the reader opens.
alter type conversation_kind add value if not exists 'ask';
