import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('project link configuration', () => {
  it('keeps unset or unsafe links non-clickable', async () => {
    vi.stubEnv('VITE_PIXORA_GITHUB_URL', 'javascript:alert(1)');
    vi.stubEnv('VITE_PIXORA_TELEGRAM_URL', '');
    const { projectLinkUrl } = await import('./project-links');
    expect(projectLinkUrl('github')).toBeUndefined();
    expect(projectLinkUrl('telegram')).toBeUndefined();
  });

  it('accepts configured HTTPS destinations and a support email', async () => {
    vi.stubEnv('VITE_PIXORA_GITHUB_URL', 'https://github.com/example/pixora');
    vi.stubEnv('VITE_PIXORA_SUPPORT_URL', 'mailto:hello@example.org');
    const { projectLinkUrl } = await import('./project-links');
    expect(projectLinkUrl('github')).toBe('https://github.com/example/pixora');
    expect(projectLinkUrl('support')).toBe('mailto:hello@example.org');
  });
});
