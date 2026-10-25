export interface WindowBounds { left: number; top: number; width: number; height: number }

/** Place the reader inside the source display, including negative monitor origins. */
export function readerWindowBounds(source: WindowBounds, area: WindowBounds): WindowBounds {
  const width = Math.min(420, area.width);
  const height = Math.min(600, area.height);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
  return {
    width, height,
    left: Math.round(clamp(source.left + source.width - width - 16, area.left, area.left + area.width - width)),
    top: Math.round(clamp(source.top + 64, area.top, area.top + area.height - height)),
  };
}
