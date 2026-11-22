CREATE OR REPLACE FUNCTION public.is_tuntas_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT COALESCE(
    auth.uid() = 'b6521de4-d0f7-442f-a0cc-89bd26dc9729'::uuid
    AND lower(COALESCE(auth.jwt() ->> 'email', '')) = 'zeynn.belajar@gmail.com',
    FALSE
  );
$function$;

REVOKE ALL ON FUNCTION public.is_tuntas_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tuntas_admin() TO authenticated;
