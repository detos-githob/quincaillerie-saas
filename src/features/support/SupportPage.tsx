import { LifeBuoy, Phone, Mail, MessageCircle } from "lucide-react";

const TELEPHONE_SUPPORT = import.meta.env.VITE_SUPPORT_TELEPHONE as string | undefined;
const EMAIL_SUPPORT = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;

const QUESTIONS_FREQUENTES = [
  {
    question: "Comment ajouter un membre à mon équipe ?",
    reponse:
      "Va dans \"Équipe\", puis \"Ajouter un membre\". Le nombre de comptes autorisés dépend de ton palier d'abonnement (visible sur la page \"Abonnement\").",
  },
  {
    question: "Comment passer sur un palier supérieur ?",
    reponse:
      "Depuis \"Abonnement\" dans le menu, choisis l'offre qui te convient et suis les étapes de paiement.",
  },
  {
    question: "J'ai fait une erreur sur une vente, comment l'annuler ?",
    reponse:
      "Contacte-nous directement (voir ci-dessous) : l'annulation d'une vente déjà enregistrée doit rester tracée pour ta comptabilité.",
  },
];

export function SupportPage() {
  const lienWhatsapp = TELEPHONE_SUPPORT
    ? `https://wa.me/${TELEPHONE_SUPPORT.replace(/[^0-9]/g, "")}`
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-stone-100">
          <LifeBuoy size={18} className="text-stone-500" />
        </span>
        <h1 className="font-display text-2xl font-bold text-stone-900">Support</h1>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-5 space-y-3">
        <p className="text-sm text-stone-600">
          Une question, un blocage, une envie de faire évoluer l'appli ? On est là.
        </p>
        <div className="grid gap-2">
          {lienWhatsapp && (
            <a
              href={lienWhatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50"
            >
              <MessageCircle size={18} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-stone-900">WhatsApp</p>
                <p className="text-xs text-stone-400">{TELEPHONE_SUPPORT}</p>
              </div>
            </a>
          )}
          {TELEPHONE_SUPPORT && (
            <a
              href={`tel:${TELEPHONE_SUPPORT}`}
              className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50"
            >
              <Phone size={18} className="text-stone-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-stone-900">Téléphone</p>
                <p className="text-xs text-stone-400">{TELEPHONE_SUPPORT}</p>
              </div>
            </a>
          )}
          {EMAIL_SUPPORT && (
            <a
              href={`mailto:${EMAIL_SUPPORT}`}
              className="flex items-center gap-3 border border-stone-200 rounded-lg p-3 hover:bg-stone-50"
            >
              <Mail size={18} className="text-stone-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-stone-900">Email</p>
                <p className="text-xs text-stone-400">{EMAIL_SUPPORT}</p>
              </div>
            </a>
          )}
          {!TELEPHONE_SUPPORT && !EMAIL_SUPPORT && (
            <p className="text-xs text-stone-400">
              Contact support non configuré — demande à l'éditeur de l'app de renseigner
              VITE_SUPPORT_TELEPHONE et/ou VITE_SUPPORT_EMAIL.
            </p>
          )}
        </div>
      </div>

      <p className="font-display text-lg font-bold text-stone-900 mb-2">Questions fréquentes</p>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {QUESTIONS_FREQUENTES.map((q) => (
          <div key={q.question} className="p-4">
            <p className="text-sm font-medium text-stone-900 mb-1">{q.question}</p>
            <p className="text-xs text-stone-500">{q.reponse}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
