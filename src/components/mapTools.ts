export function renderMapTools() {
  const minimapHeightPx = 120;
  const minimapBufferWidthPx = 700;
  return `
    <canvas
      id="minimap"
      width="${minimapBufferWidthPx}"
      height="${minimapHeightPx}"
      aria-label="Minimappa dall'alto"
    ></canvas>
    <div id="map-tools">
    </div>
  `;
}
