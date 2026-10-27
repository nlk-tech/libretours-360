# 07 — Modalità VR / WebXR nell'export Web 3D

## Obiettivo

Permettere a chi apre un tour esportato (il file `index.html` della versione
"Server Web (3D)") di visualizzarlo in stereo su un visore VR compatibile con
WebXR (Meta Quest, HTC Vive, Valve Index, ecc.).

## Cosa è già stato fatto

Il pulsante **VR** è già presente nella barra dei controlli in alto a destra
dell'export Web 3D. Il comportamento attuale:

- All'apertura della pagina viene controllato `navigator.xr.isSessionSupported("immersive-vr")`.
  Se il dispositivo o il browser non supportano WebXR, il pulsante resta nascosto.
- Se il visore è supportato, il pulsante diventa visibile e cliccabile.
- Cliccando **Enter VR** si apre una sessione `immersive-vr` con reference space
  `local-floor`, si crea un `XRWebGLLayer` sul contesto WebGL di Three.js
  (esposto da Photo Sphere Viewer tramite `viewer.renderer.renderer`) e si avvia
  un loop di rendering stereo che disegna la scena per ogni occhio usando la
  `viewerPose` fornita dal frame WebXR.
- Cliccando **Exit VR** (o chiudendo la sessione dal visore) si esce dalla VR,
  si ripristina il render loop normale di PSV e il pulsante torna allo stato
  inattivo.

## Limiti noti e cosa resta da fare

1. **Navigazione delle scene in VR.** Attualmente gli hotspot (frecce di
   spostamento) non sono cliccabili dall'interno della sessione VR perché i
   marker HTML di PSV non vengono renderizzati nello stereo pass. Servirebbe
   un controller raycast o un'azione "guarda per N secondi" (gaze-to-select)
   per cambiare scena rimanendo in VR.

2. **Overlay e UI 2D.** Barra logo, titolo, planimetria, toggle misure e
   modale info sono elementi DOM e non appaiono in VR. Per un'esperienza
   completa bisognerebbe renderizzarli su un pannello 3D ancorato alla visuale
   (un "wrist panel" o un overlay fluttuante).

3. **Comfort e movimento.** Non c'è snap-turn né teletrasporto: il movimento
   della testa è 1:1 con il reference space `local-floor`. Per scene molto
   grandi potrebbe servire un sistema di locomozione (teletrasporto via
   controller o spostamento con il thumbstick).

4. **Test su hardware reale.** Il codice è stato scritto seguendo le API
   WebXR e l'integrazione Three.js di PSV 5, ma non è ancora stato provato
   su un visore. Da testare almeno su Quest 2/3 via browser.

5. **Prestazioni.** Il rendering stereo raddopia il carico; sulle scene
   ad altissima risoluzione potrebbe servire un livello di qualità ridotto
   (es. tile adapter con mipmap più aggressive) attivo solo in VR.

## Alternative considerate

- **A-Frame / `<a-sky>`**: più semplice da avviare ma perde tutta l'integrazione
  con marker, misure, planimetrie e tema già costruita su PSV.
- **Three.js WebXRController diretto**: richiederebbe di ricostruire la
  pipeline di rendering fuori da PSV, eliminando i benefici dell'adapter
  equirettangolo/cubemap già funzionante.

L'approccio attuale (usare il renderer Three.js interno di PSV) è il meno
invasivo e riutilizza tutto ciò che già funziona in modalità desktop.
