import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, Clock, Download, LifeBuoy, Mail, MessageCircle, Pencil, Phone } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  chargerSupport,
  contenuEnCache,
  formatTaille,
  urlGuide,
  urlTelechargement,
  type ContenuSupport,
  type SupportGuide,
} from "../../services/supportService";

const LecteurPdf = lazy(() => import("./LecteurPdf").then((m) => ({ default: m.LecteurPdf })));

export function SupportPage() {
  const { estSuperAdmin } = useAuth();
  const [contenu, setContenu] = useState<ContenuSupport | null>(() => contenuEnCache());
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState<SupportGuide | null>(null);

  useEffect(() => {
    chargerSupport()
      .then((c) => {
        setContenu(c);
        setErreur(null);
      })
      .catch(() => setErreur("Hors connexion : contenu enregistré sur l'appareil."));
  }, []);

  const p = contenu?.parametres;
  const guides = (contenu?.guides ?? []).filter((g) => g.visible || estSuperAdmin);
  const faq = (contenu?.faq ?? []).filter((q) => q.visible || estSuperAdmin);
  const numeroWhatsapp = p?.whatsapp?.replace(/[^0-9]/g, "");

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100">
          <LifeBuoy size={18} className="text-stone-500" />
        </span>
        <h1 className="flex-1 font-display text-2xl font-bold text-stone-900">Support</h1>
        {estSuperAdmin && (
          <Link to="/admin?onglet=support" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50">
            <Pencil size={13} /> Modifier cette page
          </Link>
        )}
      </div>

      {erreur && <p className="text-xs text-stone-500 bg-stone-100 rounded-lg px-3 py-2 mb-4">{erreur}</p>}
      {!contenu && !erreur && <p className="text-sm text-stone-400">Chargement…</p>}

      {/* ------------------------------------------------ guides */}
      {guides.length > 0 && (
        <section className="mb-6" aria-labelledby="titre-guides">
          <h2 id="titre-guides" className="font-display text-lg font-bold text-stone-900 mb-2">Guides</h2>
          <div className="space-y-3">
            {guides.map((g, i) => (
              <article key={g.id} className={`rounded-2xl overflow-hidden border ${i === 0 ? "border-navy bg-navy text-white" : "border-stone-200 bg-white"}`}>
                <div className="p-4 flex gap-3">
                  <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${i === 0 ? "bg-amber-500 text-stone-900" : "bg-amber-50 text-amber-700"}`}>
                    <BookOpen size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${i === 0 ? "text-white" : "text-stone-900"}`}>{g.titre}</h3>
                      {!g.visible && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">Masqué</span>}
                    </div>
                    {g.description && <p className={`text-sm mt-0.5 ${i === 0 ? "text-stone-300" : "text-stone-600"}`}>{g.description}</p>}
                    <p className={`text-[11px] mt-1 ${i === 0 ? "text-stone-400" : "text-stone-400"}`}>{formatTaille(g.taille_octets)}</p>
                  </div>
                </div>
                <div className={`grid grid-cols-2 gap-px ${i === 0 ? "bg-white/10" : "bg-stone-200"}`}>
                  <button onClick={() => setLecture(g)}
                    className={`flex items-center justify-center gap-2 py-3 text-sm font-semibold ${i === 0 ? "bg-amber-500 text-stone-900 hover:bg-amber-400" : "bg-white text-stone-900 hover:bg-stone-50"}`}>
                    <BookOpen size={16} /> Lire ici
                  </button>
                  <a href={urlTelechargement(g)} download={g.nom_fichier || true}
                    className={`flex items-center justify-center gap-2 py-3 text-sm font-semibold ${i === 0 ? "bg-navy text-white hover:bg-white/5" : "bg-white text-stone-700 hover:bg-stone-50"}`}>
                    <Download size={16} /> Télécharger
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ contact */}
      {p && (
        <section className="bg-white border border-stone-200 rounded-xl p-4 mb-6 space-y-3" aria-labelledby="titre-contact">
          <h2 id="titre-contact" className="sr-only">Nous contacter</h2>
          <p className="text-sm text-stone-600 whitespace-pre-line">{p.message_accueil}</p>
          {p.horaires && (
            <p className="flex items-center gap-2 text-xs text-stone-500"><Clock size={14} /> {p.horaires}</p>
          )}
          <div className="grid gap-2">
            {numeroWhatsapp && (
              <a href={`https://wa.me/${numeroWhatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50">
                <MessageCircle size={18} className="text-emerald-600 shrink-0" />
                <div><p className="text-sm font-medium text-stone-900">WhatsApp</p><p className="text-xs text-stone-500">{p.whatsapp}</p></div>
              </a>
            )}
            {p.telephone && (
              <a href={`tel:${p.telephone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50">
                <Phone size={18} className="text-stone-500 shrink-0" />
                <div><p className="text-sm font-medium text-stone-900">Téléphone</p><p className="text-xs text-stone-500">{p.telephone}</p></div>
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50">
                <Mail size={18} className="text-stone-500 shrink-0" />
                <div><p className="text-sm font-medium text-stone-900">Email</p><p className="text-xs text-stone-500">{p.email}</p></div>
              </a>
            )}
            {!numeroWhatsapp && !p.telephone && !p.email && (
              <p className="text-xs text-stone-400">
                Coordonnées du support pas encore renseignées{estSuperAdmin ? " : ajoute-les depuis « Modifier cette page »." : "."}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ FAQ */}
      {faq.length > 0 && (
        <section aria-labelledby="titre-faq">
          <h2 id="titre-faq" className="font-display text-lg font-bold text-stone-900 mb-2">Questions fréquentes</h2>
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {faq.map((q) => (
              <details key={q.id} className="group">
                <summary className="flex items-center gap-3 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-sm font-medium text-stone-900">
                    {q.question}
                    {!q.visible && <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">Masquée</span>}
                  </span>
                  <ChevronDown size={16} className="text-stone-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-4 pb-4 -mt-1 text-sm text-stone-600 whitespace-pre-line">{q.reponse}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {lecture && (
        <Suspense fallback={null}>
          <LecteurPdf url={urlGuide(lecture)} titre={lecture.titre} urlTelechargement={urlTelechargement(lecture)} onFerme={() => setLecture(null)} />
        </Suspense>
      )}
    </div>
  );
}
