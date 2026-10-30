const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function readableTextOn(hex: string): '#ffffff' | '#111111' {
  const luminance = relativeLuminance(hex);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithDark = (luminance + 0.05) / (relativeLuminance('#111111') + 0.05);
  return contrastWithWhite >= contrastWithDark ? '#ffffff' : '#111111';
}

export function brandStyles(primaryColor: string | null): string | null {
  if (!primaryColor || !HEX_COLOR.test(primaryColor)) {
    return null;
  }
  const color = primaryColor.toLowerCase();
  return `[data-storefront]{--primary:${color};--primary-foreground:${readableTextOn(color)};--ring:${color}}`;
}
