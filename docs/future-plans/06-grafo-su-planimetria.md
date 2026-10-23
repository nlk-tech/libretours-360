# Grafo delle scene sovrapposto alla planimetria

## Context
Il grafo delle scene ([SceneGraphCanvas.tsx](../../src/components/studio/SceneGraphCanvas.tsx), [scene-graph.ts](../../src/lib/scene-graph.ts)) dispone le scene con un layout force-directed: mostra bene come sono collegate, ma non dove si trovano. Molte scene hanno già una posizione su una planimetria (`Scene.floorplanPosition`: `floorplanId`, `x`, `y` in frazioni dell'immagine, `heading`). Usarla come posizione dei nodi farebbe vedere i collegamenti sopra la pianta vera: si capisce subito se un hotspot "salta" una stanza, se due stanze vicine non sono collegate, se un corridoio non porta da nessuna parte.

## Idea
- Nel grafo, un'opzione **Su planimetria** accanto ad Adatta / Ridisponi, attiva solo se il progetto ha almeno una planimetria con scene posizionate.
- Un selettore del piano, come nella minimappa (stesso ordinamento per `level`).
- Sfondo: l'immagine del piano scelto (`floorplanUrls`), scalata nel sistema di coordinate del grafo, con pan e zoom come oggi.
- Nodi: le scene posizionate su quel piano, al loro `x`/`y`. Più piccoli delle schede attuali (la pianta deve restare leggibile): un cerchio con la miniatura, il nome sotto, il cono di `heading` come nella minimappa.
- Archi: gli stessi di oggi (andata e ritorno, senso unico tratteggiato), con gli stessi avvisi.

## Punti da decidere
1. **Collegamenti tra piani.** Un arco verso una scena di un altro piano non ha un punto d'arrivo sulla pianta. Proposta: un "connettore" sul bordo del nodo (icona scale + nome del piano di destinazione), cliccabile per passare a quel piano.
2. **Scene non posizionate.** Un vassoio laterale con le scene del piano senza posizione (o senza planimetria), con i loro archi tratteggiati verso il vassoio; da lì si potrebbero trascinare sulla pianta.
3. **Trascinare un nodo cambia la posizione sulla planimetria?** Sarebbe comodo (è un secondo modo di posizionare le scene), ma è una modifica al progetto, mentre oggi spostare i nodi del grafo non salva nulla. Proposta: sì, con lo stesso comportamento di `onPlaceScene` della minimappa, e senza toccare `heading`.
4. **Sovrapposizione dei nodi.** Scene riprese a pochi metri l'una dall'altra si sovrappongono: valutare un piccolo spostamento solo visivo (collision avoidance) che non cambia i dati.
5. **Export.** Solo editor, almeno all'inizio. Nei tour esportati la minimappa già mostra i segnaposti; disegnarci gli archi è un'idea separata.

## Da riusare
- `buildSceneGraph()` per archi, raggiungibilità e avvisi: non cambia.
- La matematica del cono e il calcolo delle coordinate immagine da [floorplan-geometry.ts](../../src/lib/floorplan-geometry.ts) e [FloorplanMinimap.tsx](../../src/components/studio/FloorplanMinimap.tsx).
- `layoutSceneGraph()` resta per la vista attuale e per il vassoio delle scene non posizionate.

## Verifica
- Test puri: dalla `floorplanPosition` alle coordinate del grafo per un piano, archi tra piani classificati come connettori, scene non posizionate escluse dal piano.
- Prova manuale: progetto con due piani, scale tra i due, una scena non posizionata.
