import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import {
  creerAgent,
  enregistrerCode,
  listerAgents,
  listerCodes,
  modifierAgent,
  statistiquesPromotions,
  type AgentCommercial,
  type CodePromo,
  type StatistiquesPromotions,
} from "../../services/promotionsService";
import { listerToutesLesOffres, type OffreAbonnement } from "../../services/offresService";
import { CARACTERE_SPECIAL } from "../../lib/security";

function f(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";
}

export function libelleReduction(c: Pick<CodePromo, "type_reduction" | "valeur">): string {
  return c.type_reduction === "pourcentage" ? `-${Number(c.valeur)} %` : `-${f(c.valeur)}`;
}

export function lienPartage(code: string): string {
  return `${window.location.origin}/?code=${encodeURIComponent(code)}`;
}

export function BoutonCopier({ texte, libelle = "Copier le lien" }: { texte: string; libelle?: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setCopie(true);
          setTimeout(() => setCopie(false), 1800);
        } catch {
          window.prompt("Copie ce lien :", texte);
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700 hover:text-amber-800"
    >
      {copie ? <Check size={13} /> : <Copy size={13} />}
      {copie ? "Copié" : libelle}
    </button>
  );
}

export function OngletPromotions() {
  const [agents, setAgents] = useState<AgentCommercial[] | null>(null);
  const [codes, setCodes] = useState<CodePromo[]>([]);
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [stats, setStats] = useState<StatistiquesPromotions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [agentEdite, setAgentEdite] = useState<AgentCommercial | "nouveau" | null>(null);
  const [codeEdite, setCodeEdite] = useState<CodePromo | "nouveau" | null>(null);

  async function charger() {
    try {
      const [a, c, o, s] = await Promise.all([listerAgents(), listerCodes(), listerToutesLesOffres(), statistiquesPromotions()]);
      setAgents(a);
      setCodes(c);
      setOffres(o);
      setStats(s);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }
  useEffect(() => {
    charger();
  }, []);

  const statAgent = (id: string) => stats?.agents.find((x) => x.agent_id === id);
  const statCode = (id: string) => stats?.codes.find((x) => x.id === id);
  const nomAgent = useMemo(() => new Map((agents ?? []).map((a) => [a.id, a.nom])), [agents]);

  if (erreur) return <p className="text-sm text-red-600">{erreur}</p>;
  if (!agents) return <p className="text-sm text-stone-400">Chargement...</p>;

  return (
    <div className="space-y-8">
      {/* ---------------- AGENTS ---------------- */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900">Agents commerciaux</h2>
            <p className="text-sm text-stone-500">Chaque agent se connecte pour suivre ses codes, ses clients et ses commissions.</p>
          </div>
          <button
            onClick={() => setAgentEdite("nouveau")}
            className="shrink-0 flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <Plus size={16} /> Nouvel agent
          </button>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {agents.map((a) => {
            const s = statAgent(a.id);
            return (
              <button key={a.id} onClick={() => setAgentEdite(a)} className="w-full text-left px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${a.actif ? "text-stone-900" : "text-stone-400 line-through"}`}>{a.nom}</p>
                  <p className="text-xs text-stone-400 truncate">
                    {a.email} · commission {Number(a.taux_commission)} % · {s?.commerces ?? 0} commerce{(s?.commerces ?? 0) > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-stone-900">{f(s?.commission_due ?? 0)}</p>
                  <p className="text-[11px] text-stone-400">à payer</p>
                </div>
              </button>
            );
          })}
          {agents.length === 0 && <p className="p-5 text-center text-sm text-stone-400">Aucun agent pour l'instant.</p>}
        </div>
      </section>

      {/* ---------------- CODES ---------------- */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900">Codes promo</h2>
            <p className="text-sm text-stone-500">Réduction en % ou en francs, appliquée et vérifiée par le serveur au paiement.</p>
          </div>
          <button
            onClick={() => setCodeEdite("nouveau")}
            className="shrink-0 flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <Plus size={16} /> Nouveau code
          </button>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {codes.map((c) => {
            const s = statCode(c.id);
            const expire = c.date_fin && c.date_fin < new Date().toISOString().slice(0, 10);
            const epuise = c.max_utilisations !== null && c.utilisations >= c.max_utilisations;
            return (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <button onClick={() => setCodeEdite(c)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-mono font-semibold text-stone-900 flex items-center gap-2 flex-wrap">
                    {c.code}
                    <span className="font-sans text-xs font-medium text-emerald-700">{libelleReduction(c)}</span>
                    {(!c.actif || expire || epuise) && (
                      <span className="font-sans text-[11px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                        {!c.actif ? "Désactivé" : expire ? "Expiré" : "Épuisé"}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-400 truncate">
                    {c.agent_id ? nomAgent.get(c.agent_id) ?? "Agent" : "Sans agent"} · {c.utilisations}
                    {c.max_utilisations ? `/${c.max_utilisations}` : ""} utilisation{c.utilisations > 1 ? "s" : ""} ·{" "}
                    {f(s?.chiffre_affaires ?? 0)} encaissés
                    {c.date_fin ? ` · jusqu'au ${new Date(c.date_fin + "T00:00:00").toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </button>
                <BoutonCopier texte={lienPartage(c.code)} />
              </div>
            );
          })}
          {codes.length === 0 && <p className="p-5 text-center text-sm text-stone-400">Aucun code pour l'instant.</p>}
        </div>
      </section>

      {agentEdite && (
        <ModaleAgent
          agent={agentEdite === "nouveau" ? null : agentEdite}
          onFerme={() => setAgentEdite(null)}
          onEnregistre={async () => {
            setAgentEdite(null);
            await charger();
          }}
        />
      )}
      {codeEdite && (
        <ModaleCode
          code={codeEdite === "nouveau" ? null : codeEdite}
          agents={agents.filter((a) => a.actif || (codeEdite !== "nouveau" && a.id === codeEdite.agent_id))}
          offres={offres.filter((o) => !o.est_essai)}
          onFerme={() => setCodeEdite(null)}
          onEnregistre={async () => {
            setCodeEdite(null);
            await charger();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function motDePasseAleatoire(): string {
  const groupes = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?-"];
  const tirage = (chaine: string) => chaine[crypto.getRandomValues(new Uint32Array(1))[0] % chaine.length];
  const caracteres = groupes.map(tirage);
  const tous = groupes.join("");
  while (caracteres.length < 14) caracteres.push(tirage(tous));
  // Mélange
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

function ModaleAgent({
  agent,
  onFerme,
  onEnregistre,
}: {
  agent: AgentCommercial | null;
  onFerme: () => void;
  onEnregistre: () => Promise<void>;
}) {
  const nouveau = !agent;
  const [nom, setNom] = useState(agent?.nom ?? "");
  const [email, setEmail] = useState(agent?.email ?? "");
  const [telephone, setTelephone] = useState(agent?.telephone ?? "");
  const [taux, setTaux] = useState(String(agent?.taux_commission ?? 10));
  const [actif, setActif] = useState(agent?.actif ?? true);
  const [motDePasse, setMotDePasse] = useState(nouveau ? motDePasseAleatoire() : "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cree, setCree] = useState(false);

  const champ = "w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm";
  const motDePasseValide =
    motDePasse.length >= 12 && /[A-Z]/.test(motDePasse) && /[a-z]/.test(motDePasse) && /[0-9]/.test(motDePasse) && CARACTERE_SPECIAL.test(motDePasse);

  async function enregistrer() {
    setErreur(null);
    setEnCours(true);
    try {
      if (nouveau) {
        await creerAgent({ nom: nom.trim(), email: email.trim(), telephone: telephone.trim(), motDePasse, tauxCommission: Number(taux) });
        setCree(true);
      } else {
        await modifierAgent({ id: agent!.id, nom: nom.trim(), telephone: telephone.trim(), taux_commission: Number(taux), actif });
        await onEnregistre();
      }
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  const identifiants = `Espace agent Akweo\nAdresse : ${window.location.origin}/login\nEmail : ${email.trim()}\nMot de passe : ${motDePasse}\n\nChange ton mot de passe avec « Mot de passe oublié » dès ta première connexion.`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={cree ? onEnregistre : onFerme} />
      <div className="relative bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-stone-900">{nouveau ? "Nouvel agent" : agent!.nom}</h2>
          <button onClick={cree ? onEnregistre : onFerme} className="p-1 text-stone-400" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        {cree ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Compte créé. Transmets ces identifiants à l'agent par un canal privé : le mot de passe ne sera plus affiché.
            </p>
            <pre className="text-xs bg-stone-50 border border-stone-200 rounded-lg p-3 whitespace-pre-wrap font-mono">{identifiants}</pre>
            <div className="flex justify-between items-center">
              <BoutonCopier texte={identifiants} libelle="Copier les identifiants" />
              <button onClick={onEnregistre} className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-lg">
                Terminé
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="text-xs font-medium text-stone-500">Nom complet</span>
              <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} className={champ} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-500">Email de connexion {nouveau ? "" : "(non modifiable)"}</span>
              <input type="email" value={email} disabled={!nouveau} onChange={(e) => setEmail(e.target.value)} className={`${champ} disabled:bg-stone-50 disabled:text-stone-500`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs font-medium text-stone-500">Téléphone</span>
                <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className={champ} />
              </label>
              <label>
                <span className="text-xs font-medium text-stone-500">Commission (%)</span>
                <input type="number" min={0} max={100} step="0.5" value={taux} onChange={(e) => setTaux(e.target.value)} className={`${champ} tabular-nums`} />
              </label>
            </div>
            <p className="text-[11px] text-stone-400 -mt-2">
              Calculée sur le montant réellement payé, à chaque paiement fait avec un code de cet agent.
              {nouveau ? "" : " Un changement de taux s'applique aux prochains paiements."}
            </p>
            {nouveau ? (
              <label className="block">
                <span className="text-xs font-medium text-stone-500">Mot de passe provisoire</span>
                <div className="flex gap-2 mt-1">
                  <input value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="flex-1 min-w-0 border border-stone-300 rounded-lg py-2 px-3 text-sm font-mono" />
                  <button type="button" onClick={() => setMotDePasse(motDePasseAleatoire())} className="shrink-0 border border-stone-300 rounded-lg px-3 text-stone-600" aria-label="Générer un autre mot de passe">
                    <RefreshCw size={15} />
                  </button>
                </div>
                {!motDePasseValide && (
                  <span className="text-[11px] text-red-600">12 caractères, majuscule, minuscule, chiffre et caractère spécial.</span>
                )}
              </label>
            ) : (
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={actif} onChange={(e) => setActif(e.target.checked)} />
                Agent actif (décoché : ses codes ne fonctionnent plus et il perd l'accès à son espace)
              </label>
            )}
            {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
            <button
              onClick={enregistrer}
              disabled={enCours || nom.trim().length < 2 || (nouveau && (!email.includes("@") || !motDePasseValide))}
              className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-60"
            >
              {enCours ? "Enregistrement..." : nouveau ? "Créer le compte de l'agent" : "Enregistrer"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function suggestionCode(nomAgent: string | undefined): string {
  const base = (nomAgent ?? "AKWEO")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8) || "AKWEO";
  return `${base}${10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90)}`;
}

function ModaleCode({
  code,
  agents,
  offres,
  onFerme,
  onEnregistre,
}: {
  code: CodePromo | null;
  agents: AgentCommercial[];
  offres: OffreAbonnement[];
  onFerme: () => void;
  onEnregistre: () => Promise<void>;
}) {
  const [agentId, setAgentId] = useState(code?.agent_id ?? "");
  const [valeurCode, setValeurCode] = useState(code?.code ?? suggestionCode(undefined));
  const [type, setType] = useState<"pourcentage" | "montant">(code?.type_reduction ?? "pourcentage");
  const [valeur, setValeur] = useState(String(code?.valeur ?? 10));
  const [offresChoisies, setOffresChoisies] = useState<string[]>(code?.offres ?? []);
  const [periodicite, setPeriodicite] = useState<"toutes" | "mensuel" | "annuel">(
    (code?.periodicites?.length === 1 ? code.periodicites[0] : "toutes") as "toutes" | "mensuel" | "annuel"
  );
  const [premier, setPremier] = useState(code?.premier_paiement_seulement ?? false);
  const [dateDebut, setDateDebut] = useState(code?.date_debut ?? "");
  const [dateFin, setDateFin] = useState(code?.date_fin ?? "");
  const [max, setMax] = useState(code?.max_utilisations ? String(code.max_utilisations) : "");
  const [actif, setActif] = useState(code?.actif ?? true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const champ = "w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm";

  async function enregistrer() {
    setErreur(null);
    setEnCours(true);
    try {
      await enregistrerCode({
        id: code?.id,
        code: valeurCode,
        agent_id: agentId || null,
        type_reduction: type,
        valeur: Number(valeur),
        offres: offresChoisies.length ? offresChoisies : null,
        periodicites: periodicite === "toutes" ? null : [periodicite],
        premier_paiement_seulement: premier,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        max_utilisations: max ? Number(max) : null,
        actif,
      });
      await onEnregistre();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/40" onClick={onFerme} />
      <div className="relative bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-stone-900">{code ? `Code ${code.code}` : "Nouveau code promo"}</h2>
          <button onClick={onFerme} className="p-1 text-stone-400" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Agent commercial</span>
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              if (!code) setValeurCode(suggestionCode(agents.find((a) => a.id === e.target.value)?.nom));
            }}
            className={`${champ} bg-white`}
          >
            <option value="">Aucun (promotion générale, sans commission)</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} · {Number(a.taux_commission)} %
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Code</span>
          <div className="flex gap-2 mt-1">
            <input
              value={valeurCode}
              onChange={(e) => setValeurCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              maxLength={20}
              className="flex-1 min-w-0 border border-stone-300 rounded-lg py-2 px-3 text-sm font-mono uppercase"
            />
            <button type="button" onClick={() => setValeurCode(suggestionCode(agents.find((a) => a.id === agentId)?.nom))} className="shrink-0 border border-stone-300 rounded-lg px-3 text-stone-600" aria-label="Proposer un autre code">
              <RefreshCw size={15} />
            </button>
          </div>
        </label>

        <div>
          <span className="text-xs font-medium text-stone-500">Réduction</span>
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-1">
            <input type="number" min={1} max={type === "pourcentage" ? 90 : undefined} value={valeur} onChange={(e) => setValeur(e.target.value)} className="border border-stone-300 rounded-lg py-2 px-3 text-sm tabular-nums" />
            <div className="inline-flex bg-stone-100 rounded-lg p-1">
              {(
                [
                  ["pourcentage", "%"],
                  ["montant", "F CFA"],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setType(v)} className={`px-3 rounded-md text-sm font-medium ${type === v ? "bg-white shadow text-stone-900" : "text-stone-500"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-stone-400">
            {type === "pourcentage" ? "90 % maximum." : "Le montant restant à payer doit dépasser 100 F."}
          </span>
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-stone-500">Offres concernées (aucune cochée = toutes)</legend>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {offres.map((o) => {
              const coche = offresChoisies.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOffresChoisies((p) => (coche ? p.filter((x) => x !== o.id) : [...p, o.id]))}
                  className={`px-3 py-1.5 rounded-full text-sm border ${coche ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"}`}
                >
                  {o.nom}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Formule</span>
          <select value={periodicite} onChange={(e) => setPeriodicite(e.target.value as typeof periodicite)} className={`${champ} bg-white`}>
            <option value="toutes">Mensuelle et annuelle</option>
            <option value="mensuel">Mensuelle seulement</option>
            <option value="annuel">Annuelle seulement</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-xs font-medium text-stone-500">Valable du</span>
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={champ} />
          </label>
          <label>
            <span className="text-xs font-medium text-stone-500">au</span>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={champ} />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-stone-500">Nombre maximal d'utilisations (vide = illimité)</span>
          <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} className={champ} />
        </label>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={premier} onChange={(e) => setPremier(e.target.checked)} />
            Réservé au premier abonnement d'un commerce
          </label>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            Code actif
          </label>
        </div>

        {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}

        <button
          onClick={enregistrer}
          disabled={enCours || valeurCode.length < 3 || !(Number(valeur) > 0)}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer le code"}
        </button>
      </div>
    </div>
  );
}
