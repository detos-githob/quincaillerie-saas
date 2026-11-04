-- =====================================================================
-- CONTRÔLE DE SÉCURITÉ — à lancer dans Supabase › SQL Editor
-- après CHAQUE migration. Ne modifie rien.
-- Résultat attendu : « Success. No rows returned ».
-- Chaque ligne renvoyée = une protection manquante (colonne « faille »).
-- =====================================================================
select 'Fonction appelable sans contrôle d''identité' as faille, p.oid::regprocedure::text as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('authenticated', p.oid, 'execute')
  and p.prosrc !~* '(auth\.uid|verifier_acces_entreprise|est_super_admin|exiger_super_admin|entreprise_de_l_utilisateur_connecte|_interne_|agent_connecte)'
union all
select 'Colonne sensible modifiable par un utilisateur', table_name || '.' || column_name
from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
  and ((table_name = 'entreprises' and column_name in ('plan_abonnement','periodicite_abonnement','date_expiration_abonnement','actif','agent_id'))
    or (table_name = 'utilisateurs' and column_name in ('role','entreprise_id','auth_user_id','actif')))
union all
select 'Table sans sécurité par ligne', c.relname::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Pièce comptable modifiable directement', table_name || ' (' || privilege_type || ')'
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE')
  and table_name in ('ventes','lignes_vente','factures','avoirs','lignes_avoir','mouvements_stock','mouvements_creance',
                     'paiements','paiements_personnel','cotisations_tontine','mouvements_consigne','casses','clotures')
union all
select 'Contrôle des écritures absent', t
from unnest(array['ventes','avoirs','mouvements_stock','paiements','paiements_personnel','depenses','cotisations_tontine',
                  'tontines','articles','clients','fournisseurs','commandes_fournisseur','inventaires']) t
where not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'trg_controler_ecriture')
union all
select 'Contrôle des prix de vente absent', 'lignes_vente'
where not exists (select 1 from pg_trigger g where g.tgrelid = 'public.lignes_vente'::regclass and g.tgname = 'trg_controler_ligne_vente')
union all
select 'Super admin sans double authentification', 'est_super_admin()'
where not exists (select 1 from pg_proc where proname = 'est_super_admin' and prosrc ~ 'aal2');
