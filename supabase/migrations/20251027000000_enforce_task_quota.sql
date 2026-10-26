-- =====================================================================
-- Quota de demandes actives selon la formule souscrite
-- Corrige le trou C-1 de l'audit : la limite annoncée n'était appliquée
-- nulle part, un compte gratuit pouvait créer un nombre illimité de tâches.
-- =====================================================================

-- Nombre de demandes actives autorisées pour un utilisateur.
-- Une demande est « active » tant qu'elle n'est pas au statut « Terminé ».
CREATE OR REPLACE FUNCTION public.plan_task_limit(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Administrateur : pas de limite pratique
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user AND role = 'admin'
    ) THEN 1000

    -- Abonnement actif (Pro ou Business) : illimité en pratique
    WHEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p_user
        AND s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ) THEN 1000

    -- Formule gratuite : 1 demande active à la fois
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.plan_task_limit(uuid) IS
  'Nombre de demandes actives autorisées : 1 en gratuit, illimité avec abonnement actif.';

-- Trigger : refuse l'insertion au-delà du quota
CREATE OR REPLACE FUNCTION public.enforce_task_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
  max_allowed  integer;
BEGIN
  SELECT count(*) INTO active_count
  FROM public.tasks
  WHERE client_id = NEW.client_id
    AND status <> 'Terminé';

  max_allowed := public.plan_task_limit(NEW.client_id);

  IF active_count >= max_allowed THEN
    RAISE EXCEPTION
      'Limite de demandes actives atteinte pour votre formule (% maximum). Terminez une demande ou passez à une formule superieure.',
      max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_task_quota() IS
  'Bloque la creation d une demande quand le quota de la formule est atteint.';

DROP TRIGGER IF EXISTS tasks_quota_check ON public.tasks;

CREATE TRIGGER tasks_quota_check
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_quota();
