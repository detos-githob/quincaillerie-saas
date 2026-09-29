// CORS restreint aux origines de l'application (jamais « * » sur des
// fonctions qui manipulent l'abonnement).
const ORIGINES = [
  Deno.env.get("APP_URL") || "https://quincallerie.denistossou.com",
  ...(Deno.env.get("APP_URL_DEV") ? [Deno.env.get("APP_URL_DEV")!] : []),
];

export function enTetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINES.includes(origine) ? origine : ORIGINES[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function reponseJson(req: Request, corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), "Content-Type": "application/json" },
  });
}
