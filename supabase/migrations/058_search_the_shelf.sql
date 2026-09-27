-- Searching the shelf all the way down.
--
-- The inbox's search box matched what every row already carries -- the
-- title, the address, the topics -- and nothing the reader could not
-- already see. What a resource *says* (its readable body, 053) and what
-- the reader wrote in it (marks, notes and summaries, which are all
-- `highlights`) were out of reach, and those are the two things someone
-- half-remembering an article is most likely to be searching for.
--
-- So the body gets the index the marks have had since 020, and one
-- function searches both and hands back, for each match, where it was
-- found and the words around it. The ranking of those matches -- the
-- reader's own words before the text's -- is `core/shelf.bestHits`,
-- where both front ends read it.
--
-- Idempotent, like everything since 025.

alter table resource_bodies
  add column if not exists search tsvector
  generated always as (to_tsvector('english', body)) stored;

create index if not exists resource_bodies_search_idx
  on resource_bodies using gin (search);

-- Every place a search is found on the shelf, for one reader.
--
-- `found_in` is 'text' for the body, and for what the reader wrote:
-- 'summary', 'mark' (a passage kept) or 'note' (a note with nothing
-- quoted). The snippet is `ts_headline`'s, with each matched word
-- between U+27E6 and U+27E7 -- `core/shelf.HIT_OPEN` and `HIT_CLOSE` --
-- which no article is going to contain, so a front end can set the
-- emphasis itself rather than trusting markup out of the database.
--
-- Invoker's rights: it reads only what the caller could read anyway.
-- The API calls it as the service role on the owner's behalf with the
-- owner's id; a phone calling it under its own token is still held to
-- its own rows by the policies on both tables.
create or replace function search_shelf(p_user uuid, p_query text, p_limit int default 60)
returns table (resource_id uuid, found_in text, snippet text, rank real)
language sql
stable
set search_path = public, pg_catalog
as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq),
  found as (
    select
      b.resource_id,
      'text'::text as found_in,
      ts_headline(
        'english', b.body, q.tsq,
        'MaxFragments=1, MaxWords=24, MinWords=10, StartSel=⟦, StopSel=⟧'
      ) as snippet,
      ts_rank(b.search, q.tsq) as rank
    from resource_bodies b, q
    where b.user_id = p_user and b.search @@ q.tsq

    union all

    select
      h.resource_id,
      case
        when h.kind = 'summary' then 'summary'
        when h.quote <> '' then 'mark'
        else 'note'
      end,
      ts_headline(
        'english', trim(h.quote || ' ' || coalesce(h.note, '')), q.tsq,
        'MaxFragments=1, MaxWords=24, MinWords=10, StartSel=⟦, StopSel=⟧'
      ),
      ts_rank(h.search, q.tsq)
    from highlights h, q
    where h.user_id = p_user and h.resource_id is not null and h.search @@ q.tsq
  )
  select resource_id, found_in, snippet, rank
  from found
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

comment on function search_shelf(uuid, text, int) is
  'Where a search is found in resources: their readable text and what the reader wrote in them. Ranked; the inbox keeps the most telling hit per resource (core/shelf.bestHits).';
