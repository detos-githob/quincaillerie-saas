import { useEffect, useState, useCallback } from "react";
import { nombreVentesEnAttente } from "../services/offlineQueue";
import { synchroniserVentesEnAttente } from "../services/ventesService";

export function useSyncHorsLigne() {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [nombreEnAttente, setNombreEnAttente] = useState(nombreVentesEnAttente());

  const rafraichirCompteur = useCallback(() => {
    setNombreEnAttente(nombreVentesEnAttente());
  }, []);

  const synchroniser = useCallback(async () => {
    if (!navigator.onLine) return;
    await synchroniserVentesEnAttente();
    rafraichirCompteur();
  }, [rafraichirCompteur]);

  useEffect(() => {
    function gererRetourEnLigne() {
      setEnLigne(true);
      synchroniser();
    }
    function gererPerteReseau() {
      setEnLigne(false);
    }

    window.addEventListener("online", gererRetourEnLigne);
    window.addEventListener("offline", gererPerteReseau);

    // Tentative de synchronisation périodique (toutes les 30s) au cas où
    // le navigateur ne déclenche pas fiablement l'événement "online".
    const intervalle = setInterval(synchroniser, 30000);

    return () => {
      window.removeEventListener("online", gererRetourEnLigne);
      window.removeEventListener("offline", gererPerteReseau);
      clearInterval(intervalle);
    };
  }, [synchroniser]);

  return { enLigne, nombreEnAttente, rafraichirCompteur };
}
