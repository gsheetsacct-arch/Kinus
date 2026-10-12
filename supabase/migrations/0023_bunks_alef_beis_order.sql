-- =============================================================================
-- Kinus — 0023: puts the bunks that are already there in Alef-Beis order (Alef, Beis …
-- Tes, Yud, Yud Alef … Chof …), once, the same way the app orders new ones
-- (lib/bunk-order.ts). Only divisions with at least two bunks named with Hebrew letters.
-- =============================================================================
create or replace function bunk_letter_value(token text) returns int
language sql immutable as $$
  select case lower(token)
    when 'alef' then 1 when 'aleph' then 1 when 'olef' then 1 when 'aluf' then 1
    when 'beis' then 2 when 'bais' then 2 when 'bet' then 2 when 'beth' then 2 when 'beit' then 2 when 'bes' then 2 when 'beys' then 2 when 'vet' then 2 when 'veis' then 2
    when 'gimmel' then 3 when 'gimel' then 3 when 'gimmal' then 3 when 'gimal' then 3
    when 'daled' then 4 when 'dalet' then 4 when 'daleth' then 4 when 'doled' then 4
    when 'hei' then 5 when 'hey' then 5 when 'heh' then 5 when 'hay' then 5 when 'hai' then 5
    when 'vav' then 6 when 'vov' then 6 when 'waw' then 6 when 'vuv' then 6 when 'vaw' then 6
    when 'zayin' then 7 when 'zayen' then 7 when 'zain' then 7 when 'zayn' then 7
    when 'ches' then 8 when 'chet' then 8 when 'cheth' then 8 when 'het' then 8 when 'heth' then 8 when 'khet' then 8 when 'chess' then 8
    when 'tes' then 9 when 'tet' then 9 when 'teth' then 9 when 'tess' then 9
    when 'yud' then 10 when 'yod' then 10 when 'yood' then 10 when 'jod' then 10
    when 'chof' then 20 when 'kaf' then 20 when 'kof' then 20 when 'caf' then 20 when 'khaf' then 20 when 'chaf' then 20 when 'kaph' then 20
    when 'lamed' then 30 when 'lamud' then 30 when 'lamid' then 30 when 'lammed' then 30
    when 'mem' then 40
    when 'nun' then 50 when 'noon' then 50
    when 'samech' then 60 when 'samach' then 60 when 'samekh' then 60 when 'samek' then 60
    when 'ayin' then 70 when 'ayen' then 70 when 'ain' then 70
    when 'pei' then 80 when 'pey' then 80 when 'peh' then 80 when 'fei' then 80 when 'fey' then 80 when 'feh' then 80
    when 'tzadi' then 90 when 'tzadik' then 90 when 'tsadi' then 90 when 'tsadik' then 90 when 'tzaddik' then 90 when 'tzadee' then 90 when 'tzadie' then 90
    when 'kuf' then 100 when 'qof' then 100 when 'kuph' then 100 when 'koof' then 100 when 'qoph' then 100
    when 'reish' then 200 when 'resh' then 200 when 'raish' then 200 when 'reysh' then 200
    when 'shin' then 300 when 'sin' then 300
    when 'tav' then 400 when 'taf' then 400 when 'tof' then 400 when 'sav' then 400 when 'sof' then 400 when 'tau' then 400
    else case when token ~ '^[א-ת]{1,3}$' then (
      select sum(case ch when 'א' then 1 when 'ב' then 2 when 'ג' then 3 when 'ד' then 4 when 'ה' then 5 when 'ו' then 6 when 'ז' then 7 when 'ח' then 8 when 'ט' then 9 when 'י' then 10
        when 'כ' then 20 when 'ך' then 20 when 'ל' then 30 when 'מ' then 40 when 'ם' then 40 when 'נ' then 50 when 'ן' then 50 when 'ס' then 60 when 'ע' then 70 when 'פ' then 80 when 'ף' then 80
        when 'צ' then 90 when 'ץ' then 90 when 'ק' then 100 when 'ר' then 200 when 'ש' then 300 when 'ת' then 400 end)::int
      from regexp_split_to_table(token, '') ch) end
  end
$$;

-- "Bunk Yud Alef" → ("bunk", 11, ""): the words before the letters, their number, the rest
create or replace function bunk_sort_parts(name text, out before text, out val int, out after text)
language plpgsql immutable as $$
declare
  t text[] := array_remove(regexp_split_to_array(lower(name), '[[:space:]\-_/.,:''"`״׳()]+'), '');
  i int; s int := null; e int;
begin
  for i in 1 .. coalesce(array_length(t, 1), 0) loop
    if bunk_letter_value(t[i]) is not null then s := i; exit; end if;
  end loop;
  if s is null then before := array_to_string(t, ' '); val := null; after := ''; return; end if;
  e := s; val := 0;
  while e <= array_length(t, 1) and bunk_letter_value(t[e]) is not null loop
    val := val + bunk_letter_value(t[e]); e := e + 1;
  end loop;
  before := array_to_string(t[1:s-1], ' ');
  after := array_to_string(t[e:], ' ');
end $$;

with parts as (
  select b.id, b.division_id, b.name, p.before, p.val, p.after
  from bunks b, lateral bunk_sort_parts(b.name) p
), lettered as (
  select division_id from parts where val is not null group by division_id having count(*) >= 2
), ranked as (
  select id, row_number() over (partition by division_id order by before, val nulls last, after, name) as n
  from parts where division_id in (select division_id from lettered)
)
update bunks b set sort_order = r.n from ranked r where r.id = b.id and b.sort_order is distinct from r.n;
