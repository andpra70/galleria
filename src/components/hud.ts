// @ts-check
import { renderMapTools } from "./mapTools";
import { renderVisualGalleryPanels } from "./visualGalleryPanels";

/** @returns {string} */
export function renderHud() {
  return `
    <div id="hud">
      <svg id="drag-measure-overlay" aria-hidden="true"></svg>
      ${renderMapTools()}
      ${renderVisualGalleryPanels()}
    </div>
  `;
}
