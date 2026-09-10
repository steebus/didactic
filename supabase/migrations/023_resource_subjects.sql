-- Sow-time evidence belongs to the subject, not to every topic in it.
--
-- A book or course named while sowing a subject is about the whole
-- subject, not any one topic in it. It was being filed against every
-- topic in the bed at once, so a twenty-topic bed printed the same
-- resource on all twenty sheets. It is filed against the subject now,
-- and the reader files it onto the particular topics it informs by hand.
--
-- This mirrors topic_subjects: a plain join with a relevance and a
-- provenance, owned through the resource and subject rows rather than by
-- its own RLS, like every other join in this schema.
create table resource_subjects (
  resource_id uuid not null references resources(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  relevance numeric(3,2) not null default 0.3,
  created_by created_by_kind not null default 'ai',
  created_at timestamptz not null default now(),
  primary key (resource_id, subject_id)
);

create index resource_subjects_subject_idx on resource_subjects (subject_id);
