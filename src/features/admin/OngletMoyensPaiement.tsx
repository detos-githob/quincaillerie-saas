import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Power, ShieldCheck, Trash2, X, Info } from "lucide-react";
import {
  COULEURS_OPERATEUR,
  FOURNISSEURS_PLATEFORME,
  LIBELLES_OPERATEUR,
  basculerMoyenPlateforme,
  enregistrerMoyenPlateforme,
  listerMoyensPlateforme,
  supprimerMoyenPlateforme,
  testerMoyenPlateforme,
  type FournisseurPlateforme,
  type MoyenPaiementPlateforme,
  type OperateurPlateforme,
} from "../../services/plateformePaiementsService";

function Pastille({ op }: { op: OperateurPlateforme }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-stone-200 bg-white text-stone-700">
      <span className="w-2 h-2 rounded-full" style={{ background: COULEURS_OPERATEUR[op] }} />
      {LIBELLES_OPERATEUR[op]}
    </span>
  );
}

export function OngletMoyensPaiement() {
  const [moyens, setMoyens] = useState<MoyenPaiementPlateforme[] | null>(null);
  const [edition, setEdition] = useState<MoyenPaiementPlateforme | "nouveau" | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = () =>
    listerMoyensPlateforme()
      .then(setMoyens)
      .catch((e) => setMessage({ ok: false, texte: e.message }));

  useEffect(() => {
    charger();
  }, []);

  async function executer(cle: string, fn: () => Promise<unknown>, succes: string) {
    setAction(cle);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, texte: succes });
      await charger();
    } catch (e: any) {
      setMessage({ ok: false, texte: e.message || "Opération impossible." });
    } finally {
      setAction(null);
    }
  }

  const actifs = moyens?.filter((m) => m.actif).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-stone-600 max-w-lg">
          Moyens proposés aux commerçants pour payer leur abonnement AKWEO. L'argent arrive sur tes comptes marchands.
          Un changement s'applique immédiatement sur la page de paiement.
        </p>
        <button onClick={() => setEdition("nouveau")} className="shrink-0 flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3.5 py-2 rounded-lg">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {moyens && actifs === 0 && (
        <p className="flex gap-2 text-xs text-stone-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <Info size={15} className="shrink-0 text-amber-600" />
          Aucun moyen actif ici : la page de paiement utilise encore la configuration technique d'origine (MTN MoMo et
          Kkiapay enregistrés dans les secrets Supabase). Dès qu'un moyen est actif, seuls les moyens de cette liste sont proposés.
        </p>
      )}

      {message && (
        <p className={`text-sm rounded-lg px-3 py-2 ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.texte}</p>
      )}

      {!moyens ? (
        <p className="text-sm text-stone-400">Chargement…</p>
      ) : moyens.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-xl p-6 text-center text-sm text-stone-500">Aucun moyen de paiement configuré.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {moyens.map((m) => (
            <div key={m.id} className={`bg-white border rounded-xl p-4 ${m.actif ? "border-stone-200" : "border-dashed border-stone-300 opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-stone-900 truncate">{m.libelle}</p>
                  <p className="text-[11px] text-stone-500">
                    {FOURNISSEURS_PLATEFORME[m.fournisseur].nom}
                    {m.apercu_cle && <> · <span className="font-mono">{m.apercu_cle}</span></>}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.environnement === "production" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {m.environnement === "production" ? "Production" : "Test"}
                  </span>
                  {!m.actif && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">Désactivé</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">{m.operateurs.map((o) => <Pastille key={o} op={o} />)}</div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Bouton
                  icone={action === `t${m.id}` ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  libelle="Tester"
                  onClick={() => executer(`t${m.id}`, () => testerMoyenPlateforme(m.id), "Connexion réussie.")}
                />
                <Bouton icone={<Pencil size={13} />} libelle="Modifier" onClick={() => setEdition(m)} />
                <Bouton
                  icone={<Power size={13} />}
                  libelle={m.actif ? "Désactiver" : "Activer"}
                  onClick={() => executer(`b${m.id}`, () => basculerMoyenPlateforme(m.id, !m.actif), m.actif ? "Moyen désactivé." : "Moyen activé.")}
                />
                <Bouton
                  icone={<Trash2 size={13} />}
                  libelle="Supprimer"
                  danger
                  onClick={() => {
                    if (confirm(`Supprimer « ${m.libelle} » ? Ses clés seront effacées. L'historique des paiements est conservé.`)) {
                      executer(`s${m.id}`, () => supprimerMoyenPlateforme(m.id), "Moyen supprimé.");
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {edition && (
        <ModaleMoyen
          moyen={edition === "nouveau" ? null : edition}
          onFerme={() => setEdition(null)}
          onEnregistre={async () => {
            setEdition(null);
            setMessage({ ok: true, texte: "Moyen vérifié auprès du fournisseur et enregistré." });
            await charger();
          }}
        />
      )}
    </div>
  );
}

function Bouton({ icone, libelle, onClick, danger }: { icone: React.ReactNode; libelle: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}
    >
      {icone} {libelle}
    </button>
  );
}

function ModaleMoyen({ moyen, onFerme, onEnregistre }: { moyen: MoyenPaiementPlateforme | null; onFerme: () => void; onEnregistre: () => void }) {
  const [fournisseur, setFournisseur] = useState<FournisseurPlateforme>(moyen?.fournisseur ?? "fedapay");
  const [libelle, setLibelle] = useState(moyen?.libelle ?? "");
  const [environnement, setEnvironnement] = useState<"test" | "production">(moyen?.environnement ?? "test");
  const [operateurs, setOperateurs] = useState<OperateurPlateforme[]>(moyen?.operateurs ?? FOURNISSEURS_PLATEFORME.fedapay.operateurs);
  const [ordre, setOrdre] = useState(String(moyen?.ordre ?? 0));
  const [clePublique, setClePublique] = useState(moyen?.cle_publique ?? "");
  const [cles, setCles] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const autorises = FOURNISSEURS_PLATEFORME[fournisseur].operateurs;
  const champ = "w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm";

  const champsCles: [string, string][] =
    fournisseur === "fedapay"
      ? [["cle_secrete", environnement === "test" ? "Clé secrète FedaPay (sk_sandbox_…)" : "Clé secrète FedaPay (sk_live_…)"]]
      : fournisseur === "mtn_momo"
        ? [["cle_abonnement", "Clé d'abonnement Collections (Primary key)"], ["api_user", "API User (UUID)"], ["api_key", "API Key"]]
        : [["cle_privee", "Clé privée Kkiapay"]];

  async function enregistrer() {
    setErreur(null);
    const choisis = operateurs.filter((o) => autorises.includes(o));
    if (choisis.length === 0) return setErreur("Choisis au moins un moyen proposé.");
    const saisies = Object.fromEntries(Object.entries(cles).filter(([, v]) => v.trim()));
    if (!moyen && Object.keys(saisies).length === 0) return setErreur("Saisis les clés.");
    setEnCours(true);
    try {
      await enregistrerMoyenPlateforme({
        id: moyen?.id,
        fournisseur,
        libelle: libelle.trim(),
        environnement,
        operateurs: choisis,
        ordre: Number(ordre) || 0,
        cle_publique: fournisseur === "kkiapay" ? clePublique.trim() : undefined,
        cles: Object.keys(saisies).length ? saisies : undefined,
      });
      onEnregistre();
    } catch (e: any) {
      setErreur(e.message || "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/50 p-0 sm:p-4" onClick={onFerme}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-display text-xl font-bold text-stone-900">{moyen ? `Modifier « ${moyen.libelle} »` : "Nouveau moyen de paiement"}</p>
          <button onClick={onFerme} className="text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>

        {!moyen && (
          <div className="grid gap-2 mb-4">
            {(Object.keys(FOURNISSEURS_PLATEFORME) as FournisseurPlateforme[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFournisseur(f);
                  setCles({});
                  setOperateurs(FOURNISSEURS_PLATEFORME[f].operateurs);
                }}
                className={`text-left rounded-lg border p-3 ${fournisseur === f ? "border-navy ring-1 ring-navy" : "border-stone-200"}`}
              >
                <p className="text-sm font-semibold text-stone-900">{FOURNISSEURS_PLATEFORME[f].nom}</p>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">{FOURNISSEURS_PLATEFORME[f].description}</p>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="text-xs font-medium text-stone-500">Nom affiché</span>
              <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={FOURNISSEURS_PLATEFORME[fournisseur].nom} className={champ} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-stone-500">Ordre d'affichage</span>
              <input type="number" value={ordre} onChange={(e) => setOrdre(e.target.value)} className={champ} />
            </label>
          </div>

          <div>
            <span className="text-xs font-medium text-stone-500">Environnement</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(["test", "production"] as const).map((e) => (
                <button key={e} type="button" onClick={() => setEnvironnement(e)}
                  className={`py-2 rounded-lg text-sm font-medium border ${environnement === e ? "bg-slate-700 text-white border-slate-700" : "bg-white text-stone-600 border-stone-300"}`}>
                  {e === "test" ? "Test (sandbox)" : "Production (réel)"}
                </button>
              ))}
            </div>
          </div>

          {autorises.length > 1 && (
            <div>
              <span className="text-xs font-medium text-stone-500">Moyens proposés aux commerçants</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {autorises.map((o) => (
                  <label key={o} className={`inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5 cursor-pointer ${operateurs.includes(o) ? "border-navy" : "border-stone-300 text-stone-500"}`}>
                    <input type="checkbox" checked={operateurs.includes(o)} onChange={() => setOperateurs((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))} className="accent-amber-500" />
                    <span className="w-2 h-2 rounded-full" style={{ background: COULEURS_OPERATEUR[o] }} />
                    {LIBELLES_OPERATEUR[o]}
                  </label>
                ))}
              </div>
              {operateurs.includes("international") && (
                <p className="text-[11px] text-stone-500 mt-1">« Autres pays et cartes » ouvre la page de paiement FedaPay : le client y choisit son pays et son moyen (Mobile Money de la zone, Visa, Mastercard), selon ce qui est activé sur ton compte FedaPay.</p>
              )}
            </div>
          )}

          {fournisseur === "kkiapay" && (
            <label className="block">
              <span className="text-xs font-medium text-stone-500">Clé publique Kkiapay</span>
              <input value={clePublique} onChange={(e) => setClePublique(e.target.value)} className={`${champ} font-mono`} />
            </label>
          )}
          {champsCles.map(([cle, lib]) => (
            <label key={cle} className="block">
              <span className="text-xs font-medium text-stone-500">{lib} {moyen && "(vide = inchangée)"}</span>
              <input type="password" autoComplete="off" value={cles[cle] ?? ""} onChange={(e) => setCles((p) => ({ ...p, [cle]: e.target.value }))} className={`${champ} font-mono`} />
            </label>
          ))}
          <p className="text-[11px] text-stone-500 flex gap-1.5"><ShieldCheck size={13} className="shrink-0 text-emerald-600 mt-0.5" /> Les clés sont testées puis chiffrées ; elles ne sont plus jamais affichées.</p>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onFerme} className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm">Annuler</button>
            <button onClick={enregistrer} disabled={enCours} className="flex-1 bg-navy text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {enCours && <Loader2 size={15} className="animate-spin" />} {enCours ? "Vérification…" : "Vérifier et enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
