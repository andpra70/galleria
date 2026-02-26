// @ts-check
import { renderHud } from "./hud";

/** @returns {string} */
export function renderAppShell() {
  return `
    <canvas id="scene"></canvas>
    ${renderHud()}
  `;
}
