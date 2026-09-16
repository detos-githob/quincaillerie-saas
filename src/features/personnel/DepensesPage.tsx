import { useEffect, useState, type FormEvent } from "react";
import { Plus, X, Receipt, UserPlus, Wallet } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  listerEmployes,
  creerEmploye,
  listerPaiementsPersonnel,
  enregistrerPaiementPersonnel,
} from "../../services/personnelService";
import { listerDepenses, creerDepense } from "../../services/depensesService";
import { genererQuittancePersonnelPDF } from "./quittancePdf";
import {
  LABELS_CATEGORIE_DEPENSE,
  LABELS_MOTIF_PAIEMENT,
} from "../../types";
import type {
  CategorieDepense,
  Depense,
  Employe,
  Entreprise,
  ModePaiementSortie,
  MotifPaiementPersonnel,
  PaiementPersonnel,
} from "../../types";

function formatFCFA(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR") + " F";
}

type Onglet = "personnel" | "depenses";

export function DepensesPage() {
  const [onglet, setOnglet] = useState<Onglet>("personnel");

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-10">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Personnel & Dépenses</h1>

      <div className="flex gap-2 mb-4">
        {([
          ["personnel", "Personnel"],
          ["depenses", "Dépenses"],
        ] as [Onglet, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setOnglet(val)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              onglet === val ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {onglet === "personnel" && <OngletPersonnel />}
      {onglet === "depenses" && <OngletDepenses />}
    </div>
  );
}

// =====================================================================
// ONGLET PERSONNEL
// =====================================================================

function OngletPersonnel() {
  const { entreprise, utilisateur } = useAuth();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [paiements, setPaiements] = useState<PaiementPersonnel[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleEmployeOuverte, setModaleEmployeOuverte] = useState(false);
  const [employePourPaiement, setEmployePourPaiement] = useState<Employe | null>(null);

  useEffect(() => {
    Promise.all([listerEmployes(), listerPaiementsPersonnel()])
      .then(([e, p]) => {
        setEmployes(e);
        setPaiements(p);
      })
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p className="text-stone-400 text-sm p-4">Chargement...</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold text-stone-900">Employés</p>
        <button
          onClick={() => setModaleEmployeOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <UserPlus size={15} /> Nouvel employé
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {employes.map((e) => (
          <div key={e.id} className="flex items-center justify-between p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{e.nom}</p>
              <p className="text-xs text-stone-400">{e.poste || "—"}</p>
            </div>
            <button
              onClick={() => setEmployePourPaiement(e)}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg shrink-0"
            >
              <Wallet size={13} /> Payer
            </button>
          </div>
        ))}
        {employes.length === 0 && (
          <p className="p-4 text-center text-stone-400 text-sm">Aucun employé enregistré pour l'instant.</p>
        )}
      </div>

      <div>
        <p className="font-display text-lg font-bold text-stone-900 mb-2">Derniers paiements</p>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {paiements.slice(0, 20).map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {p.employe?.nom} — {LABELS_MOTIF_PAIEMENT[p.motif]}
                </p>
                <p className="text-xs text-stone-400">
                  {p.numero_quittance} · {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <span className="text-sm font-semibold text-stone-900 shrink-0">{formatFCFA(p.montant)}</span>
            </div>
          ))}
          {paiements.length === 0 && (
            <p className="p-4 text-center text-stone-400 text-sm">Aucun paiement enregistré.</p>
          )}
        </div>
      </div>

      {modaleEmployeOuverte && entreprise && (
        <ModaleNouvelEmploye
          entrepriseId={entreprise.id}
          onFerme={() => setModaleEmployeOuverte(false)}
          onCree={(e) => setEmployes((prev) => [...prev, e].sort((a, b) => a.nom.localeCompare(b.nom)))}
        />
      )}

      {employePourPaiement && entreprise && (
        <ModalePaiementPersonnel
          employe={employePourPaiement}
          entreprise={entreprise}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setEmployePourPaiement(null)}
          onPaye={(p) => setPaiements((prev) => [p, ...prev])}
        />
      )}
    </div>
  );
}

function ModaleNouvelEmploye({
  entrepriseId,
  onFerme,
  onCree,
}: {
  entrepriseId: string;
  onFerme: () => void;
  onCree: (e: Employe) => void;
}) {
  const [nom, setNom] = useState("");
  const [poste, setPoste] = useState("");
  const [telephone, setTelephone] = useState("");
  const [salaireReference, setSalaireReference] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const employe = await creerEmploye(
      {
        nom,
        poste: poste || null,
        telephone: telephone || null,
        salaire_reference: salaireReference ? Number(salaireReference) : null,
      },
      entrepriseId
    );
    onCree(employe);
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouvel employé</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Nom</label>
          <input
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Poste</label>
          <input
            value={poste}
            onChange={(e) => setPoste(e.target.value)}
            placeholder="Vendeur, livreur, gardien..."
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-stone-500">Téléphone</label>
            <input
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500">Salaire réf. (F)</label>
            <input
              type="number"
              value={salaireReference}
              onChange={(e) => setSalaireReference(e.target.value)}
              className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Création..." : "Ajouter l'employé"}
        </button>
      </form>
    </div>
  );
}

function ModalePaiementPersonnel({
  employe,
  entreprise,
  utilisateurId,
  onFerme,
  onPaye,
}: {
  employe: Employe;
  entreprise: Entreprise;
  utilisateurId: string | null;
  onFerme: () => void;
  onPaye: (p: PaiementPersonnel) => void;
}) {
  const [montant, setMontant] = useState(employe.salaire_reference ? String(employe.salaire_reference) : "");
  const [periode, setPeriode] = useState("");
  const [motif, setMotif] = useState<MotifPaiementPersonnel>("salaire");
  const [modePaiement, setModePaiement] = useState<ModePaiementSortie>("especes");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const paiement = await enregistrerPaiementPersonnel(
        entreprise.id,
        employe.id,
        Number(montant),
        periode || null,
        motif,
        modePaiement,
        utilisateurId
      );
      onPaye(paiement);
      genererQuittancePersonnelPDF(paiement, employe, entreprise);
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement du paiement.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Payer {employe.nom}</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Motif</label>
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {(["salaire", "prime", "avance", "autre"] as MotifPaiementPersonnel[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotif(m)}
                className={`py-2 rounded-lg text-xs font-medium border ${
                  motif === m ? "bg-slate-700 text-white border-slate-700" : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {LABELS_MOTIF_PAIEMENT[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Montant (F)</label>
          <input
            type="number"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Période concernée (optionnel)</label>
          <input
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            placeholder="Ex : Septembre 2026"
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Mode de paiement</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiementSortie)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="especes">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="virement">Virement</option>
          </select>
        </div>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          <Receipt size={16} />
          {enCours ? "Enregistrement..." : "Payer et générer la quittance"}
        </button>
      </form>
    </div>
  );
}

// =====================================================================
// ONGLET DEPENSES
// =====================================================================

function OngletDepenses() {
  const { entreprise, utilisateur } = useAuth();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  useEffect(() => {
    listerDepenses()
      .then(setDepenses)
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p className="text-stone-400 text-sm p-4">Chargement...</p>;

  const totalMois = depenses
    .filter((d) => new Date(d.created_at).getMonth() === new Date().getMonth())
    .reduce((s, d) => s + d.montant, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-400">Dépenses ce mois-ci</p>
          <p className="font-display text-xl font-bold text-stone-900">{formatFCFA(totalMois)}</p>
        </div>
        <button
          onClick={() => setModaleOuverte(true)}
          className="flex items-center gap-1.5 bg-stone-900 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <Plus size={15} /> Nouvelle dépense
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {depenses.map((d) => (
          <div key={d.id} className="flex items-center justify-between p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">
                {LABELS_CATEGORIE_DEPENSE[d.categorie]}
                {d.description ? ` — ${d.description}` : ""}
              </p>
              <p className="text-xs text-stone-400">{new Date(d.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <span className="text-sm font-semibold text-stone-900 shrink-0">{formatFCFA(d.montant)}</span>
          </div>
        ))}
        {depenses.length === 0 && (
          <p className="p-4 text-center text-stone-400 text-sm">Aucune dépense enregistrée.</p>
        )}
      </div>

      {modaleOuverte && entreprise && (
        <ModaleNouvelleDepense
          entrepriseId={entreprise.id}
          utilisateurId={utilisateur?.id || null}
          onFerme={() => setModaleOuverte(false)}
          onCreee={(d) => setDepenses((prev) => [d, ...prev])}
        />
      )}
    </div>
  );
}

function ModaleNouvelleDepense({
  entrepriseId,
  utilisateurId,
  onFerme,
  onCreee,
}: {
  entrepriseId: string;
  utilisateurId: string | null;
  onFerme: () => void;
  onCreee: (d: Depense) => void;
}) {
  const [categorie, setCategorie] = useState<CategorieDepense>("autre");
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiementSortie>("especes");
  const [enCours, setEnCours] = useState(false);

  async function gererSoumission(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const depense = await creerDepense(
      { categorie, description: description || null, montant: Number(montant), mode_paiement: modePaiement },
      entrepriseId,
      utilisateurId
    );
    onCreee(depense);
    onFerme();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <form onSubmit={gererSoumission} className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">Nouvelle dépense</h2>
          <button type="button" onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Catégorie</label>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as CategorieDepense)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            {Object.entries(LABELS_CATEGORIE_DEPENSE).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Description (optionnel)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Montant (F)</label>
          <input
            type="number"
            required
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500">Mode de paiement</label>
          <select
            value={modePaiement}
            onChange={(e) => setModePaiement(e.target.value as ModePaiementSortie)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="especes">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="virement">Virement</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer la dépense"}
        </button>
      </form>
    </div>
  );
}
