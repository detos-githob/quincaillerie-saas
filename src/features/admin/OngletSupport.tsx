import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Eye, EyeOff, FileUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  basculerFaq,
  basculerGuide,
  chargerSupport,
  enregistrerFaq,
  enregistrerGuide,
  enregistrerParametres,
  formatTaille,
  reordonner,
  supprimerFaq,
  supprimerGuide,
  TAILLE_MAX_GUIDE,
  urlGuide,
  urlTelechargement,
  type ContenuSupport,
  type SupportFaq,
  type SupportGuide,
  type SupportParametres,
} from "../../services/supportService";

const LecteurPdf = lazy(() => import("../support/LecteurPdf").then((m) => ({ default: m.LecteurPdf })));

// Contenu de la page Support, modifiable sans toucher au code.
export function OngletSupport() {
  const [contenu, setContenu] = useState<ContenuSupport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [guideEdite, setGuideEdite] = useState<SupportGuide | "nouveau" | null>(null);
  const [faqEditee, setFaqEditee] = useState<SupportFaq | "nouvelle" | null>(null);
  const [lecture, setLecture] = useState<SupportGuide | null>(null);

  const recharger = () => chargerSupport().then(setContenu).catch((e) => setErreur(e.message));
  useEffect(() => {
    recharger();
  }, []);

  async function agir(action: () => Promise<void>, succes?: string) {
    setErreur(null);
    setMessage(null);
    try {
      await action();
      if (succes) setMessage(succes);
    } catch (e: any) {
      setErreur(e.message || "Action impossible.");
    }
    await recharger();
  }

  function deplacer<T extends { id: string }>(liste: T[], index: number, sens: -1 | 1, table: "support_faq" | "support_guides") {
    const cible = index + sens;
    if (cible < 0 || cible >= liste.length) return;
    const ids = liste.map((x) => x.id);
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    agir(() => reordonner(table, ids));
  }

  if (!contenu) return <p className="text-sm text-stone-400">{erreur ?? "Chargement…"}</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 max-w-xl">
        Tout ce qui s'affiche dans la page « Support » des commerçants. Les modifications sont visibles immédiatement.
      </p>
      {message && <p className="text-sm bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">{message}</p>}
      {erreur && <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{erreur}</p>}

      <CarteCoordonnees parametres={contenu.parametres} onEnregistre={(p) => agir(() => enregistrerParametres(p), "Coordonnées enregistrées.")} />

      {/* ------------------------------------------------ guides */}
      <section className="bg-white border border-stone-200 rounded-xl">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-stone-100">
          <div>
            <h2 className="font-display text-lg font-bold text-stone-900">Guides PDF</h2>
            <p className="text-xs text-stone-500">Lisibles dans l'appli et téléchargeables. 20 Mo maximum par fichier.</p>
          </div>
          <button onClick={() => setGuideEdite("nouveau")} className="shrink-0 inline-flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={15} /> Ajouter
          </button>
        </div>
        {contenu.guides.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">Aucun guide.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {contenu.guides.map((g, i) => (
              <li key={g.id} className="p-3 flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center"><BookOpen size={17} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-stone-900">{g.titre}</p>
                    {!g.visible && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">Masqué</span>}
                  </div>
                  {g.description && <p className="text-xs text-stone-500 mt-0.5">{g.description}</p>}
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {formatTaille(g.taille_octets)} · {g.fichier.startsWith("/") ? "fichier livré avec l'appli" : g.nom_fichier}
                  </p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <BoutonIcone libelle="Lire" onClick={() => setLecture(g)}><BookOpen size={14} /> Lire</BoutonIcone>
                    <BoutonIcone libelle="Modifier" onClick={() => setGuideEdite(g)}><Pencil size={14} /> Modifier</BoutonIcone>
                    <BoutonIcone libelle={g.visible ? "Masquer" : "Afficher"} onClick={() => agir(() => basculerGuide(g.id, !g.visible))}>
                      {g.visible ? <EyeOff size={14} /> : <Eye size={14} />} {g.visible ? "Masquer" : "Afficher"}
                    </BoutonIcone>
                    <BoutonSupprimer onConfirme={() => agir(() => supprimerGuide(g), "Guide supprimé.")} />
                  </div>
                </div>
                <Ordre index={i} total={contenu.guides.length} onMonte={() => deplacer(contenu.guides, i, -1, "support_guides")} onDescend={() => deplacer(contenu.guides, i, 1, "support_guides")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ FAQ */}
      <section className="bg-white border border-stone-200 rounded-xl">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-stone-100">
          <h2 className="font-display text-lg font-bold text-stone-900">Questions fréquentes</h2>
          <button onClick={() => setFaqEditee("nouvelle")} className="shrink-0 inline-flex items-center gap-1.5 bg-navy text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus size={15} /> Ajouter
          </button>
        </div>
        {contenu.faq.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">Aucune question.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {contenu.faq.map((q, i) => (
              <li key={q.id} className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-stone-900">{q.question}</p>
                    {!q.visible && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">Masquée</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 whitespace-pre-line">{q.reponse}</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <BoutonIcone libelle="Modifier" onClick={() => setFaqEditee(q)}><Pencil size={14} /> Modifier</BoutonIcone>
                    <BoutonIcone libelle={q.visible ? "Masquer" : "Afficher"} onClick={() => agir(() => basculerFaq(q.id, !q.visible))}>
                      {q.visible ? <EyeOff size={14} /> : <Eye size={14} />} {q.visible ? "Masquer" : "Afficher"}
                    </BoutonIcone>
                    <BoutonSupprimer onConfirme={() => agir(() => supprimerFaq(q.id), "Question supprimée.")} />
                  </div>
                </div>
                <Ordre index={i} total={contenu.faq.length} onMonte={() => deplacer(contenu.faq, i, -1, "support_faq")} onDescend={() => deplacer(contenu.faq, i, 1, "support_faq")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {guideEdite && (
        <ModaleGuide
          guide={guideEdite === "nouveau" ? null : guideEdite}
          onFerme={() => setGuideEdite(null)}
          onEnregistre={async (saisie) => {
            await enregistrerGuide({ ...saisie, ordre: contenu.guides.length });
            setGuideEdite(null);
            setMessage(guideEdite === "nouveau" ? "Guide ajouté." : "Guide mis à jour.");
            await recharger();
          }}
        />
      )}
      {faqEditee && (
        <ModaleFaq
          faq={faqEditee === "nouvelle" ? null : faqEditee}
          onFerme={() => setFaqEditee(null)}
          onEnregistre={async (saisie) => {
            await enregistrerFaq({ ...saisie, ordre: contenu.faq.length });
            setFaqEditee(null);
            setMessage(faqEditee === "nouvelle" ? "Question ajoutée." : "Question mise à jour.");
            await recharger();
          }}
        />
      )}
      {lecture && (
        <Suspense fallback={null}>
          <LecteurPdf url={urlGuide(lecture)} titre={lecture.titre} urlTelechargement={urlTelechargement(lecture)} onFerme={() => setLecture(null)} />
        </Suspense>
      )}
    </div>
  );
}

// ------------------------------------------------------------ coordonnées
function CarteCoordonnees({ parametres, onEnregistre }: { parametres: SupportParametres; onEnregistre: (p: SupportParametres) => Promise<void> }) {
  const [saisie, setSaisie] = useState(parametres);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => setSaisie(parametres), [parametres]);
  const champ = (cle: keyof SupportParametres) => ({
    value: (saisie[cle] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSaisie((s) => ({ ...s, [cle]: e.target.value })),
  });

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-4">
      <h2 className="font-display text-lg font-bold text-stone-900">Coordonnées du support</h2>
      <form
        className="mt-3 grid sm:grid-cols-2 gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnCours(true);
          await onEnregistre(saisie);
          setEnCours(false);
        }}
      >
        <label className="sm:col-span-2 block">
          <span className="text-xs font-medium text-stone-500">Message d'accueil</span>
          <textarea {...champ("message_accueil")} rows={2} maxLength={600} className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Numéro WhatsApp</span>
          <input {...champ("whatsapp")} type="tel" placeholder="+229 01 97 00 00 00" className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Téléphone (appel)</span>
          <input {...champ("telephone")} type="tel" placeholder="+229 01 97 00 00 00" className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Email</span>
          <input {...champ("email")} type="email" placeholder="support@exemple.com" className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Horaires</span>
          <input {...champ("horaires")} maxLength={200} placeholder="Lun – Sam, 8 h – 19 h" className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <p className="sm:col-span-2 text-[11px] text-stone-400">Un champ laissé vide n'apparaît pas dans la page Support.</p>
        <div className="sm:col-span-2">
          <button disabled={enCours} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold text-sm px-4 py-2.5 rounded-xl disabled:opacity-60">
            {enCours && <Loader2 size={15} className="animate-spin" />} Enregistrer les coordonnées
          </button>
        </div>
      </form>
    </section>
  );
}

// ------------------------------------------------------------ modales
function Modale({ titre, onFerme, children }: { titre: string; onFerme: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/50 sm:p-4" onClick={onFerme}>
      <div role="dialog" aria-modal="true" aria-label={titre} className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-xl font-bold text-stone-900">{titre}</p>
          <button onClick={onFerme} aria-label="Fermer" className="text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModaleGuide({ guide, onFerme, onEnregistre }: {
  guide: SupportGuide | null;
  onFerme: () => void;
  onEnregistre: (s: { id?: string; titre: string; description: string; visible: boolean; fichier: File | null; ancienFichier?: string }) => Promise<void>;
}) {
  const [titre, setTitre] = useState(guide?.titre ?? "");
  const [description, setDescription] = useState(guide?.description ?? "");
  const [visible, setVisible] = useState(guide?.visible ?? true);
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function choisir(f: File | undefined) {
    setErreur(null);
    if (!f) return setFichier(null);
    if (f.type && f.type !== "application/pdf") return setErreur("Choisis un fichier PDF.");
    if (f.size > TAILLE_MAX_GUIDE) return setErreur("Le fichier dépasse 20 Mo.");
    setFichier(f);
    if (!titre.trim()) setTitre(f.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
  }

  return (
    <Modale titre={guide ? "Modifier le guide" : "Nouveau guide"} onFerme={onFerme}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnCours(true);
          setErreur(null);
          try {
            await onEnregistre({ id: guide?.id, titre, description, visible, fichier, ancienFichier: guide?.fichier });
          } catch (er: any) {
            setErreur(er.message || "Enregistrement impossible.");
          } finally {
            setEnCours(false);
          }
        }}
      >
        <label className="block rounded-xl border-2 border-dashed border-stone-300 p-4 text-center cursor-pointer hover:bg-stone-50">
          <FileUp size={22} className="mx-auto text-stone-400" />
          <span className="block text-sm font-medium text-stone-800 mt-1">
            {fichier ? fichier.name : guide ? "Remplacer le PDF (facultatif)" : "Choisir le fichier PDF"}
          </span>
          <span className="block text-[11px] text-stone-400">{fichier ? formatTaille(fichier.size) : "PDF, 20 Mo maximum"}</span>
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Titre</span>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} required minLength={3} maxLength={120} className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Description (facultatif)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={400} className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Visible par les commerçants
        </label>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onFerme} className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm">Annuler</button>
          <button disabled={enCours || (!guide && !fichier)} className="flex-1 bg-amber-500 text-stone-900 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {enCours && <Loader2 size={15} className="animate-spin" />} {enCours && fichier ? "Envoi du PDF…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function ModaleFaq({ faq, onFerme, onEnregistre }: {
  faq: SupportFaq | null;
  onFerme: () => void;
  onEnregistre: (s: { id?: string; question: string; reponse: string; visible: boolean }) => Promise<void>;
}) {
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [reponse, setReponse] = useState(faq?.reponse ?? "");
  const [visible, setVisible] = useState(faq?.visible ?? true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <Modale titre={faq ? "Modifier la question" : "Nouvelle question"} onFerme={onFerme}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnCours(true);
          setErreur(null);
          try {
            await onEnregistre({ id: faq?.id, question, reponse, visible });
          } catch (er: any) {
            setErreur(er.message || "Enregistrement impossible.");
          } finally {
            setEnCours(false);
          }
        }}
      >
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Question</span>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} required minLength={3} maxLength={300} className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-500">Réponse</span>
          <textarea value={reponse} onChange={(e) => setReponse(e.target.value)} required rows={5} maxLength={3000} className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Visible par les commerçants
        </label>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onFerme} className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm">Annuler</button>
          <button disabled={enCours} className="flex-1 bg-amber-500 text-stone-900 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {enCours && <Loader2 size={15} className="animate-spin" />} Enregistrer
          </button>
        </div>
      </form>
    </Modale>
  );
}

// ------------------------------------------------------------ petits éléments
function BoutonIcone({ libelle, onClick, children }: { libelle: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={libelle}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50">
      {children}
    </button>
  );
}

function BoutonSupprimer({ onConfirme }: { onConfirme: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  useEffect(() => {
    if (!confirmer) return;
    const t = setTimeout(() => setConfirmer(false), 4000);
    return () => clearTimeout(t);
  }, [confirmer]);
  return (
    <button type="button" onClick={() => (confirmer ? onConfirme() : setConfirmer(true))}
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${confirmer ? "bg-red-600 border-red-600 text-white" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
      <Trash2 size={13} /> {confirmer ? "Confirmer" : "Supprimer"}
    </button>
  );
}

function Ordre({ index, total, onMonte, onDescend }: { index: number; total: number; onMonte: () => void; onDescend: () => void }) {
  return (
    <div className="shrink-0 flex flex-col gap-1">
      <button type="button" onClick={onMonte} disabled={index === 0} aria-label="Monter"
        className="w-8 h-8 rounded-md border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 disabled:opacity-30"><ArrowUp size={14} /></button>
      <button type="button" onClick={onDescend} disabled={index === total - 1} aria-label="Descendre"
        className="w-8 h-8 rounded-md border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-50 disabled:opacity-30"><ArrowDown size={14} /></button>
    </div>
  );
}
