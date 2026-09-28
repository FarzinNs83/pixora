export function syncDesktopTheme(theme: 'light' | 'dark') {
  const hostWindow = window as Window & {
    chrome?: { webview?: { postMessage: (message: unknown) => void } };
  };
  hostWindow.chrome?.webview?.postMessage({
    source: 'pixora',
    type: 'theme',
    value: theme,
  });
}

export function openExternalProjectLink(url: string): boolean {
  const hostWindow = window as Window & {
    chrome?: { webview?: { postMessage: (message: unknown) => void } };
    webkit?: { messageHandlers?: { pixora?: { postMessage: (message: unknown) => void } } };
  };
  const message = { source: 'pixora', type: 'externalLink', value: url };
  if (hostWindow.chrome?.webview) {
    hostWindow.chrome.webview.postMessage(message);
    return true;
  }
  if (hostWindow.webkit?.messageHandlers?.pixora) {
    hostWindow.webkit.messageHandlers.pixora.postMessage(message);
    return true;
  }
  return false;
}
