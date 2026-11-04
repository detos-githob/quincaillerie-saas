import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
// Adresse du moteur de lecture (servi par l'appli elle-même, pas par un CDN).
import adresseMoteur from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/**
 * Lecture d'un PDF directement dans l'appli, page par page, sur tous les
 * téléphones (Android n'affiche pas les PDF dans une page web).
 * Le moteur pdf.js n'est téléchargé qu'à la première ouverture.
 */
export function LecteurPdf({ url, titre, urlTelechargement, onFerme }: {
  url: string;
  titre: string;
  urlTelechargement: string;
  onFerme: () => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [largeur, setLargeur] = useState(0);
  const documentPdf = useRef<{ numPages: number; getPage: (n: number) => Promise<PagePdf>; destroy: () => Promise<void> } | null>(null);

  const surFermeture = useRef(onFerme);
  surFermeture.current = onFerme;

  // Fermeture au clavier et blocage du défilement de la page derrière.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => e.key === "Escape" && surFermeture.current();
    window.addEventListener("keydown", touche);
    return () => {
      document.body.style.overflow = avant;
      window.removeEventListener("keydown", touche);
    };
  }, []);

  // Largeur disponible (suivie au redimensionnement / rotation).
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => setLargeur(Math.min(el.clientWidth - 24, 1000));
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Chargement du document.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = adresseMoteur;
        const doc = await pdfjs.getDocument({ url, isEvalSupported: false, enableXfa: false }).promise;
        if (annule) {
          await doc.destroy();
          return;
        }
        documentPdf.current = doc as unknown as typeof documentPdf.current;
        setPages(doc.numPages);
        setEtat("pret");
      } catch (e) {
        console.error("Lecture du PDF", e);
        if (!annule) setEtat("erreur");
      }
    })();
    return () => {
      annule = true;
      documentPdf.current?.destroy().catch(() => undefined);
      documentPdf.current = null;
    };
  }, [url]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-stone-900" role="dialog" aria-modal="true" aria-label={titre}>
      <div className="flex items-center gap-2 px-3 py-2 bg-navy text-white shrink-0">
        <p className="flex-1 min-w-0 truncate font-display text-lg font-bold">{titre}</p>
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Réduire"
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 disabled:opacity-40"><ZoomOut size={18} /></button>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Agrandir"
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 disabled:opacity-40"><ZoomIn size={18} /></button>
        <a href={urlTelechargement} download aria-label="Télécharger le PDF"
          className="h-10 px-3 rounded-lg flex items-center gap-1.5 text-sm font-semibold bg-amber-500 text-stone-900 hover:bg-amber-400">
          <Download size={16} /> <span className="hidden sm:inline">Télécharger</span>
        </a>
        <button ref={fermer} onClick={onFerme} aria-label="Fermer"
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10"><X size={20} /></button>
      </div>

      <div ref={zone} className="flex-1 overflow-auto">
        {etat === "chargement" && (
          <p className="flex items-center justify-center gap-2 text-sm text-stone-300 py-16"><Loader2 size={18} className="animate-spin" /> Ouverture du guide…</p>
        )}
        {etat === "erreur" && (
          <div className="max-w-sm mx-auto text-center text-stone-200 py-16 px-4">
            <p className="text-sm">Impossible d'afficher le guide ici (connexion ou appareil trop ancien).</p>
            <a href={urlTelechargement} download className="inline-flex items-center gap-2 mt-4 bg-amber-500 text-stone-900 font-semibold text-sm px-4 py-2.5 rounded-xl">
              <Download size={16} /> Télécharger le PDF
            </a>
          </div>
        )}
        {etat === "pret" && largeur > 0 && (
          <div className="flex flex-col items-center gap-3 py-3" style={{ minWidth: largeur * zoom + 24 }}>
            {Array.from({ length: pages }, (_, i) => (
              <PageRendue key={i} numero={i + 1} documentPdf={documentPdf} largeur={Math.round(largeur * zoom)} />
            ))}
            <p className="text-xs text-stone-400 pb-4">{pages} page{pages > 1 ? "s" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface PagePdf {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
}

/** Une page, dessinée seulement quand elle approche de l'écran (économise la mémoire). */
function PageRendue({ numero, documentPdf, largeur }: {
  numero: number;
  documentPdf: React.RefObject<{ getPage: (n: number) => Promise<PagePdf> } | null>;
  largeur: number;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(numero === 1);
  const [ratio, setRatio] = useState(1.3);

  useEffect(() => {
    const el = conteneur.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && setVisible(true), { rootMargin: "800px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !documentPdf.current) return;
    let tache: { cancel: () => void } | null = null;
    let annule = false;
    (async () => {
      const page = await documentPdf.current!.getPage(numero);
      if (annule || !toile.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const densite = Math.min(window.devicePixelRatio || 1, 2);
      const vue = page.getViewport({ scale: (largeur / base.width) * densite });
      const c = toile.current;
      c.width = Math.floor(vue.width);
      c.height = Math.floor(vue.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const rendu = page.render({ canvasContext: ctx, viewport: vue });
      tache = rendu;
      await rendu.promise.catch(() => undefined);
    })();
    return () => {
      annule = true;
      tache?.cancel();
    };
  }, [visible, numero, largeur, documentPdf]);

  return (
    <div ref={conteneur} className="bg-white shadow-lg" style={{ width: largeur, height: Math.round(largeur * ratio) }}>
      <canvas ref={toile} aria-label={`Page ${numero}`} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
