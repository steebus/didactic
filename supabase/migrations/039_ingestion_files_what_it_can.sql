-- A read resource files its new topics into the subject it clearly
-- belongs to, and the rest stay loose on purpose.
--
-- Ingestion created topics with no subject at all. A link about Rust
-- ownership would match "borrow checker" and "lifetimes" -- topics
-- already sitting under a Rust subject -- and then create "Pin/Unpin"
-- as an orphan belonging to nothing, invisible on every subject sheet
-- and reachable only through the graph. The resource was filed against
-- the topics correctly; the topics were filed against nothing.
--
-- Where the resource's matched topics already agree on a subject, the
-- new ones join it. Agreement is the whole test: the subjects are read
-- off the topics this very resource linked to, so "mostly about Rust"
-- is a fact about the material rather than a guess about the title. A
-- resource matching nothing has no subjects to agree on and files
-- nothing, which is what leaves fertile ground fertile.
--
-- Deliberately not a similarity threshold of its own. The resolver has
-- already decided what counts as a match, at a bar that has been tuned
-- against real rows; a second, different number here would be a second
-- opinion about the same question, drifting from the first.
drop function if exists commit_ingestion(uuid, uuid, text, jsonb, jsonb);

create or replace function commit_ingestion(
  p_resource_id uuid,
  p_user_id uuid,
  p_summary text,
  p_new_topics jsonb,     -- [{title, slug, summary, embedding, state, relevance}]
  p_links jsonb           -- [{topic_id, relevance}]
)
returns table (out_id uuid, out_title text)
language plpgsql
as $$
declare
  t jsonb;
  new_id uuid;
  new_ids uuid[] := '{}';
  home_subjects uuid[];
begin
  update resources set summary = p_summary where resources.id = p_resource_id;

  for t in select * from jsonb_array_elements(p_new_topics) loop
    insert into topics (user_id, title, slug, summary, embedding, state, created_by)
    values (
      p_user_id,
      t->>'title',
      -- Slugs are unique per user; suffix collisions rather than failing
      -- the whole ingestion for one duplicate name.
      (t->>'slug') || '-' || substr(gen_random_uuid()::text, 1, 4),
      t->>'summary',
      (t->>'embedding')::vector,
      (t->>'state')::topic_state,
      'ai'
    )
    returning topics.id into new_id;

    insert into resource_topics (resource_id, topic_id, relevance)
    values (p_resource_id, new_id, (t->>'relevance')::numeric);

    -- A pending topic is one the resolver could not decide about. It
    -- must not be filed anywhere until that is settled, or adjudicating
    -- it later means unpicking a membership it was never meant to have.
    if (t->>'state')::topic_state = 'active' then
      new_ids := new_ids || new_id;
    end if;

    out_id := new_id;
    out_title := t->>'title';
    return next;
  end loop;

  insert into resource_topics (resource_id, topic_id, relevance)
  select p_resource_id, (l->>'topic_id')::uuid, (l->>'relevance')::numeric
  from jsonb_array_elements(p_links) l
  on conflict do nothing;

  -- Where did the topics this resource matched already live? Only
  -- matches count: a topic created a moment ago belongs to nothing yet,
  -- so including the new ones would be asking them where they live.
  select coalesce(array_agg(distinct ts.subject_id), '{}')
  into home_subjects
  from jsonb_array_elements(p_links) l
  join topic_subjects ts on ts.topic_id = (l->>'topic_id')::uuid;

  -- One subject, or several, and in both cases the new topics join all
  -- of them: membership is many-to-many by design, and a document
  -- spanning two subjects genuinely informs both. Nothing matched means
  -- an empty array and no filing at all.
  if array_length(new_ids, 1) > 0 and array_length(home_subjects, 1) > 0 then
    insert into topic_subjects (topic_id, subject_id, created_by)
    select n, s, 'ai'
    from unnest(new_ids) n
    cross join unnest(home_subjects) s
    on conflict do nothing;
  end if;
end;
$$;
