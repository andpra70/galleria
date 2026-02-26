export function renderArtCard() {
  return `
    <aside id="art-card" aria-live="polite" hidden>
      <button id="art-card-close" type="button" aria-label="Chiudi scheda">×</button>
      <img id="art-card-image" alt="Anteprima opera" />
      <h2 id="art-card-title"></h2>
      <p id="art-card-description"></p>
      <div id="art-card-synoptic"></div>
      <hr/>
      <div id="art-edit-panel" hidden>
        <h2 id="art-card-title">Editor</h2>
        <label class="edit-field" for="art-edit-id">ID opera</label>
        <input id="art-edit-id" type="text" />
        <label class="edit-field" for="art-edit-title">Titolo</label>
        <input id="art-edit-title" type="text" />
        <label class="edit-field" for="art-edit-description">Descrizione</label>
        <textarea id="art-edit-description" rows="3"></textarea>
        <label class="edit-field" for="art-edit-offset-cm">Offset parete (cm)</label>
        <input id="art-edit-offset-cm" type="number" min="0" max="100000" step="1" />
        <label class="edit-field" for="art-edit-width-cm">Larghezza opera (cm)</label>
        <input id="art-edit-width-cm" type="number" min="1" max="10000" step="1" />
        <label class="edit-field" for="art-edit-height-cm">Altezza opera (cm)</label>
        <input id="art-edit-height-cm" type="number" min="1" max="10000" step="1" readonly title="Calcolata automaticamente dal ratio immagine" />
        <label class="edit-field" for="art-edit-frame-border-cm">Spessore bordo (cm)</label>
        <input id="art-edit-frame-border-cm" type="number" min="0" max="1000" step="1" />
        <label class="edit-field" for="art-edit-frame-color">Colore bordo</label>
        <input id="art-edit-frame-color" type="color" value="#423934" />
        <label class="edit-field" for="art-edit-center-y-cm">Centro opera da pavimento (cm)</label>
        <input id="art-edit-center-y-cm" type="number" min="1" max="10000" step="1" />
        <label class="edit-field" for="art-edit-image-url">URL immagine</label>
        <input id="art-edit-image-url" type="text" />
        <label class="edit-field">Synopsis</label>
        <div id="art-edit-synopsis-list"></div>
        <button id="art-edit-synopsis-add" type="button">+ Aggiungi campo</button>
        <div id="art-edit-actions">
          <button id="art-edit-move-left" type="button">← Sinistra</button>
          <button id="art-edit-move-right" type="button">Destra →</button>
          <button id="art-edit-move-up" type="button">↑ Alto</button>
          <button id="art-edit-move-down" type="button">Basso ↓</button>
          <button id="art-edit-delete" type="button">Elimina quadro</button>
        </div>
        <hr/>
        <label class="edit-field" for="art-edit-room">Stanza</label>
        <select id="art-edit-room"></select>
        <label class="edit-field" for="art-edit-room-width-cm">Stanza larghezza (cm)</label>
        <input id="art-edit-room-width-cm" type="number" min="100" max="50000" step="1" />
        <label class="edit-field" for="art-edit-room-depth-cm">Stanza profondita (cm)</label>
        <input id="art-edit-room-depth-cm" type="number" min="100" max="50000" step="1" />
        <label class="edit-field" for="art-edit-room-height-cm">Stanza altezza (cm)</label>
        <input id="art-edit-room-height-cm" type="number" min="180" max="2000" step="1" />
        <label class="edit-field" for="art-edit-wall">Parete</label>
        <select id="art-edit-wall">
          <option value="north">north</option>
          <option value="south">south</option>
          <option value="west">west</option>
          <option value="east">east</option>
        </select>
        <hr/>
        <hr/>
        <hr/>
        <hr/>
        <hr/>
      </div>
    </aside>
  `;
}
