-- A read resource's new topics are filed where a reading of their
-- descriptions puts them, and a linked topic with no description gets
-- the one this reading wrote.
--
-- `039` filed new topics into whatever subjects the resource's matches
-- already sat in. That is right when something matched, and files
-- nothing when nothing did: a resource whose concepts' names were not
-- close enough to any topic on the map left every one of them loose,
-- however plainly they belonged to a subject already there. And where
-- something did match, every new topic joined every subject the matches
-- touched, whether it belonged there or not.
--
-- Ingestion now reads each concept's description against the subjects
-- (`lib/llm/overlap.ts`) and sends, per new topic, the subjects it
-- belongs under as `subject_ids`. Three cases, and the difference
-- between the last two is the point:
--
--   subject_ids: [a, b]   filed under those subjects
--   subject_ids: []       read, and stands alone: filed nowhere
--   no subject_ids key    not read (out of time, or the call failed):
--                         `039`'s agreement rule, exactly as before
--
-- Only the owner's own subjects are accepted, and a pending topic is
-- still filed nowhere, for `039`'s reason.
--
-- The signature is unchanged, which is what makes the deploy safe in
-- either order: the web sending `subject_ids` to the old function has
-- them ignored and gets `039`; the old web calling this one sends no
-- key and gets `039`.
drop function if exists commit_ingestion(uuid, uuid, text, jsonb, jsonb);

create or replace function commit_ingestion(
  p_resource_id uuid,
  p_user_id uuid,
  p_summary text,
  p_new_topics jsonb,     -- [{title, slug, summary, embedding, state, relevance, subject_ids?}]
  p_links jsonb           -- [{topic_id, relevance, summary?}]
)
returns table (out_id uuid, out_title text)
language plpgsql
as $$
declare
  t jsonb;
  new_id uuid;
  unread_ids uuid[] := '{}';
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
      nullif(btrim(t->>'summary'), ''),
      (t->>'embedding')::vector,
      (t->>'state')::topic_state,
      'ai'
    )
    returning topics.id into new_id;

    insert into resource_topics (resource_id, topic_id, relevance)
    values (p_resource_id, new_id, (t->>'relevance')::numeric);

    -- A pending topic is one the resolver could not decide about. It
    -- must not be filed anywhere until that is settled.
    if (t->>'state')::topic_state = 'active' then
      if jsonb_typeof(t->'subject_ids') = 'array' then
        insert into topic_subjects (topic_id, subject_id, created_by)
        select new_id, s.id, 'ai'
        from jsonb_array_elements_text(t->'subject_ids') sid
        join subjects s on s.id::text = sid and s.user_id = p_user_id
        on conflict do nothing;
      else
        unread_ids := unread_ids || new_id;
      end if;
    end if;

    out_id := new_id;
    out_title := t->>'title';
    return next;
  end loop;

  insert into resource_topics (resource_id, topic_id, relevance)
  select p_resource_id, (l->>'topic_id')::uuid, (l->>'relevance')::numeric
  from jsonb_array_elements(p_links) l
  on conflict do nothing;

  -- A topic this resource matched, still with no description, takes the
  -- one this reading wrote. Never over one already there: a description
  -- somebody wrote, or an earlier reading, stands.
  update topics tp
  set summary = nullif(btrim(l->>'summary'), '')
  from jsonb_array_elements(p_links) l
  where tp.id = (l->>'topic_id')::uuid
    and tp.user_id = p_user_id
    and (tp.summary is null or btrim(tp.summary) = '')
    and nullif(btrim(l->>'summary'), '') is not null;

  -- `039`'s agreement rule, for the topics nobody read: the subjects the
  -- resource's own matches already sit in.
  if array_length(unread_ids, 1) > 0 then
    select coalesce(array_agg(distinct ts.subject_id), '{}')
    into home_subjects
    from jsonb_array_elements(p_links) l
    join topic_subjects ts on ts.topic_id = (l->>'topic_id')::uuid;

    if array_length(home_subjects, 1) > 0 then
      insert into topic_subjects (topic_id, subject_id, created_by)
      select n, s, 'ai'
      from unnest(unread_ids) n
      cross join unnest(home_subjects) s
      on conflict do nothing;
    end if;
  end if;
end;
$$;
