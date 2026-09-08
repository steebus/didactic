-- The app's own reading of the sowing answers, kept beside the user's
-- self-report rather than replacing it.
--
-- Both figures matter and they are different claims: `roots` is what
-- the user said about themselves, `assessed_level` is what their
-- answers to the qualifying set actually showed. Printing the second
-- without keeping the first would be the app quietly overwriting the
-- user, which PRODUCT.md's fifth principle rules out.
alter table subject_sowings
  add column assessed_level smallint check (assessed_level between 0 and 5),
  -- {level, note, shown[], missing[], answered, asked}
  add column assessment jsonb;
