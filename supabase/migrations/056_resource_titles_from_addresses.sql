-- Resources titled by their own address get a title a reader can take in.
--
-- Saving a link made the resource with the link as its title, and the
-- title the page itself carried -- which ingestion reads -- was never
-- written back. So every article kept its full address as its name, a
-- single word as long as the URL, printed on every sheet that lists
-- material and pushing each of them off the side of a phone in turn.
--
-- The app now writes the page's own title when it reads one, and starts
-- a new link with a readable stand-in rather than the raw address. This
-- gives the ones already saved the same stand-in: the site and the last
-- part of the path, `archive.vcu.edu/…/selfreliance.html`. The page's
-- real title replaces it the next time the resource is opened.
--
-- The shortening is `core/titles.urlTitle`, the same sixty-character
-- rule, checked against it. Only a title that is exactly the resource's
-- own address is touched: anything somebody typed stands.
--
-- Safe to run twice: after the first pass no title equals its address.

create or replace function resource_url_title(address text)
returns text
language sql
immutable
as $$
  with bare as (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(btrim(address), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
                 '^www\.', '', 'i'),
               '[?#].*$', ''),
             '/+$', '') as v
  ), parts as (
    select v,
           strpos(v, '/') as slash,
           split_part(v, '/', 1) || '/…/' || regexp_replace(v, '^.*/', '') as short
    from bare
  )
  select case
    when char_length(v) <= 60 then v
    when slash = 0 then left(v, 59) || '…'
    when char_length(short) <= 60 then short
    else left(short, 59) || '…'
  end
  from parts
$$;

update resources
set title = resource_url_title(url)
where url is not null
  and title = url;
