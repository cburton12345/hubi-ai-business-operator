-- Verification only: the migration runner wraps files in BEGIN/COMMIT.
-- Build this index separately with the reviewed autocommit CONCURRENTLY procedure.
-- Never fall back to a blocking CREATE INDEX on the operational history table.
do $verification$
declare
  target_table oid := to_regclass('public.operator_timeline_events');
  target_index oid := to_regclass('public.operator_timeline_operational_stream_idx');
  state record;
begin
  if target_table is null or target_index is null then
    raise exception using errcode = '55000',
      message = 'Operational timeline index must be prepared before migration 282.',
      hint = 'Follow docs/OPERATIONAL_TIMELINE_INDEX_ROLLOUT.md; create the index CONCURRENTLY in autocommit mode.';
  end if;

  select indexes.*, classes.relkind, methods.amname, methods.oid as method_oid
    into state
    from pg_index indexes
    join pg_class classes on classes.oid = indexes.indexrelid
    join pg_am methods on methods.oid = classes.relam
    where indexes.indexrelid = target_index;

  if not found then
    raise exception using errcode = '55000', message = 'Operational timeline index name identifies a different relation.';
  end if;

  if (state.indrelid <> target_table or state.relkind <> 'i' or state.amname <> 'btree'
    or not state.indisvalid or not state.indisready or not state.indislive
    or state.indisunique or state.indisprimary
    or state.indnatts <> 4 or state.indnkeyatts <> 4
    or pg_get_indexdef(target_index, 1, false) <> 'tenant_id'
    or pg_get_indexdef(target_index, 2, false) <> 'event_type'
    -- PostgreSQL 17 and 18 emit this exact canonical form. Compare it verbatim:
    -- normalizing whitespace or parentheses globally would also mutate quoted JSON keys.
    or pg_get_indexdef(target_index, 3, false)
       <> '((metadata_json ->> ''operationalStreamKey''::text))'
    or pg_get_indexdef(target_index, 4, false) <> 'occurred_at'
    or state.indoption[0] <> 0 or state.indoption[1] <> 0
    or state.indoption[2] <> 0 or state.indoption[3] <> 3
    or state.indclass[0] <> (select oid from pg_opclass where opcmethod=state.method_oid and opcintype='uuid'::regtype and opcdefault)
    or state.indclass[1] <> (select oid from pg_opclass where opcmethod=state.method_oid and opcintype='text'::regtype and opcdefault)
    or state.indclass[2] <> (select oid from pg_opclass where opcmethod=state.method_oid and opcintype='text'::regtype and opcdefault)
    or state.indclass[3] <> (select oid from pg_opclass where opcmethod=state.method_oid and opcintype='timestamptz'::regtype and opcdefault)
    or state.indcollation[0] <> 0 or state.indcollation[3] <> 0
    or state.indcollation[1] <> (select attcollation from pg_attribute where attrelid=target_table and attname='event_type' and not attisdropped)
    or state.indcollation[2] <> 'pg_catalog."default"'::regcollation
    or coalesce(pg_get_expr(state.indpred, target_table, false), '')
       <> '((metadata_json ->> ''operationalStreamKey''::text) IS NOT NULL)') is distinct from false
  then
    raise exception using errcode = '55000',
      message = 'Operational timeline index is invalid, unfinished, or has a different definition.',
      hint = 'Inspect pg_index and active index builds. Do not rely on IF NOT EXISTS or automatically drop an unfamiliar index.';
  end if;
end
$verification$;
