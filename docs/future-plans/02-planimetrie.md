# Planimetrie multi-piano con posizione e direzione di vista

> **Stato: implementato**, tranne il TODO in fondo (conflitti con gli overlay del tema). La documentazione aggiornata è in [docs/floorplans.md](../floorplans.md). Rispetto a quanto scritto qui, l'implementazione:
> - negli export non ha pan e zoom sulla minimappa, solo il pulsante per ingrandirla;
> - oltre all'angolo ha un offset X/Y in px o %, come gli elementi del tema (`floorplanOffset`), sempre senza coprire i controlli del viewer;
> - nell'editor il segnaposto e la maniglia del cono si trascinano anche nella minimappa piccola;
> - la minimappa (e il suo pulsante) compare solo nelle scene posizionate su una planimetria; "Nessuna planimetria" la toglie dalla scena;
> - nello standalone esclude la minimappa dal trascinamento della vista, così il clic sui segnaposti arriva;
> - scrive le immagini dei piani in `floorplans/` anche nel Web 3D, e lascia fuori un piano la cui immagine non si legge.

## Context
L'utente carica una o più planimetrie dell'area del tour, una per piano: interrato, seminterrato, terra, rialzato, primo, ecc. Per ogni scena 360° indica sulla planimetria:
- **dove si trova**, con un segnaposto rotondo;
- **dove sta guardando**, con un cono attorno al segnaposto, allineato alla foto.

La planimetria compare come **minimappa in sovrimpressione** in tutti e tre i viewer: app (editor e anteprima), export Web 3D, export standalone. La minimappa mostra:
- il piano della scena corrente;
- i segnaposti, cliccabili per navigare;
- il cono della scena attiva, che ruota in tempo reale con la vista;
- un selettore del piano, se i piani sono più di uno.

Ogni viewer ha un **toggle** etichettato "Planimetria" per mostrarla o nasconderla.

Stato di partenza:
- il tipo `Floorplan { id, name, imageUrl }` in `src/types/tour.ts`;
- `floorplanSchema` in `src/lib/project-schema.ts`;
- il tab "Planimetrie" con un pulsante disabilitato in `LeftSidebar.tsx` (circa L658).

Il pacchetto `.ltproj` porta già le immagini di `floorplans[].imageUrl` (`project-package.ts`).

## Decisioni
- Si lavora nel branch `floorplans`.
- Più piani, ciascuno con un `level` numerico che serve per l'ordinamento.
- **Angolo della minimappa:** è un'impostazione di progetto, uno dei 4 angoli, di default in basso a sinistra.
- **Editor:** si lavora sulla minimappa stessa, che si espande in un pannello grande sopra il viewer. Non c'è un pannello separato né una finestra modale.
- **Calibrazione della direzione**, in due modi:
  - **clic sul riferimento**: si orienta il panorama con un riferimento (una porta) al centro, poi lo si clicca sulla planimetria e l'angolo si calcola;
  - **maniglia dell'arco**: la si trascina per la rifinitura.
- Gli export Web 3D e standalone si fanno nello stesso branch.

## Modello di direzione
Il panorama ha il suo yaw 0, il centro dell'immagine equirettangolare. La planimetria ha i suoi assi. Basta un numero per scena:

`heading` = angolo sulla planimetria (gradi, 0 = verso l'alto, orario) che corrisponde a yaw 0 del panorama.

- **Visualizzazione:** il cono punta a `heading + yaw`.
- **Maniglia:** `heading = angoloArco − yaw`.
- **Clic sul riferimento:** `angoloArco = atan2` del vettore segnaposto → clic, calcolato in pixel e non in coordinate normalizzate, perché x e y sono normalizzati separatamente. Poi come la maniglia.
- **Ampiezza del cono:** il FOV corrente del viewer.

## Modello dati (schema v3)
In `src/types/tour.ts`:
- `Floorplan { id; name; imageUrl; level }`
  - `level`: -2 interrato, -1 seminterrato, 0 terra, 0.5 rialzato, 1 primo…
- `Scene.floorplanPosition?: { floorplanId; x; y; heading }`
  - `x`/`y` normalizzati 0..1 sull'immagine;
  - una scena sta al più su un piano.
- `TourProject.showFloorplan: boolean`, default `true`: se la minimappa è visibile all'apertura del tour esportato.
- `TourProject.floorplanCorner`: `top-left | top-right | bottom-left | bottom-right`, default `bottom-left`.

In `src/lib/project-schema.ts`:
- `level` con default 0;
- `imageUrl` validato con `isSafeAssetRef`;
- `floorplanPosition` opzionale;
- i nuovi campi del progetto con i loro default;
- id dei piani unici;
- un `floorplanPosition` che punta a un piano inesistente viene scartato;
- step `if (version < 3)` in `migrateProject()`.

`cloneWithNewIds` in `src/lib/storage.ts` dà nuovi id ai piani e rimappa `floorplanPosition.floorplanId`.

## Immagini
Si usano gli asset generici `asset:<key>` del tema (`src/lib/theme-assets.ts`), che stanno in `projects/<id>/assets/`. Formati: PNG, JPG, WebP, SVG. Il PDF è escluso. Quando un piano viene eliminato o la sua immagine sostituita, l'asset vecchio si cancella.

## Editor
- **Tab Planimetrie:**
  - lista dei piani ordinata per livello, con miniatura, nome, livello, sostituisci immagine ed elimina (con avviso sulle scene collegate);
  - "Aggiungi planimetria";
  - impostazioni di progetto: mostra nel tour esportato, angolo;
  - per la scena attiva: piano, oppure "non posizionata", e "Rimuovi dalla planimetria".
- **Minimappa** (`FloorplanMinimap.tsx`, dentro PanoCanvas), nell'angolo scelto:
  - piccola di default, con un pulsante per espanderla;
  - da espansa ha pan e zoom (rotellina e trascinamento);
  - in modalità Modifica e da espansa: "Posiziona qui", trascinamento del segnaposto, maniglia dell'arco, "Punta un riferimento".
- **Pulsanti già presenti negli angoli:** in basso a sinistra c'è "Imposta vista predefinita" (solo in Modifica), in basso a destra la barra zoom/misure. La minimappa si sposta sopra di essi.
- **PanoCanvas:** segue yaw e FOV tramite `position-updated` / `zoom-updated`, con un throttling via `requestAnimationFrame`.

## Export
- Script minimappa condiviso, vanilla, in `src/lib/floorplan/minimap.js` + `minimap.css`:
  - si inietta come testo in entrambi i viewer, come `viewer.js` del cubemap;
  - non contiene il letterale `http://`.
- **Web 3D:**
  - le immagini vanno in `floorplans/<file>`;
  - JSON con piani, posizioni, `SHOW_FLOORPLAN` e `FLOORPLAN_CORNER`;
  - la minimappa si aggiorna su `position-updated` / `zoom-updated`;
  - toggle accanto a quello delle misure.
- **Standalone:**
  - immagini scritte con `sink.writeFile("floorplans/…")`;
  - `CubemapTour` esteso, con `version` 2;
  - `setView` chiamato dal loop di render;
  - toggle in `#controls`.
- **Su mobile** la minimappa parte piccola.

## TODO (fuori da questo branch)
- **Conflitti con gli overlay del tema.** Un overlay ancorato allo stesso angolo della minimappa può sovrapporsi a essa. Possibili verifiche:
  - un avviso nell'editor quando un overlay ha la stessa `position` di `floorplanCorner`, con il suggerimento di cambiare angolo;
  - poi, un controllo sulle aree effettive (bounding box misurati) nella preview del Theme Canvas, tenendo conto degli offset e delle dimensioni dell'overlay.

## Verifica
- **Test unitari:**
  - geometria: wrap 0/360, yaw negativi, andata e ritorno calibrazione → visualizzazione, riferimento su un'immagine non quadrata;
  - migrazione v2 → v3;
  - `cloneWithNewIds`;
  - dati e script dei due export;
  - e2e del cubemap esteso.
- **Manuale nell'app, nel browser e in Tauri:**
  - 2 piani, 3 scene posizionate;
  - calibrazione;
  - toggle;
  - cambio angolo;
  - persistenza, duplicazione, eliminazione di un piano con scene collegate.
- **Export:**
  - Web 3D via HTTP e standalone da `file://`: minimappa, cono, navigazione, cambio piano, toggle.
