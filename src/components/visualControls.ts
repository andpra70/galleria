// @ts-check
import { renderHelpPanel } from './helpPanel';
import { renderMapTools } from './mapTools';

/** @returns {string} */
export function renderVisualControls() {
  return `${renderHelpPanel()}${renderMapTools()}`;
}
