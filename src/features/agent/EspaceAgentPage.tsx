import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import logoMarque from "../../assets/logo-akweo-mark.png";
import { PolicesAkweo } from "../../components/layout/AuthLayout";
import {
  listerCodes,
  mesCommerces,
  mesCommissions,
  statistiquesPromotions,
  type CodePromo,
  type StatistiquesPromotions,
} from "../../services/promotionsService";
import { BoutonCopier, libelleReduction, lienPartage } from "../admin/OngletPromotions";

function f(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";
}

/** Espace de l'agent commercial : ses codes, ses commerces, ses commissions. */
export function EspaceAgentPage() {
  const { session, agent, utilisateur, chargement, deconnexion } = useAuth();
  const [codes, setCodes] = useState<CodePromo[]>([]);
  const [stats, setStats] = useState<StatistiquesPromotions | null>(null);
  const [commerces, setCommerces] = useState<Awaited<ReturnType<typeof mesCommerces>>>([]);
  const [commissions, setCommissions] = useState<Awaited<ReturnType<typeof mesCommissions>>>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    Promise.all([listerCodes(), statistiquesPromotions(), mesCommerces(), mesCommissions()])
      .then(([c, s, co, cm]) => {
        // Le super admin voit tous les codes : on ne garde que les siens.
        setCodes(c.filter((x) => x.agent_id === agent.id));
        setStats(s);
        setCommerces(co);
        setCommissions(cm);
      })
      .catch(() => setErreur("Impossible de charger tes données. Vérifie ta connexion."));
  }, [agent]);

  if (chargement) return <div className="min-h-screen flex items-center justify-center text-sm text-stone-400">Chargement...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!agent) return <Navigate to="/" replace />;

  const moi = stats?.agents.find((a) => a.agent_id === agent.id);
  const statCode = (id: string) => stats?.codes.find((c) => c.id === id);

  return (
    <div className="min-h-screen bg-stone-50 font-body">
      <PolicesAkweo />
      <header className="bg-navy text-stone-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoMarque} alt="Akweo" className="h-9 w-auto" />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-tight truncate">{agent.nom}</p>
              <p className="text-xs text-stone-400">Agent commercial · {Number(agent.taux_commission)} % de commission</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {utilisateur && (
              <Link to="/" className="text-xs text-stone-300 px-2 py-1.5 hover:text-white">
                Mon commerce
              </Link>
            )}
            <button onClick={deconnexion} className="p-2 text-stone-400 hover:text-white" aria-label="Se déconnecter">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {!agent.actif && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Ton compte d'agent est suspendu : tes codes ne fonctionnent plus. Contacte l'équipe Akweo.
          </p>
        )}
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="grid grid-cols-3 gap-3">
          {[
            ["Commerces apportés", String(moi?.commerces ?? 0)],
            ["À recevoir", f(moi?.commission_due ?? 0)],
            ["Déjà reçu", f(moi?.commission_payee ?? 0)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white border border-stone-200 rounded-xl p-3">
              <p className="text-[11px] text-stone-500">{l}</p>
              <p className="font-display text-xl sm:text-2xl font-bold tabular-nums text-stone-900">{v}</p>
            </div>
          ))}
        </div>

        <section>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-1">Mes codes promo</h2>
          <p className="text-sm text-stone-500 mb-3">
            Partage ton lien : le code est appliqué automatiquement quand le commerçant paie son abonnement.
          </p>
          <div className="space-y-3">
            {codes.map((c) => {
              const s = statCode(c.id);
              return (
                <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-2xl font-bold text-stone-900">{c.code}</p>
                      <p className="text-sm text-emerald-700 font-medium">
                        {libelleReduction(c)} pour le commerçant
                        {c.premier_paiement_seulement ? " · premier abonnement" : ""}
                      </p>
                    </div>
                    {!c.actif && <span className="text-xs bg-stone-100 text-stone-500 px-2 py-1 rounded">Désactivé</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-2">
                    {c.utilisations}
                    {c.max_utilisations ? ` / ${c.max_utilisations}` : ""} utilisation{c.utilisations > 1 ? "s" : ""} ·{" "}
                    {f(s?.chiffre_affaires ?? 0)} d'abonnements
                    {c.date_fin ? ` · valable jusqu'au ${new Date(c.date_fin + "T00:00:00").toLocaleDateString("fr-FR")}` : ""}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                    <code className="text-xs text-stone-600 truncate">{lienPartage(c.code)}</code>
                    <BoutonCopier texte={lienPartage(c.code)} />
                  </div>
                </div>
              );
            })}
            {codes.length === 0 && (
              <p className="bg-white border border-stone-200 rounded-xl p-5 text-center text-sm text-stone-400">
                Aucun code pour l'instant : l'équipe Akweo va t'en attribuer.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-3">Mes commerces</h2>
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {commerces.map((c, i) => {
              const actif = c.date_expiration ? c.date_expiration >= new Date().toISOString().slice(0, 10) : true;
              return (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{c.nom}</p>
                    <p className="text-xs text-stone-400">
                      {c.plan ?? "—"} · client depuis le {new Date(c.inscrit_le).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${actif ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {actif ? "Abonné" : "Expiré"}
                  </span>
                </div>
              );
            })}
            {commerces.length === 0 && <p className="p-5 text-center text-sm text-stone-400">Aucun commerce pour l'instant.</p>}
          </div>
          {commerces.some((c) => c.date_expiration && c.date_expiration < new Date().toISOString().slice(0, 10)) &&
            codes.some((c) => c.actif && !c.premier_paiement_seulement) && (
            <p className="text-xs text-stone-500 mt-2">
              Les commerces expirés sont une occasion de relance : un renouvellement avec ton code te rapporte une
              nouvelle commission.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-3">Mes commissions</h2>
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {commissions.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-stone-900 truncate">{c.entreprise}</p>
                  <p className="text-xs text-stone-400">
                    {new Date(c.created_at).toLocaleDateString("fr-FR")} · {Number(c.taux)} % de {f(c.montant_base)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{f(c.montant)}</p>
                  <p className={`text-[11px] font-medium ${c.statut === "payee" ? "text-emerald-700" : "text-amber-700"}`}>
                    {c.statut === "payee" ? "Payée" : "À recevoir"}
                  </p>
                </div>
              </div>
            ))}
            {commissions.length === 0 && <p className="p-5 text-center text-sm text-stone-400">Aucune commission pour l'instant.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
