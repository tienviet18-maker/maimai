-- MaiMai: size limits on free-text / jsonb columns (security hardening 2026-10-22).
-- Anonymous users can write to their own rows; these CHECK constraints stop a
-- single row from growing without bound. RLS policies are unchanged.
--
-- Safe to re-run: each constraint is added only if it does not exist yet.
-- Added NOT VALID so existing rows never block the migration; new inserts and
-- updates are checked immediately. After checking no old row is too large, run:
--   alter table public.users              validate constraint users_display_name_len;
--   alter table public.cycle_logs         validate constraint cycle_logs_notes_len;
--   alter table public.cycle_logs         validate constraint cycle_logs_symptoms_size;
--   alter table public.notification_logs  validate constraint notification_logs_title_len;
--   alter table public.notification_logs  validate constraint notification_logs_slot_id_len;
--   alter table public.notification_logs  validate constraint notification_logs_tone_len;
--   alter table public.notification_logs  validate constraint notification_logs_context_mode_len;
-- Caps must stay in line with the client (www/js/supabase/supabaseService.js,
-- MAX_DISPLAY_NAME_LEN).

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('public.users',             'users_display_name_len',             'display_name is null or char_length(display_name) <= 100'),
      ('public.cycle_logs',        'cycle_logs_notes_len',               'notes is null or char_length(notes) <= 2000'),
      ('public.cycle_logs',        'cycle_logs_symptoms_size',           'pg_column_size(symptoms) < 4096'),
      ('public.notification_logs', 'notification_logs_title_len',        'title is null or char_length(title) <= 200'),
      ('public.notification_logs', 'notification_logs_slot_id_len',      'slot_id is null or char_length(slot_id) <= 64'),
      ('public.notification_logs', 'notification_logs_tone_len',         'tone is null or char_length(tone) <= 64'),
      ('public.notification_logs', 'notification_logs_context_mode_len', 'context_mode is null or char_length(context_mode) <= 64')
    ) as t(tbl, name, expr)
  loop
    if to_regclass(c.tbl) is not null and not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = to_regclass(c.tbl)
    ) then
      execute format('alter table %s add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;
