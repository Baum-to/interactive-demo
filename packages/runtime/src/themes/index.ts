/**
 * The demo theme.
 *
 * The headless player ships structural CSS, layout primitives, and the
 * data hooks required for theming. There is one theme: its token defaults
 * and its CSS live here. Tokens (`primary`, `secondary`, `font`, `radius`)
 * are the customization point; host tokens and a demo's `theme.tokens`
 * override the defaults.
 *
 * The theme's CSS is a string the host injects in a `<style>` tag, scoped
 * by the `data-demo-theme="default"` attribute on the player root.
 * `player.js` injects it on a static page.
 *
 * Consumers import from the `./themes` subpath:
 *   import { resolveDemoTheme } from "@inkly-org/interactive-demo/themes";
 */

export { demoThemeDefaultTokens } from "./token-defaults";
export {
    DEFAULT_DEMO_THEME_ID,
    extractDemoBrand,
    extractDemoTheme,
    injectResolvedThemeIntoConfig,
    resolveDemoBrand,
    resolveDemoTheme,
    type DemoThemeConfig,
    type HostThemeConfig,
    type ResolvedDemoTheme,
} from "./resolve";
