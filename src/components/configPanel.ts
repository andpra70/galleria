export function renderConfigPanel() {
  return `
    <section id="config-panel" aria-label="Configurazione mostra">
      <div id="config-toolbar" role="toolbar" aria-label="Import export configurazione">
        <details id="config-actions-menu" class="config-actions-menu">
          <summary id="config-actions-menu-toggle" aria-label="Menu configurazione">☰ Menu</summary>
          <div class="config-actions-menu-list" role="menu" aria-label="Azioni configurazione">
            <button id="config-save-local" type="button" role="menuitem" title="Salva configurazione in IndexedDB locale">Salva</button>
            <button id="config-load-local" type="button" role="menuitem" title="Carica configurazione da IndexedDB locale">Carica</button>
            <button id="config-export-json" type="button" role="menuitem" title="Esporta mostra.json">Esporta JSON</button>
            <button id="config-import-json" type="button" role="menuitem" title="Importa mostra.json">Importa JSON</button>
            <button id="config-import-catalog-json" type="button" role="menuitem" title="Importa catalogo.json da file locale">Importa catalogo JSON</button>
          </div>
        </details>
        <button id="edit-mode-toggle" type="button" aria-pressed="false">✎ Edit: OFF</button>
      </div>

      <div id="config-editor-shell" hidden>
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
          <div id="config-gallery-map-toolbar" role="tablist" aria-label="Elementi mappa galleria">
            <button
              type="button"
              class="config-map-tool active"
              data-map-tool="room"
              data-gallery-map-subtab="room"
              aria-selected="true"
              title="Disegna o sposta stanza"
            >
              ▭ Stanza
            </button>
            <button
              type="button"
              class="config-map-tool"
              data-map-tool="wall"
              data-gallery-map-subtab="wall"
              aria-selected="false"
              title="Disegna muro"
            >
              ┃ Muro
            </button>
            <button
              type="button"
              class="config-map-tool"
              data-map-tool="opening"
              data-gallery-map-subtab="opening"
              aria-selected="false"
              title="Aggiungi apertura"
            >
              ⊔ Apertura
            </button>
            <button
              type="button"
              class="config-map-subtab"
              data-gallery-map-subtab="camera"
              aria-selected="false"
              title="Modifica start e target camera"
            >
              ◎ Camera
            </button>
            <button
              type="button"
              class="config-map-subtab"
              data-gallery-map-subtab="lights"
              aria-selected="false"
              title="Gestione luci galleria"
            >
              ✶ Luci
            </button>
            <button
              type="button"
              class="config-map-subtab"
              data-gallery-map-subtab="path"
              aria-selected="false"
              title="Definisci path camera"
            >
              ↝ Path
            </button>
            <button type="button" class="config-map-toggle active" id="config-map-toggle-snap" aria-pressed="true" title="Snap a griglia 20cm">▦ Snap</button>
            <button type="button" class="config-map-toggle active" id="config-map-toggle-magnet" aria-pressed="true" title="Magnet a elementi vicini">⌖ Magnet</button>
            <button type="button" class="config-map-toggle" id="config-map-reset-view" title="Reset pan/zoom su mappa completa">↺ Vista</button>
            <span class="config-map-snap">Griglia: 20 cm</span>
          </div>

          <div id="config-gallery-map-editor-wrap">
            <svg id="config-gallery-map-editor" aria-label="Editor mappa galleria"></svg>
          </div>

          <div id="config-gallery-map-inspector">
            <div class="config-gallery-map-subtab-panel active" data-gallery-map-subtab-panel="room" role="tabpanel">
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Colore pavimento</span>
                  <input id="config-map-floor-color" type="color" value="#c7c7c7" />
                </label>
                <label class="config-field">
                  <span>Colore pareti</span>
                  <input id="config-map-wall-color" type="color" value="#ffffff" />
                </label>
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
                  <span>Distanza minima da parete con opere (m)</span>
                  <input id="config-map-min-painting-distance-m" type="number" step="0.05" min="0.2" max="5" value="1.35" />
                </label>
              </div>
            </div>

            <div class="config-gallery-map-subtab-panel" data-gallery-map-subtab-panel="wall" role="tabpanel" hidden>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>H muro (cm)</span>
                  <input id="config-map-wall-height-cm-wall" type="number" step="10" min="100" value="300" />
                </label>
                <label class="config-field">
                  <span>Spessore muro (cm)</span>
                  <input id="config-map-wall-thickness-cm-wall" type="number" step="1" min="5" value="16" />
                </label>
              </div>
            </div>

            <div class="config-gallery-map-subtab-panel" data-gallery-map-subtab-panel="opening" role="tabpanel" hidden>
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
            </div>

            <div class="config-gallery-map-subtab-panel" data-gallery-map-subtab-panel="camera" role="tabpanel" hidden>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>FOV camera (deg)</span>
                  <input id="config-camera-fov" type="number" min="20" max="120" step="1" />
                </label>
                <button id="config-camera-capture-view" type="button" title="Salva posizione e target della vista corrente">
                  Usa vista corrente
                </button>
              </div>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Start X (m)</span>
                  <input id="config-camera-start-x" type="number" step="0.01" />
                </label>
                <label class="config-field">
                  <span>Start Y (m)</span>
                  <input id="config-camera-start-y" type="number" step="0.01" />
                </label>
              </div>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Start Z (m)</span>
                  <input id="config-camera-start-z" type="number" step="0.01" />
                </label>
                <label class="config-field">
                  <span>Target X (m)</span>
                  <input id="config-camera-target-x" type="number" step="0.01" />
                </label>
              </div>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Target Y (m)</span>
                  <input id="config-camera-target-y" type="number" step="0.01" />
                </label>
                <label class="config-field">
                  <span>Target Z (m)</span>
                  <input id="config-camera-target-z" type="number" step="0.01" />
                </label>
              </div>
            </div>

            <div class="config-gallery-map-subtab-panel" data-gallery-map-subtab-panel="lights" role="tabpanel" hidden>
              <div id="config-gallery-light-toolbar">
                <span class="config-map-snap">Target: opera selezionata</span>
              </div>

              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Opera target</span>
                  <select id="config-map-light-target-painting">
                    <option value="">Nessuna opera</option>
                  </select>
                </label>
                <label class="config-field">
                  <span>Altezza luce (cm)</span>
                  <input id="config-map-light-height-cm" type="number" step="10" min="120" value="290" />
                </label>
              </div>

              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Intensita</span>
                  <input id="config-map-light-intensity" type="number" step="0.5" min="0" value="8" />
                </label>
                <label class="config-field">
                  <span>Angolo spot (deg)</span>
                  <input id="config-map-light-angle-deg" type="number" step="1" min="5" max="80" value="28" />
                </label>
              </div>

              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Distanza (m)</span>
                  <input id="config-map-light-distance-m" type="number" step="0.5" min="1" max="30" value="12" />
                </label>
                <label class="config-field">
                  <span>Penumbra</span>
                  <input id="config-map-light-penumbra" type="number" step="0.05" min="0" max="1" value="0.22" />
                </label>
              </div>
            </div>

            <div class="config-gallery-map-subtab-panel" data-gallery-map-subtab-panel="path" role="tabpanel" hidden>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Tempo walk per tratto (s)</span>
                  <input id="config-map-path-walk-seconds" type="number" min="0.2" step="0.1" value="4" />
                </label>
                <label class="config-field">
                  <span>Sosta su opera (s)</span>
                  <input id="config-map-path-stop-seconds" type="number" min="0" step="0.1" value="1.5" />
                </label>
              </div>
              <div class="config-inline-fields">
                <label class="config-field">
                  <span>Apri scheda opera</span>
                  <input id="config-map-path-open-card" type="checkbox" checked />
                </label>
                <label class="config-field">
                  <span>Tempo scheda (s)</span>
                  <input id="config-map-path-card-seconds" type="number" min="0" step="0.1" value="2.5" />
                </label>
              </div>
              <div class="config-inline-fields">
                <button id="config-map-path-add-point" type="button" title="Aggiungi keyframe su posizione osservatore">+ Keyframe</button>
                <button id="config-map-path-delete-point" type="button" title="Rimuovi keyframe selezionato">− Keyframe</button>
              </div>
              <div class="config-inline-fields">
                <button id="config-map-path-clear" type="button" title="Svuota tutto il path">Svuota path</button>
                <span id="config-map-path-status" class="config-map-snap">Nessun keyframe</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
