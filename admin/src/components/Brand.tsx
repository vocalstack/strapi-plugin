import { useTheme } from 'styled-components'

import { BRAND, LOGO_DARK, LOGO_LIGHT } from './brandAssets'

/** Whether Strapi shows its dark theme: its lightest surface is dark. */
export function useDark(): boolean {
  const theme = useTheme() as { colors?: { neutral0?: string } } | undefined
  const hex = theme?.colors?.neutral0?.replace('#', '')
  if (!hex || hex.length < 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}

/** The accent colour for the current theme. */
export function useAccent(): string {
  return useDark() ? BRAND.lightBlue : BRAND.blue
}

/** The VocalStack wordmark, light or dark to match the admin's theme. */
export const Logo = ({ height = 16 }: { height?: number }) => {
  const dark = useDark()
  return (
    <span
      aria-label="VocalStack"
      dangerouslySetInnerHTML={{ __html: (dark ? LOGO_DARK : LOGO_LIGHT).replace('<svg ', `<svg style="height:${height}px;width:auto;display:block" `) }}
      role="img"
      style={{ display: 'inline-flex', lineHeight: 0 }}
    />
  )
}
