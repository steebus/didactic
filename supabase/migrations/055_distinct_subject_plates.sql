-- Give subjects that share a plate plates of their own.
--
-- A subject's plate is its identity on the bed and the stock list. Every
-- path that made a subject took `plates[count % 6]`, which collides as
-- soon as one is thrown away -- the count goes down, the colours in use
-- do not -- and sowing and promoting held the six in different orders
-- besides. So beds came to share an ink, and the graph drew three
-- subjects in one mustard. New subjects now take the least used plate
-- (`core/plates.nextPlate`); this puts right the ones already made.
--
-- The rule is `core/plates.balancePlates`, walked per owner, oldest
-- subject first, and the two are checked against each other. An owner
-- whose plates are already as even as the count allows is left exactly
-- as they are. Otherwise the oldest subject in each plate keeps it -- so
-- a subject with a plate of its own is never touched -- and each later
-- one sharing a plate keeps it unless that plate is used more than the
-- least used, in which case it takes the least used, earliest in the
-- palette's order on a tie. Colours outside the six are left alone.
--
-- Safe to run twice: every placement goes to a least used plate, so the
-- walk ends as even as the count allows, which is the state the first
-- test leaves alone.

do $$
declare
  palette constant text[] := array['#2f5233', '#b8482a', '#c8871a', '#2a4a7c', '#6b3550', '#6b7233'];
  owner uuid;
  s record;
  tally int[];
  uses int[];
  held uuid[];
  i int;
  mine int;
  lowest int;
begin
  for owner in select distinct user_id from subjects loop
    tally := array[0, 0, 0, 0, 0, 0];
    uses := array[0, 0, 0, 0, 0, 0];
    held := array[null, null, null, null, null, null]::uuid[];

    for s in
      select id, lower(colour) as colour from subjects
      where user_id = owner
      order by created_at, id
    loop
      mine := array_position(palette, s.colour);
      continue when mine is null;
      tally[mine] := tally[mine] + 1;
      if held[mine] is null then
        held[mine] := s.id;
        uses[mine] := 1;
      end if;
    end loop;

    -- Already as even as the count allows: nothing to put right.
    continue when (select max(x) - min(x) from unnest(tally) as x) <= 1;

    for s in
      select id, lower(colour) as colour from subjects
      where user_id = owner
      order by created_at, id
    loop
      mine := array_position(palette, s.colour);
      continue when mine is null or held[mine] = s.id;

      lowest := 1;
      for i in 2..6 loop
        if uses[i] < uses[lowest] then lowest := i; end if;
      end loop;

      if uses[mine] > uses[lowest] then
        update subjects set colour = palette[lowest] where id = s.id;
        mine := lowest;
      end if;
      uses[mine] := uses[mine] + 1;
    end loop;
  end loop;
end;
$$;
