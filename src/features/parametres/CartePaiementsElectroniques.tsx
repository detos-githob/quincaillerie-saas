import { useEffect, useState } from "react";
import { Smartphone, Plus, ShieldCheck, Pencil, Trash2, Power, RefreshCw, X, Loader2, AlertTriangle } from "lucide-react";
import {
  FOURNISSEURS,
  OPERATEURS,
  basculerComptePaiement,
  enregistrerComptePaiement,
  listerComptesPaiement,
  listerPaiementsVenteRecents,
  statutPaiementVente,
  supprimerComptePaiement,
  testerComptePaiement,
  type ComptePaiement,
  type FournisseurPaiement,
  type Operateur,
  type PaiementVente,
} from "../../services/paiementsElectroniquesService";

const STATUTS: Record<PaiementVente["statut"], { libelle: string; classe: string }> = {
  en_attente: { libelle: "En attente", classe: "bg-amber-100 text-amber-800" },
  reussi: { libelle: "Payé", classe: "bg-emerald-100 text-emerald-800" },
  echoue: { libelle: "Échoué", classe: "bg-red-100 text-red-700" },
  expire: { libelle: "Expiré", classe: "bg-stone-100 text-stone-600" },
  annule: { libelle: "Annulé", classe: "bg-stone-100 text-stone-600" },
};

function PastilleOperateur({ op }: { op: Operateur }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-stone-200 bg-white text-stone-700">
      <span className="w-2 h-2 rounded-full" style={{ background: OPERATEURS[op].couleur }} />
      {OPERATEURS[op].court}
    </span>
  );
}

function masquer(tel: string): string {
  const n = tel.replace(/\D/g, "");
  return n.length > 4 ? `•••• ${n.slice(-4)}` : tel;
}

export function CartePaiementsElectroniques() {
  const [comptes, setComptes] = useState<ComptePaiement[]>([]);
  const [paiements, setPaiements] = useState<PaiementVente[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formulaire, setFormulaire] = useState<ComptePaiement | "nouveau" | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);

  async function recharger() {
    try {
      const [c, p] = await Promise.all([listerComptesPaiement(), listerPaiementsVenteRecents(15)]);
      setComptes(c);
      setPaiements(p);
    } catch (e: any) {
      setMessage({ type: "erreur", texte: e.message || "Chargement impossible." });
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    recharger();
  }, []);

  async function executer(cle: string, fn: () => Promise<unknown>, succes: string) {
    setAction(cle);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: "ok", texte: succes });
      await recharger();
    } catch (e: any) {
      setMessage({ type: "erreur", texte: e.message || "Opération impossible." });
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 mt-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-amber-600" />
          <p className="font-display text-lg font-bold text-stone-900">Paiements électroniques</p>
        </div>
        {!formulaire && (
          <button
            onClick={() => setFormulaire("nouveau")}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-lg"
          >
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>
      <p className="text-xs text-stone-500 mb-4">
        Connecte ton compte marchand : à la caisse, le vendeur choisit l'opérateur, saisit le numéro du client, et le
        client confirme le paiement sur son téléphone. L'argent arrive sur ton compte marchand et la facture est créée
        automatiquement.
      </p>

      {message && (
        <p className={`text-xs mb-3 rounded-lg px-3 py-2 ${message.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {message.texte}
        </p>
      )}

      {formulaire && (
        <FormulaireCompte
          compte={formulaire === "nouveau" ? null : formulaire}
          onAnnuler={() => setFormulaire(null)}
          onEnregistre={async () => {
            setFormulaire(null);
            setMessage({ type: "ok", texte: "Compte vérifié auprès du fournisseur et enregistré." });
            await recharger();
          }}
        />
      )}

      {chargement ? (
        <p className="text-xs text-stone-400 py-4 text-center">Chargement…</p>
      ) : comptes.length === 0 && !formulaire ? (
        <div className="border border-dashed border-stone-300 rounded-lg p-4 text-center">
          <p className="text-sm text-stone-600">Aucun moyen de paiement configuré.</p>
          <p className="text-xs text-stone-400 mt-1">Sans compte configuré, « Mobile Money » à la caisse reste un simple encaissement manuel.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comptes.map((c) => (
            <div key={c.id} className={`border rounded-lg p-3 ${c.actif ? "border-stone-200" : "border-stone-200 bg-stone-50 opacity-75"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate">{c.libelle}</p>
                  <p className="text-[11px] text-stone-500">
                    {FOURNISSEURS[c.fournisseur].nom}
                    {c.apercu_cle && <> · <span className="font-mono">{c.apercu_cle}</span></>}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.environnement === "production" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {c.environnement === "production" ? "Production" : "Test"}
                  </span>
                  {!c.actif && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">Désactivé</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.operateurs.map((o) => <PastilleOperateur key={o} op={o} />)}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <BoutonAction
                  icone={action === `t${c.id}` ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  libelle="Tester"
                  onClick={() => executer(`t${c.id}`, () => testerComptePaiement(c.id), "Connexion au compte réussie.")}
                />
                <BoutonAction icone={<Pencil size={13} />} libelle="Modifier" onClick={() => setFormulaire(c)} />
                <BoutonAction
                  icone={<Power size={13} />}
                  libelle={c.actif ? "Désactiver" : "Activer"}
                  onClick={() => executer(`b${c.id}`, () => basculerComptePaiement(c.id, !c.actif), c.actif ? "Compte désactivé." : "Compte activé.")}
                />
                <BoutonAction
                  icone={<Trash2 size={13} />}
                  libelle="Supprimer"
                  danger
                  onClick={() => {
                    if (confirm(`Supprimer « ${c.libelle} » ? Les clés seront effacées. L'historique des paiements est conservé.`)) {
                      executer(`s${c.id}`, () => supprimerComptePaiement(c.id), "Compte supprimé.");
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {paiements.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-stone-900 mb-2">Derniers paiements électroniques</p>
          <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg">
            {paiements.map((p) => {
              const nonRattache = p.statut === "reussi" && !p.vente_id;
              const verifiable = p.statut !== "reussi" || nonRattache;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: OPERATEURS[p.operateur].couleur }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-900 tabular-nums">
                      {p.montant.toLocaleString("fr-FR")} F <span className="font-normal text-stone-500">· {masquer(p.telephone)}</span>
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      {p.raison && p.statut !== "reussi" ? ` · ${p.raison}` : ""}
                    </p>
                    {nonRattache && (
                      <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                        <AlertTriangle size={11} /> Payé mais aucune vente enregistrée : vérifie la caisse.
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUTS[p.statut].classe}`}>{STATUTS[p.statut].libelle}</span>
                  {verifiable && (
                    <button
                      title="Revérifier auprès de l'opérateur"
                      onClick={() => executer(`v${p.id}`, () => statutPaiementVente(p.id), "Statut mis à jour.")}
                      className="text-stone-400 hover:text-stone-700"
                    >
                      <RefreshCw size={14} className={action === `v${p.id}` ? "animate-spin" : ""} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BoutonAction({ icone, libelle, onClick, danger }: { icone: React.ReactNode; libelle: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-stone-200 text-stone-600 hover:bg-stone-50"
      }`}
    >
      {icone} {libelle}
    </button>
  );
}

function FormulaireCompte({ compte, onAnnuler, onEnregistre }: { compte: ComptePaiement | null; onAnnuler: () => void; onEnregistre: () => void }) {
  const [fournisseur, setFournisseur] = useState<FournisseurPaiement>(compte?.fournisseur ?? "fedapay");
  const [libelle, setLibelle] = useState(compte?.libelle ?? "");
  const [environnement, setEnvironnement] = useState<"test" | "production">(compte?.environnement ?? "test");
  const [operateurs, setOperateurs] = useState<Operateur[]>(compte?.operateurs ?? ["mtn", "moov", "celtiis"]);
  const [cles, setCles] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const autorises = FOURNISSEURS[fournisseur].operateurs;
  const champ = "w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm";

  function basculerOperateur(o: Operateur) {
    setOperateurs((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  }

  async function enregistrer() {
    setErreur(null);
    const choisis = operateurs.filter((o) => autorises.includes(o));
    if (choisis.length === 0) return setErreur("Choisis au moins un opérateur.");
    const clesSaisies = Object.fromEntries(Object.entries(cles).filter(([, v]) => v.trim()));
    if (!compte && Object.keys(clesSaisies).length === 0) return setErreur("Saisis les clés de ton compte.");
    setEnCours(true);
    try {
      await enregistrerComptePaiement({
        id: compte?.id,
        fournisseur,
        libelle: libelle.trim(),
        environnement,
        operateurs: choisis,
        cles: Object.keys(clesSaisies).length ? clesSaisies : undefined,
      });
      onEnregistre();
    } catch (e: any) {
      setErreur(e.message || "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-stone-900">{compte ? `Modifier « ${compte.libelle} »` : "Nouveau moyen de paiement"}</p>
        <button onClick={onAnnuler} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
      </div>

      {!compte && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {(Object.keys(FOURNISSEURS) as FournisseurPaiement[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFournisseur(f);
                setCles({});
                setOperateurs(FOURNISSEURS[f].operateurs);
              }}
              className={`text-left rounded-lg border p-3 ${fournisseur === f ? "border-navy bg-white ring-1 ring-navy" : "border-stone-200 bg-white"}`}
            >
              <p className="text-sm font-semibold text-stone-900">
                {FOURNISSEURS[f].nom}
                {f === "fedapay" && <span className="ml-1.5 text-[10px] font-semibold text-amber-700">Recommandé</span>}
              </p>
              <p className="text-[11px] text-stone-500 mt-1 leading-snug">{FOURNISSEURS[f].description}</p>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Nom affiché (facultatif)</span>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={fournisseur === "fedapay" ? "Ex : FedaPay boutique" : "Ex : MTN marchand"} className={champ} />
        </label>

        <div>
          <span className="text-xs font-medium text-stone-500">Environnement</span>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {(["test", "production"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEnvironnement(e)}
                className={`py-2 rounded-lg text-sm font-medium border ${environnement === e ? "bg-slate-700 text-white border-slate-700" : "bg-white text-stone-600 border-stone-300"}`}
              >
                {e === "test" ? "Test (sandbox)" : "Production (réel)"}
              </button>
            ))}
          </div>
          {environnement === "test" && <p className="text-[11px] text-amber-700 mt-1">Mode test : aucun argent réel n'est encaissé.</p>}
        </div>

        <div>
          <span className="text-xs font-medium text-stone-500">Opérateurs proposés à la caisse</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {autorises.map((o) => (
              <label key={o} className={`inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5 cursor-pointer ${operateurs.includes(o) ? "border-navy bg-white" : "border-stone-300 bg-white text-stone-500"}`}>
                <input type="checkbox" checked={operateurs.includes(o)} onChange={() => basculerOperateur(o)} className="accent-amber-500" />
                <span className="w-2 h-2 rounded-full" style={{ background: OPERATEURS[o].couleur }} />
                {OPERATEURS[o].nom}
              </label>
            ))}
          </div>
        </div>

        {fournisseur === "fedapay" ? (
          <label className="block">
            <span className="text-xs font-medium text-stone-500">Clé secrète FedaPay {compte && "(laisser vide pour garder l'actuelle)"}</span>
            <input
              type="password"
              autoComplete="off"
              value={cles.cle_secrete ?? ""}
              onChange={(e) => setCles({ cle_secrete: e.target.value })}
              placeholder={environnement === "test" ? "sk_sandbox_…" : "sk_live_…"}
              className={`${champ} font-mono`}
            />
            <span className="text-[11px] text-stone-400">Tableau de bord FedaPay → Paramètres → Clés API (clé secrète, pas la clé publique).</span>
          </label>
        ) : (
          <div className="space-y-2">
            {[
              ["cle_abonnement", "Clé d'abonnement Collections (Primary key)"],
              ["api_user", "API User (UUID)"],
              ["api_key", "API Key"],
            ].map(([cle, libelleChamp]) => (
              <label key={cle} className="block">
                <span className="text-xs font-medium text-stone-500">{libelleChamp} {compte && "(vide = inchangé)"}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={cles[cle] ?? ""}
                  onChange={(e) => setCles((prev) => ({ ...prev, [cle]: e.target.value }))}
                  className={`${champ} font-mono`}
                />
              </label>
            ))}
            <span className="text-[11px] text-stone-400">Fournis par MTN Bénin après validation de ton compte marchand (momodeveloper.mtn.com en test).</span>
          </div>
        )}

        <p className="text-[11px] text-stone-500 flex items-start gap-1.5">
          <ShieldCheck size={13} className="shrink-0 mt-0.5 text-emerald-600" />
          Les clés sont vérifiées auprès du fournisseur puis chiffrées. Elles ne sont plus jamais affichées, même à toi.
        </p>

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <div className="flex gap-2">
          <button onClick={onAnnuler} className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm">Annuler</button>
          <button onClick={enregistrer} disabled={enCours} className="flex-1 bg-navy text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2">
            {enCours && <Loader2 size={15} className="animate-spin" />}
            {enCours ? "Vérification…" : "Vérifier et enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
