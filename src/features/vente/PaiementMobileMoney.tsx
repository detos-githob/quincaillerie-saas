import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Smartphone, X, RotateCcw, HandCoins } from "lucide-react";
import {
  OPERATEURS,
  annulerPaiementVente,
  initierPaiementVente,
  statutPaiementVente,
  type ComptePaiement,
  type Operateur,
  type PaiementVente,
} from "../../services/paiementsElectroniquesService";

interface Option {
  cle: string;
  compteId: string;
  operateur: Operateur;
  libelle: string;
  test: boolean;
}

interface Props {
  comptes: ComptePaiement[];
  total: number;
  telephoneInitial: string;
  enCoursVente: boolean;
  messageFinal: string | null;
  /** Crée la vente (et la facture). paiementId = null pour un encaissement manuel. */
  onEncaisser: (paiementId: string | null) => Promise<void>;
  /** Le panier doit être figé pendant l'attente et après la confirmation. */
  onVerrouillage: (verrouille: boolean) => void;
}

const formatF = (n: number) => Math.round(n).toLocaleString("fr-FR") + " F";
const formatTel = (t: string) => {
  const n = t.replace(/\D/g, "").replace(/^229(?=\d{10}$)/, "");
  return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, "$1 ") : t;
};

export function PaiementMobileMoney({ comptes, total, telephoneInitial, enCoursVente, messageFinal, onEncaisser, onVerrouillage }: Props) {
  const options = useMemo<Option[]>(() => {
    const liste: Option[] = [];
    const parOperateur = new Map<Operateur, number>();
    comptes.filter((c) => c.actif).forEach((c) => c.operateurs.forEach((o) => parOperateur.set(o, (parOperateur.get(o) ?? 0) + 1)));
    for (const c of comptes.filter((c) => c.actif)) {
      for (const o of c.operateurs) {
        liste.push({
          cle: `${c.id}:${o}`,
          compteId: c.id,
          operateur: o,
          libelle: (parOperateur.get(o) ?? 0) > 1 ? `${OPERATEURS[o].court} · ${c.libelle}` : OPERATEURS[o].court,
          test: c.environnement === "test",
        });
      }
    }
    const ordre: Operateur[] = ["mtn", "moov", "celtiis"];
    return liste.sort((a, b) => ordre.indexOf(a.operateur) - ordre.indexOf(b.operateur));
  }, [comptes]);

  const [choix, setChoix] = useState<string | null>(options.length === 1 ? options[0].cle : null);
  const [telephone, setTelephone] = useState(telephoneInitial);
  const [paiement, setPaiement] = useState<PaiementVente | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const venteLancee = useRef<string | null>(null);

  const option = options.find((o) => o.cle === choix) ?? null;
  const enAttente = paiement?.statut === "en_attente";
  const confirme = paiement?.statut === "reussi";

  useEffect(() => {
    if (!telephone && telephoneInitial) setTelephone(telephoneInitial);
  }, [telephoneInitial]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onVerrouillage(enAttente || confirme);
  }, [enAttente, confirme, onVerrouillage]);

  // Interrogation du statut tant que le client n'a pas répondu.
  useEffect(() => {
    if (!paiement || paiement.statut !== "en_attente") return;
    const debut = new Date(paiement.created_at).getTime();
    const minuteur = setInterval(() => setSecondes(Math.max(0, Math.round((Date.now() - debut) / 1000))), 1000);
    const sondage = setInterval(async () => {
      try {
        const p = await statutPaiementVente(paiement.id);
        setPaiement(p);
      } catch {
        /* coupure passagère : on réessaie au prochain tour */
      }
    }, 4000);
    return () => {
      clearInterval(minuteur);
      clearInterval(sondage);
    };
  }, [paiement?.id, paiement?.statut]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirmé : la vente et la facture sont créées automatiquement (une seule fois).
  useEffect(() => {
    if (paiement?.statut === "reussi" && venteLancee.current !== paiement.id) {
      venteLancee.current = paiement.id;
      onEncaisser(paiement.id).catch(() => {});
    }
    if (paiement && ["echoue", "expire", "annule"].includes(paiement.statut)) {
      setErreur(paiement.raison || "Le paiement n'a pas abouti.");
    }
  }, [paiement?.statut, paiement?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function envoyer() {
    if (!option) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const p = await initierPaiementVente({ compteId: option.compteId, operateur: option.operateur, montant: Math.round(total), telephone });
      setSecondes(0);
      setPaiement(p);
    } catch (e: any) {
      setErreur(e.message || "Envoi de la demande impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  async function annuler() {
    if (!paiement) return;
    try {
      const p = await annulerPaiementVente(paiement.id);
      setPaiement(p.statut === "reussi" ? p : null);
      if (p.statut !== "reussi") setErreur(null);
    } catch (e: any) {
      setErreur(e.message);
    }
  }

  // ---------------------------------------------------------------- attente
  if (paiement && (enAttente || confirme)) {
    const op = OPERATEURS[paiement.operateur];
    return (
      <div className="space-y-3">
        <div className={`rounded-xl border p-3 ${confirme ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${confirme ? "bg-emerald-500 text-white" : "bg-white text-amber-600"}`}>
              {confirme ? <Check size={20} /> : <Smartphone size={20} className="animate-pulse" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900">
                {confirme ? "Paiement confirmé" : "En attente de confirmation du client"}
              </p>
              <p className="text-xs text-stone-600">
                {op.nom} · {formatTel(paiement.telephone)} · <span className="font-semibold">{formatF(paiement.montant)}</span>
              </p>
              {!confirme && (
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Le client doit valider sur son téléphone (code secret). {Math.floor(secondes / 60)}:{String(secondes % 60).padStart(2, "0")}
                </p>
              )}
            </div>
          </div>
          {paiement.environnement === "test" && <p className="text-[10px] text-amber-700 mt-2">Compte en mode test : aucun argent réel.</p>}
        </div>

        {confirme ? (
          <button
            onClick={() => onEncaisser(paiement.id).catch(() => {})}
            disabled={enCoursVente || !!messageFinal}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {messageFinal ? (<><Check size={18} /> {messageFinal}</>) : enCoursVente ? "Enregistrement de la vente…" : "Enregistrer la vente"}
          </button>
        ) : (
          <button onClick={annuler} className="w-full border border-stone-300 text-stone-700 font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            <X size={16} /> Annuler la demande
          </button>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- saisie
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-stone-500">Opérateur du client</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {options.map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => {
                setChoix(o.cle);
                setErreur(null);
              }}
              className={`relative py-2 px-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 ${
                choix === o.cle ? "border-slate-700 ring-1 ring-slate-700 bg-white text-stone-900" : "bg-white text-stone-600 border-stone-300"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: OPERATEURS[o.operateur].couleur }} />
              <span className="truncate">{o.libelle}</span>
              {o.test && <span className="absolute -top-1.5 -right-1 text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">TEST</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setChoix("manuel");
              setErreur(null);
            }}
            className={`py-2 px-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-1.5 ${
              choix === "manuel" ? "border-slate-700 ring-1 ring-slate-700 bg-white text-stone-900" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            <HandCoins size={15} /> Déjà reçu
          </button>
        </div>
      </div>

      {option && (
        <div>
          <label className="text-xs font-medium text-stone-500">Numéro {OPERATEURS[option.operateur].nom} du client</label>
          <input
            type="tel"
            inputMode="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="01 97 00 00 00"
            className="w-full mt-1 border border-stone-300 rounded-lg py-2.5 px-3 text-base tracking-wide"
          />
        </div>
      )}
      {choix === "manuel" && (
        <p className="text-[11px] text-stone-500">
          Le client a déjà payé (transfert reçu sur ton téléphone) : la vente est enregistrée en Mobile Money sans demande électronique.
        </p>
      )}

      {erreur && (
        <p className="text-sm text-red-600 flex items-start gap-1.5">
          <RotateCcw size={14} className="mt-0.5 shrink-0" /> {erreur}
        </p>
      )}

      {choix === "manuel" ? (
        <button
          onClick={() => onEncaisser(null).catch(() => {})}
          disabled={enCoursVente || !!messageFinal}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {messageFinal ? (<><Check size={18} /> {messageFinal}</>) : enCoursVente ? "Enregistrement..." : "Encaisser"}
        </button>
      ) : (
        <button
          onClick={envoyer}
          disabled={!option || envoi || telephone.replace(/\D/g, "").length < 8 || total <= 0}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {envoi ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
          {!option ? "Choisis l'opérateur du client" : envoi ? "Envoi de la demande…" : `Envoyer la demande · ${formatF(total)}`}
        </button>
      )}
    </div>
  );
}
