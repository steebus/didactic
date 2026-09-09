-- One row per thing.
--
-- Resources were inserted unconditionally, so sending the same link
-- twice -- or looking a book up again months later, since Open Library
-- resolves a work to a stable URL -- made a second row with its own
-- topic links and its own read state, and the map counted one book as
-- two pieces of evidence.
--
-- The route now looks before it inserts, but a check in one handler is
-- only true while that handler is the only writer. This is the rule
-- itself: partial, because a resource without a URL has no identity to
-- be unique on -- a typed book title and a pasted note are legitimately
-- distinct rows even when they read alike.
create unique index if not exists resources_one_per_url
  on resources (user_id, url)
  where url is not null;
