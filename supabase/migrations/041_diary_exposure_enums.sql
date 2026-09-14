-- Two enum values, alone in their own migration -- see 013 for why.
--
-- Postgres allows `alter type ... add value` inside a transaction but
-- forbids *using* the new value in that same transaction, and the
-- migration runner wraps each file in one. Anything that writes a
-- `struggled` exposure or reads one back belongs in a later file than
-- this one.

-- Struggle, recorded as what it is.
--
-- The user asked that a diary entry be able to lower a topic's standing
-- and not only raise it. The obvious way is a negative `ability_delta`,
-- and it does not work: that column is written by every exposure and
-- read by nothing. `computeAbility` derives ability entirely from
-- `depth`, so a negative number there would move no figure on any
-- sheet.
--
-- So struggle is a depth, weighted nothing. It adds no ability -- you
-- do not get better at a thing by finding it hard -- but it is an
-- exposure and a distinct depth, so it counts in the confidence the app
-- prints beside the figure. The topic goes *vague*, not down: honest
-- about the app knowing less than it thought, and refusing to erase
-- reading that genuinely happened.
--
-- It reads back on the topic sheet like any other exposure, with the
-- reader's own sentence as its reason -- which is the third principle
-- (every number explains itself) getting this for free.
alter type exposure_depth add value if not exists 'struggled';

-- Where an exposure written from an entry came from. `applied` finally
-- has an input: it is weighted 1.0 and is the only depth that passes
-- the 3.5 consumption ceiling, and until the diary nothing in the app
-- wrote one.
alter type exposure_source add value if not exists 'diary';
