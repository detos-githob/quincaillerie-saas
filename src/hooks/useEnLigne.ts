import { useEffect, useState } from "react";

/** Vrai quand l'appareil a du réseau (mis à jour en direct). */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => {
    const oui = () => setEnLigne(true);
    const non = () => setEnLigne(false);
    window.addEventListener("online", oui);
    window.addEventListener("offline", non);
    return () => {
      window.removeEventListener("online", oui);
      window.removeEventListener("offline", non);
    };
  }, []);
  return enLigne;
}
