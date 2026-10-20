# Misure stimate dalla foto, calibrate su una misura nota

> **Stato: da valutare.** Richiesta dei colleghi: inserita a mano una misura, l'app potrebbe "misurare" da sola le altre partendo dalla foto? Qui sotto la valutazione di fattibilità. Prima di scrivere codice va fatta la verifica descritta in fondo.

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
