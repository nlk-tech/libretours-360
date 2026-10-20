# Misure stimate dalla foto, calibrate su una misura nota

> **Stato: da valutare.** Richiesta dei colleghi: inserita a mano una misura, l'app potrebbe "misurare" da sola le altre partendo dalla foto? Qui sotto la valutazione di fattibilità. Una prima verifica sui dati veri è stata fatta (vedi [Prova sul progetto brixen](#prova-sul-progetto-brixen-ottobre-2026)): il metodo funziona se le riprese seguono le [regole per un rilievo](#regole-per-un-rilievo).

## Context
Oggi una linea di misura ha due estremi in yaw/pitch e un'etichetta libera (vedi [docs/measurements.md](../measurements.md)). L'app non calcola nessuna lunghezza, perché le scene non hanno dati di scala.

## Cosa non si può fare
Una panoramica equirettangolare dà per ogni pixel una **direzione** dalla camera, ma nessuna **distanza**. Conoscere una misura fissa la scala solo se si conosce già la geometria 3D, e da un'unica foto la geometria non si ricava. Due punti qualsiasi, per esempio lo spigolo di un mobile e un quadro, possono stare a qualunque distanza.

**Misurare oggetti qualsiasi, o lontani, da una sola foto non è fattibile.**

## Cosa si può fare: punti sul pavimento e verticali
Basta aggiungere due ipotesi, entrambe quasi sempre vere nei nostri casi:
1. il pavimento è piano;
2. la panoramica è in bolla. Le camere 360 la livellano con l'IMU.

Con queste, ogni punto cliccato **sul pavimento** ha una posizione 3D precisa. Se `h` è l'altezza della camera e `θ` l'angolo sotto l'orizzonte (`-pitch`):

```
distanza orizzontale d = h / tan(θ)
posizione = (d·sin(yaw), d·cos(yaw))
```

Un punto **sulla verticale** di un punto a terra, come lo spigolo tra due muri o lo stipite di una porta, ha altezza `z = h + d·tan(φ)`, dove `φ` è l'elevazione del punto.

**Calibrazione:** una misura nota fatta a terra, o una verticale nota con il piede a terra, serve a ricavare `h` per la scena. Con `h` noto si calcolano:
- larghezza e lunghezza della stanza, cliccando dove il muro tocca il pavimento;
- larghezza delle porte;
- altezza del soffitto e dei vani.

"Automatico" qui vuol dire che il **valore** si calcola da solo. I due estremi li clicca comunque l'utente.

## L'errore
Il problema vero è il livellamento, non la precisione del clic:

| distanza dal punto camera | errore per 3px di clic (pano 8K) | errore per 1° di inclinazione |
|---|---|---|
| 2 m | ~1 cm | ~6 cm |
| 3 m | ~2 cm | ~13 cm |
| 6 m | ~7 cm | ~45 cm |

Per arrivare a questi numeri si è assunto `h` = 1,5 m. Vale `∂d/∂θ = -h / sin²θ`: l'errore cresce molto quando il punto si avvicina all'orizzonte. Entro 3–4 m dalla camera la stima è decente, oltre diventa inaffidabile.

Due modi per migliorare:
- l'utente corregge la bolla a mano;
- l'app stima inclinazione e rollio dalle linee verticali dell'immagine.

## Alternative più ambiziose (sconsigliate)
- **Ricostruzione del layout con ML** (HorizonNet, LGT-Net): stima i muri della stanza a meno della scala, che si fissa con la misura nota. Funziona su stanze pulite e quasi rettangolari, va in crisi con arredi, open space e forme irregolari.
- **Stima monoculare della profondità** (Depth Anything e simili): errori del 5–15%, non adatta a misure professionali.
- **Triangolazione tra più panoramiche**: le posizioni sulla planimetria ([02](02-planimetrie.md)) ci sono già, ma sono messe a mano e quindi troppo approssimative. Servirebbe una vera pipeline structure-from-motion, molto pesante.

## Proposta
- Una modalità "misura stimata", solo per punti a terra e verticali, calibrata su una misura nota della scena.
- Va mostrata **diversamente** dalle misure manuali, ad esempio con "≈" e un margine di errore che dipende dalla distanza.
- Il lavoro è contenuto: pura geometria, da aggiungere a `src/lib/measure-geometry.ts`. Non servono dipendenze, quindi funziona anche nei viewer esportati.
- Probabilmente servono nuovi campi nello schema, con il relativo bump di versione:
  - un tipo di misura (manuale, riferimento o stimata);
  - `h` per scena, oppure il riferimento alla misura di calibrazione.

## Prima di implementare: verifica sui dati veri
1. Scegliere 2–3 panoramiche delle nostre camere con diverse misure vere già note.
2. Scrivere uno script che ricalcola tutte le misure partendo da una sola.
3. Confrontare i risultati con i valori veri.

Così si misura l'errore reale e si decide se la funzione vale la pena.

## Prova sul progetto brixen (ottobre 2026)
- **Dati:** tre scene con due misure ciascuna, tutte a terra. I punti sono stati controllati sulla foto: tutti cadono nell'angolo tra muro e pavimento.
- **Panoramiche:** 2880×1440 px, cioè circa 0,125° per pixel.
- **Metodo:** per ogni scena si ricava l'altezza della camera da una misura e con quella si stima l'altra.

| scena | ripresa | misure | altezza ricavata | errore incrociato |
|---|---|---|---|---|
| E | treppiede a terra | 160 cm (estremi a 2,7–3,5 m), 445 cm (2,6–3,5 m) | 143 / 147 cm | **±2,7%** |
| B | treppiede a terra | 98 cm (porta a ~5 m), 120 cm (nicchia a 0,8–1,5 m) | 147 / 136 cm | **±8%** |
| D | treppiede **sopra una scrivania**, altezza non annotata | 160 cm (in profondità, 2,1–3,6 m), 120 cm (di traverso, ~4 m) | 185 / 217 cm | **−15% / +17%** |

**Lettura:**
- **E:** il caso buono. Camera a terra, in bolla, punti entro 3–4 m: errore di qualche percento.
- **B:** basta un'inclinazione di circa 1,1°, normale per una camera 360, per conciliare le due misure. Pesa sulla misura a 5 m e quasi niente su quella a 1 m. In alternativa, i punti cliccati sulla nicchia non coincidono con i punti misurati col metro.
- **D:** l'altezza ricavata dalla porta (217 cm) è compatibile con scrivania più treppiede, e con circa 2,2 m la misura di traverso torna entro il 2%. Quella in profondità invece uscirebbe circa 190 cm contro 160. Per conciliarle servirebbero 8–10° di inclinazione, che nella foto non c'è.
  - Restano due cause possibili: riferimenti presi diversamente dai punti cliccati, oppure lo sfalsamento tra le due lenti, perché il televisore è vicinissimo alla camera proprio in quella direzione.
  - Non si possono distinguere senza l'altezza vera della camera.

**Conclusioni:**
1. **L'altezza della camera non si può dare per nota**, nemmeno nello stesso tour. Va salvata per scena e, quando si conosce, va inserita come dato misurato e non ricavata.
2. **Con una sola misura di riferimento non c'è nessun controllo.** Con l'altezza annotata, oppure con due misure, l'app può confrontare stima e valore vero e avvisare quando divergono oltre una soglia (ad esempio il 5%). In D l'avviso sarebbe scattato, in E no.
3. **Le misure di traverso sono più affidabili di quelle in profondità.** Una misura di traverso scala la distanza in modo uniforme. Una misura in profondità somma gli errori dei due estremi, che stanno a distanze diverse.
4. **L'errore cresce molto oltre i 4 m**, soprattutto se la foto non è perfettamente in bolla.

## Regole per un rilievo
Perché le misure stimate siano affidabili, chi fa le foto deve seguire queste regole. Vanno scritte anche nella guida per i colleghi.

1. **Annotare sempre l'altezza della camera per ogni scena.** Si misura dal pavimento al centro delle lenti, non la lunghezza del treppiede. Se il treppiede sta su un mobile, si misura comunque dal pavimento.
2. **Treppiede a terra quando possibile.** Se serve alzarlo, ad esempio sopra una scrivania, annotarlo e misurare l'altezza come al punto 1.
3. **Camera in bolla.** Usare la livella del treppiede o della camera. 1° di inclinazione vale circa 13 cm di errore a 3 m e circa 45 cm a 6 m.
4. **Niente oggetti vicinissimi alla camera** (meno di 50 cm), soprattutto nelle direzioni in cui si vorrà misurare. Deformano la giunzione tra le due lenti.
5. **Almeno una misura di controllo col metro per scena**, a terra, entro 3–4 m dalla camera, meglio se di traverso. Annotare con precisione da dove a dove è stata presa: da muro a muro, da stipite a stipite, luce netta o telaio esterno.
6. **Foto alla risoluzione massima della camera.** A 2880 px un pixel vale circa 2 cm a 3 m.

**Ricadute sul piano:**
- nello schema serve un campo per scena con l'altezza della camera, misurata e inserita a mano;
- se il campo è presente, la misura di riferimento diventa un controllo e non una calibrazione;
- se l'altezza ricavata è fuori da un intervallo plausibile (ad esempio 1,0–1,8 m senza nota di ripresa rialzata), l'app avvisa.
