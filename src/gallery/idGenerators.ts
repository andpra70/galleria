export function generateWallId(walls: Array<{ id?: string }> = []): string {
  let i = walls.length + 1;
  while (walls.some((wall) => wall.id === `wall_${i}`)) {
    i += 1;
  }
  return `wall_${i}`;
}

export function generatePaintingId(
  paintings: Array<{ id?: string }>,
  paintingRegistry: { has(id: string): boolean }
): string {
  let i = paintings.length + 1;
  while (paintings.some((p) => p.id === `new_${i}`) || paintingRegistry.has(`new_${i}`)) {
    i += 1;
  }
  return `new_${i}`;
}
