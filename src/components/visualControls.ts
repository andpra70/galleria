// @ts-check
import { renderConfigPanel } from './configPanel';
import { renderMapTools } from './mapTools';

/** @returns {string} */
export function renderVisualControls() {
  return `${renderConfigPanel()}${renderMapTools()}`;
}
