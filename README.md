# Galleria d'Arte Virtuale (Three.js + Vite)

Applicazione web di galleria virtuale configurata da file JSON, con rendering Three.js e build Vite.

## Avvio locale

```bash
cd /home/andrea/devel/progetti/miei/ai/opencode/galleria
npm install
npm run dev
```

Build produzione:

```bash
npm run build
npm run preview
```

## Container

```bash
docker compose up --build
```
http://localhost:6060/

## Configurazione

Modifica `public/config/gallery.json`:

- `rooms`: stanze della galleria.
  - supporta campi in metri (`width/depth/height`) e in centimetri (`widthCm/depthCm/heightCm`).
- `paintings`: opere su parete.
  - supporta dimensioni in cm (`widthCm/heightCm`) oltre ai campi legacy.
- `visitor`: posizione iniziale e parametri di movimento.
- `rendering`: colori, luce e texture pavimento.

## Modalita Edit

- `Edit: OFF`: sola navigazione e card in sola lettura.
- `Edit: ON`: modifica opere (card + filmstrip).

In `Edit: ON`:

- campi opera editabili inline nella card (senza pulsante Applica)
- dimensioni opera in cm
- drop immagine direttamente sull'immagine della card
- doppio click su parete per aggiungere nuova opera
- handle/comandi per muovere o eliminare opere

Nota: l'editor mappa/stanze e' stato rimosso. La minimappa resta in sola visualizzazione/navigazione (click per spostarsi).

## Controlli

- Trascina con mouse sinistro: guarda intorno
- Click su quadro: avvicinati / apri card se sei gia vicino
- Doppio click sul pavimento: spostati in quel punto
- Doppio click su parete (solo edit): aggiungi nuova opera
- Rotella mouse: avvicina/allontana
- Click minimappa: naviga verso il punto cliccato

## Struttura

- `index.html`: shell Vite
- `src/main.js`: bootstrap UI + caricamento app
- `src/galleryApp.js`: orchestrazione principale (modularizzata)
- `src/gallery/*.js`: moduli logici (minimappa, navigation, editor, world builder, ecc.)
- `src/components/*.js`: componenti HTML del layout/HUD
- `public/config/gallery.json`: configurazione mostra
- `public/assets/`: immagini e texture
