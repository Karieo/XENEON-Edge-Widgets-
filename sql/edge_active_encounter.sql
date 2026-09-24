-- ═══════════════════════════════════════════════════════════════
-- EDGE ACTIVE ENCOUNTER — read-only feed for the STRATUM DM widget
--
-- The Xeneon Edge widget only has the public anon key (it ships in
-- DATACORE's JS bundle anyway). DATACORE's tables are scoped to
-- authenticated users, so the widget can't read `encounters` directly,
-- and granting anon SELECT on the table would expose hidden enemies and
-- their exact HP to anyone holding that key.
--
-- This function returns ONLY the newest active encounter, with hidden
-- enemies removed (PCs always included). Nothing else in the database
-- becomes readable. It runs as its owner (SECURITY DEFINER) so it can
-- see the table, and anon can only EXECUTE it.
--
-- What anon CAN see through it: encounter name, round, and each visible
-- combatant's name, initiative, HP, and conditions — the same things
-- players see on the table-facing tracker.
--
-- Changes nothing else: no table policies are added or altered.
-- Safe to re-run. Run in the Supabase SQL editor for DATACORE's project.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.edge_active_encounter()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id',         e.id,
    'name',       e.name,
    'round',      e.round,
    'updated_at', e.updated_at,
    'combatants', COALESCE((
      SELECT json_agg(c)
      FROM jsonb_array_elements(e.combatants::jsonb) AS c
      WHERE c->>'type' = 'pc'
         OR COALESCE((c->>'hidden')::boolean, false) = false
    ), '[]'::json)
  )
  FROM encounters e
  WHERE e.active
  ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.edge_active_encounter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edge_active_encounter() TO anon, authenticated;

-- ── Check it (optional) ────────────────────────────────────────
-- Run this afterward. With a fight active you should see its JSON;
-- with none, NULL. Hidden enemies should not appear.
--
--   SELECT public.edge_active_encounter();
--
-- ── Undo (if ever needed) ──────────────────────────────────────
--
--   DROP FUNCTION IF EXISTS public.edge_active_encounter();
