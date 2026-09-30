import { describe, expect, it } from 'vitest';
import {
  demoThemeDefaultTokens,
  extractDemoTheme,
  injectResolvedThemeIntoConfig,
  resolveDemoBrand,
  resolveDemoTheme,
} from '../src/themes';

describe('demoThemeDefaultTokens', () => {
  it('exposes the 4 token fields', () => {
    expect(demoThemeDefaultTokens.primary).toBe('#5b6cff');
    expect(demoThemeDefaultTokens.secondary).toBeDefined();
    expect(demoThemeDefaultTokens.font).toBeDefined();
    expect(demoThemeDefaultTokens.radius).toBeDefined();
  });
});

describe('resolveDemoBrand', () => {
  it('merges only identity fields into the player brand', () => {
    const resolved = resolveDemoBrand({
      hostBrand: {
        name: 'Host Brand',
        logo: 'public/logo.svg',
        logoHref: 'https://example.com',
        favicon: 'public/favicon.svg',
        cta: { label: 'Try', href: 'https://example.com/try' },
        secondaryCta: { label: 'Docs', href: 'https://example.com/docs' },
      },
      demoBrand: {
        name: 'Demo Brand',
      },
    });

    expect(resolved).toEqual({
      name: 'Demo Brand',
      logo: 'public/logo.svg',
      logoHref: 'https://example.com',
    });
  });
});

describe('resolveDemoTheme', () => {
  it('uses default tokens and css by default', () => {
    const resolved = resolveDemoTheme();

    expect(resolved.themeId).toBe('default');
    expect(resolved.tokens.primary).toBe('#5b6cff');
    expect(resolved.css).toContain('[data-demo-theme="default"]');
  });

  it('cascades theme tokens, host tokens, then demo tokens', () => {
    const resolved = resolveDemoTheme({
      host: {
        tokens: {
          primary: '#111111',
          secondary: '#222222',
        },
      },
      demoTheme: {
        tokens: {
          primary: '#333333',
          radius: '24px',
        },
      },
    });

    expect(resolved.tokens.primary).toBe('#333333');
    expect(resolved.tokens.secondary).toBe('#222222');
    expect(resolved.tokens.radius).toBe('24px');
    expect(resolved.tokens.font).toBe(demoThemeDefaultTokens.font);
  });

  it('ignores a preset from the demo or the host', () => {
    for (const resolved of [
      resolveDemoTheme({ demoTheme: { preset: 'mono' } }),
      resolveDemoTheme({ host: { theme: 'mono' } }),
      resolveDemoTheme({ demoTheme: { preset: 'missing-theme' }, fallbackThemeId: 'mono' }),
    ]) {
      expect(resolved).toEqual(resolveDemoTheme());
    }
  });

  it('extracts and injects resolved tokens without dropping the preset', () => {
    const config = {
      id: 'demo',
      theme: {
        preset: 'mono',
        tokens: { primary: '#123456' },
      },
    };
    const resolved = resolveDemoTheme({
      demoTheme: extractDemoTheme(config),
    });

    expect(resolved.tokens.primary).toBe('#123456');
    expect(injectResolvedThemeIntoConfig(config, resolved.tokens)).toEqual({
      id: 'demo',
      theme: {
        preset: 'mono',
        tokens: {
          ...demoThemeDefaultTokens,
          primary: '#123456',
        },
      },
    });
  });

  it('carries only player-scoped css', () => {
    const { css } = resolveDemoTheme();
    expect(css).toContain('[data-demo-theme="default"]');
    expect(css).not.toMatch(/data-demo-theme="(?!default")/);
    expect(css).not.toMatch(/hub-index|inkly|http/i);
  });
});
