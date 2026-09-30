import type { Brand, DemoBrand, ThemeTokens } from '../schema';

import { demoThemeCss } from "./default";
import { DEFAULT_DEMO_THEME_ID, demoThemeDefaultTokens } from "./token-defaults";

export { DEFAULT_DEMO_THEME_ID } from "./token-defaults";

export type DemoThemeConfig = {
    /**
     * @deprecated Theme presets were removed; there is one theme. Accepted
     * so older configs still load, and ignored.
     */
    preset?: string;
    tokens?: Partial<ThemeTokens>;
} | null | undefined;

export type HostThemeConfig = {
    /**
     * @deprecated Theme presets were removed; there is one theme. Accepted
     * and ignored.
     */
    theme?: string;
    tokens?: Partial<ThemeTokens>;
    /**
     * Host-level brand. `resolveDemoBrand` keeps only player-safe identity
     * fields (logo / wordmark / logoHref), so host CTAs never enter player
     * chrome.
     */
    brand?: Brand | null;
} | null | undefined;

export type ResolvedDemoTheme = {
    /** Always `"default"`: the value Demo.Root emits as `data-demo-theme`. */
    themeId: string;
    tokens: ThemeTokens;
    /** The theme's CSS, scoped to `[data-demo-theme="default"]`. */
    css: string;
};

/**
 * The theme's tokens and CSS. Tokens cascade: the theme's defaults, then
 * host tokens, then the demo's `theme.tokens`. A preset named by the demo or
 * the host is ignored.
 */
export function resolveDemoTheme({
    demoTheme,
    host,
}: {
    demoTheme?: DemoThemeConfig;
    host?: HostThemeConfig;
    /** @deprecated Theme presets were removed; ignored. */
    fallbackThemeId?: string;
} = {}): ResolvedDemoTheme {
    return {
        themeId: DEFAULT_DEMO_THEME_ID,
        tokens: {
            ...demoThemeDefaultTokens,
            ...(host?.tokens ?? {}),
            ...(demoTheme?.tokens ?? {}),
        },
        css: demoThemeCss,
    };
}

export function extractDemoTheme(config: unknown): DemoThemeConfig {
    if (config === null || typeof config !== "object") return null;
    const theme = (config as { theme?: unknown }).theme;
    if (!theme || typeof theme !== "object") return null;

    const obj = theme as { preset?: unknown; tokens?: unknown };
    return {
        preset: typeof obj.preset === "string" ? obj.preset : undefined,
        tokens:
            obj.tokens && typeof obj.tokens === "object"
                ? (obj.tokens as Partial<ThemeTokens>)
                : undefined,
    };
}

export function extractDemoBrand(config: unknown): DemoBrand | undefined {
    if (config === null || typeof config !== "object") return undefined;
    const theme = (config as { theme?: unknown }).theme;
    if (!theme || typeof theme !== "object") return undefined;
    const brand = (theme as { brand?: unknown }).brand;
    if (!brand || typeof brand !== "object") return undefined;
    return brand as DemoBrand;
}

/**
 * Merge host-level brand identity under a per-demo brand override (per-field,
 * demo wins). Only identity fields are eligible for player chrome.
 * Returns `undefined` when neither side contributes a field so callers can
 * omit `theme.brand` entirely.
 */
export function resolveDemoBrand({
    demoBrand,
    hostBrand,
}: {
    demoBrand?: DemoBrand | null;
    hostBrand?: Brand | null;
}): DemoBrand | undefined {
    const merged: Record<string, unknown> = {};
    const identityKeys = new Set(['logo', 'name', 'logoHref']);
    for (const src of [hostBrand, demoBrand]) {
        if (!src || typeof src !== "object") continue;
        for (const [key, value] of Object.entries(src)) {
            if (!identityKeys.has(key)) continue;
            if (value !== undefined) merged[key] = value;
        }
    }
    return Object.keys(merged).length > 0
        ? (merged as DemoBrand)
        : undefined;
}

export function injectResolvedThemeIntoConfig<T>(
    config: T,
    tokens: ThemeTokens,
    brand?: DemoBrand,
): T {
    if (config === null || typeof config !== "object") return config;
    const obj = config as Record<string, unknown>;
    const existingTheme =
        obj.theme && typeof obj.theme === "object"
            ? (obj.theme as Record<string, unknown>)
            : {};

    return {
        ...obj,
        theme: {
            ...existingTheme,
            tokens,
            ...(brand ? { brand } : {}),
        },
    } as T;
}
