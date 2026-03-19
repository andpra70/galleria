// @ts-check
import { renderHud } from "./hud";
import { renderConfigPanel } from "./configPanel";

/** @returns {string} */
export function renderAppShell() {
  return `
    <div id="app-shell">
      <aside id="config-panel-container" aria-label="Container configurazione">
        ${renderConfigPanel()}
      </aside>
      <section id="gallery-panel-container" aria-label="Container galleria">
        <canvas id="scene"></canvas>
        ${renderHud()}
      </section>
      <div id="toast-host" aria-live="polite" aria-atomic="true"></div>
    </div>
  `;
}
