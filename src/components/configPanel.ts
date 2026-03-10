export function renderConfigPanel() {
  return `
    <section id="config-panel" aria-label="Configurazione mostra">
      <div id="config-toolbar" role="toolbar" aria-label="Import export configurazione">
        <button id="load-catalog-json" type="button" title="Importa catalogo">⭳ Import</button>
        <button id="save-show-json" type="button" title="Esporta configurazione">⭱ Export</button>
        <button id="edit-mode-toggle" type="button" aria-pressed="false">✎ Edit: OFF</button>
      </div>

      <div id="config-tabs" role="tablist" aria-label="Sezioni configurazione mostra">
        <button type="button" class="config-tab active" role="tab" aria-selected="true" data-config-tab="intro">Introduzione</button>
        <button type="button" class="config-tab" role="tab" aria-selected="false" data-config-tab="when">Quando</button>
        <button type="button" class="config-tab" role="tab" aria-selected="false" data-config-tab="where">Dove</button>
        <button type="button" class="config-tab" role="tab" aria-selected="false" data-config-tab="gallery-map">Mappa galleria</button>
      </div>

      <div class="config-tab-panel active" data-config-tab-panel="intro" role="tabpanel">
        <label class="config-field">
          <span>Descrizione mostra (Markdown)</span>
          <textarea id="config-intro-md" rows="9" placeholder="# Introduzione mostra"></textarea>
        </label>
      </div>

      <div class="config-tab-panel" data-config-tab-panel="when" role="tabpanel" hidden>
        <label class="config-field">
          <span>Data inizio</span>
          <input id="config-when-start-date" type="date" />
        </label>
        <label class="config-field">
          <span>Data fine</span>
          <input id="config-when-end-date" type="date" />
        </label>
        <div id="config-when-calendar-card" aria-label="Calendario periodo mostra">
          <div id="config-when-calendar-header">
            <button id="config-when-calendar-prev" type="button" aria-label="Mese precedente">◀</button>
            <strong id="config-when-calendar-label"></strong>
            <button id="config-when-calendar-next" type="button" aria-label="Mese successivo">▶</button>
          </div>
          <div id="config-when-calendar-weekdays" aria-hidden="true">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mer</span>
            <span>Gio</span>
            <span>Ven</span>
            <span>Sab</span>
            <span>Dom</span>
          </div>
          <div id="config-when-calendar-grid" role="grid" aria-label="Giorni del mese"></div>
          <div id="config-when-calendar-range-label" aria-live="polite"></div>
        </div>
        <label class="config-field">
          <span>whenText (Markdown)</span>
          <textarea id="config-when-text-md" rows="7" placeholder="## Quando&#10;Orari, turni, note temporali"></textarea>
        </label>
      </div>

      <div class="config-tab-panel" data-config-tab-panel="where" role="tabpanel" hidden>
        <div class="config-inline-action">
          <label class="config-field">
            <span>Indirizzo completo</span>
            <input id="config-where-address" type="text" placeholder="Via, numero, CAP, citta, paese" />
          </label>
          <button id="config-where-search" type="button">Cerca</button>
        </div>
        <label class="config-field">
          <span>doveText (Markdown)</span>
          <textarea id="config-where-text-md" rows="7" placeholder="## Dove&#10;Come arrivare, accessibilita, parcheggi"></textarea>
        </label>
        <div id="config-where-map" aria-label="Mappa luogo mostra"></div>
        <div class="config-inline-fields">
          <label class="config-field">
            <span>Lat</span>
            <input id="config-where-lat" type="number" step="0.000001" />
          </label>
          <label class="config-field">
            <span>Lng</span>
            <input id="config-where-lng" type="number" step="0.000001" />
          </label>
        </div>
      </div>

      <div class="config-tab-panel" data-config-tab-panel="gallery-map" role="tabpanel" hidden>
        <div id="config-gallery-map-toolbar">
          <button type="button" class="config-map-tool active" data-map-tool="room" title="Disegna o sposta stanza">▭ Stanza</button>
          <button type="button" class="config-map-tool" data-map-tool="wall" title="Disegna muro">┃ Muro</button>
          <button type="button" class="config-map-tool" data-map-tool="opening" title="Aggiungi apertura">⊔ Apertura</button>
          <button type="button" class="config-map-tool danger" data-map-tool="delete-opening" title="Rimuovi apertura">⌫ Apertura</button>
          <button type="button" class="config-map-tool danger" data-map-tool="delete-wall" title="Rimuovi muro custom">⌦ Muro</button>
          <button type="button" class="config-map-toggle active" id="config-map-toggle-snap" aria-pressed="true" title="Snap a griglia 20cm">▦ Snap</button>
          <button type="button" class="config-map-toggle active" id="config-map-toggle-magnet" aria-pressed="true" title="Magnet a elementi vicini">⌖ Magnet</button>
          <button type="button" id="config-map-delete-room" disabled title="Elimina stanza selezionata">⌫ Stanza</button>
          <span class="config-map-snap">Griglia: 20 cm</span>
        </div>

        <div class="config-inline-fields">
          <label class="config-field">
            <span>H muro (cm)</span>
            <input id="config-map-wall-height-cm" type="number" step="10" min="100" value="300" />
          </label>
          <label class="config-field">
            <span>Spessore muro (cm)</span>
            <input id="config-map-wall-thickness-cm" type="number" step="1" min="5" value="16" />
          </label>
        </div>

        <div class="config-inline-fields">
          <label class="config-field">
            <span>Tipo apertura</span>
            <select id="config-map-opening-type">
              <option value="door">Porta</option>
              <option value="window">Finestra</option>
              <option value="opening">Apertura</option>
            </select>
          </label>
          <label class="config-field">
            <span>Larghezza apertura (cm)</span>
            <input id="config-map-opening-width-cm" type="number" step="5" min="20" value="120" />
          </label>
        </div>

        <div class="config-inline-fields">
          <label class="config-field">
            <span>Base apertura (cm)</span>
            <input id="config-map-opening-base-cm" type="number" step="5" min="0" value="0" />
          </label>
          <label class="config-field">
            <span>Altezza apertura (cm)</span>
            <input id="config-map-opening-height-cm" type="number" step="5" min="20" value="220" />
          </label>
        </div>

        <div id="config-gallery-map-editor-wrap">
          <svg id="config-gallery-map-editor" aria-label="Editor mappa galleria"></svg>
        </div>
      </div>

    </section>
  `;
}
