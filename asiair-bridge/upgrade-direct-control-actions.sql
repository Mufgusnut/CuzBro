do $$
begin
  alter table public.asiair_commands drop constraint if exists asiair_commands_action_check;
  alter table public.asiair_commands add constraint asiair_commands_action_check
    check (action in (
      'capture', 'capture_preview', 'start_autorun', 'stop_capture',
      'set_mode', 'set_gain', 'set_exposure', 'configure_autorun',
      'plate_solve', 'toggle_continuous_preview'
    ));
end $$;
notify pgrst, 'reload schema';
