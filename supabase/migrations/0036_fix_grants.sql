-- The Way: lock three internal calls to the service role only (found by a check of 0033). Needs 0030 to 0035. Safe to run twice.
-- The archiver (the worker) calls the checker_thread_* functions through the public key plus its checker key, so those stay
-- callable by that key and are guarded by the checker key inside each function. These three are different: only our own Edge
-- Functions call them, with the service role, so nobody else should be able to call them at all:
--   checker_thread_ocr_ok(text,bigint,text)         (used by thread-shot before it hands over a screenshot)
--   checker_thread_image_due_ok(text,bigint,text)   (used by thread-shot before it deletes a picture)
--   checker_thread_image_deleted(text,bigint,text)  (used by thread-shot after it deleted a picture)

do $guard$
begin
  if to_regprocedure('public.checker_thread_ocr_ok(text,bigint,text)') is null or to_regprocedure('public.checker_thread_image_due_ok(text,bigint,text)') is null
     or to_regprocedure('public.checker_thread_image_deleted(text,bigint,text)') is null then
    raise exception 'Stop: run 0030 to 0035 first';
  end if;
end $guard$;

revoke all on function public.checker_thread_ocr_ok(text,bigint,text), public.checker_thread_image_due_ok(text,bigint,text),
  public.checker_thread_image_deleted(text,bigint,text) from public, anon, authenticated;
grant execute on function public.checker_thread_ocr_ok(text,bigint,text), public.checker_thread_image_due_ok(text,bigint,text),
  public.checker_thread_image_deleted(text,bigint,text) to service_role;

-- And one the other way round: the new-request list (0034) was granted to the service role only, but the archiver calls it with
-- its checker key like all its other calls, so it must be callable that way (the key is checked inside the function).
revoke all on function public.checker_thread_new(text,bigint,int) from public;
grant execute on function public.checker_thread_new(text,bigint,int) to anon, authenticated;

-- Check: every row must say ok.
select p.oid::regprocedure::text as function_name,
       case
         when p.proname in ('checker_thread_ocr_ok','checker_thread_image_due_ok','checker_thread_image_deleted') then
           case when has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
                 and not has_function_privilege('authenticated', p.oid, 'execute') then 'ok: service role only' else 'WRONG: still open' end
         else
           case when has_function_privilege('anon', p.oid, 'execute') then 'ok: archiver key can call it (guarded by the checker key)' else 'CHECK: the archiver cannot call it' end
       end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'checker\_thread\_%'
 order by 1;
