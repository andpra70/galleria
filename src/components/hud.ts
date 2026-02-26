// @ts-check
import { renderVisualControls } from "./visualControls";
import { renderVisualGalleryPanels } from "./visualGalleryPanels";

/** @returns {string} */
export function renderHud() {
  return `
    <div id="hud">
      <svg id="drag-measure-overlay" aria-hidden="true"></svg>
      ${renderVisualControls()}
      ${renderVisualGalleryPanels()}
    </div>
  `;
}
