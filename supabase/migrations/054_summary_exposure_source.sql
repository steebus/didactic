-- One enum value, alone in its own migration -- see 013 for why.
--
-- Saying the whole of a reading back in your own words is one of the
-- most thorough things a reader can do with it, and it is rewarded as
-- working with it is: an `applied` exposure, the one depth that passes
-- the consumption ceiling. It gets a source of its own so it can be
-- written once per reading and never again -- `source_id` is the lesson
-- or resource it summarises, so removing a summary and writing another
-- finds the exposure already there instead of earning it twice.
alter type exposure_source add value if not exists 'summary';
