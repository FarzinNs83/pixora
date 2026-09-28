import { afterEach, describe, expect, it, vi } from 'vitest';

import { openExternalProjectLink } from './desktop-bridge';

afterEach(() => Reflect.deleteProperty(window, 'chrome'));

describe('desktop project links', () => {
  it('uses the native WebView bridge when available', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'chrome', { configurable: true, value: { webview: { postMessage } } });
    expect(openExternalProjectLink('https://github.com/example/project')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      source: 'pixora', type: 'externalLink', value: 'https://github.com/example/project',
    });
  });

  it('lets an ordinary browser open external links in a new tab', () => {
    expect(openExternalProjectLink('https://github.com/example/project')).toBe(false);
  });
});
