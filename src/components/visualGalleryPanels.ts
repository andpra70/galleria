// @ts-check
import { renderArtCard } from './artCard';
import { renderFilmstrip } from './filmstrip';

/** @returns {string} */
export function renderVisualGalleryPanels() {
  return `${renderArtCard()}${renderFilmstrip()}`;
}
