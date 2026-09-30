import type { ThemeTokens } from '../schema';

/**
 * The one theme's id. Demo.Root emits it as `data-demo-theme`, which the
 * theme CSS and `fonts.css` are scoped by.
 */
export const DEFAULT_DEMO_THEME_ID = 'default';

/** The theme's token defaults. Host tokens, then `theme.tokens`, override them. */
export const demoThemeDefaultTokens = {
  primary: '#5b6cff',
  secondary: '#ebebeb',
  radius: '10px',
  font: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
} satisfies ThemeTokens;
