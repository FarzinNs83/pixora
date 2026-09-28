export type ProjectLinkId = 'github' | 'telegram' | 'support';

const configuredLinks: Record<ProjectLinkId, string | undefined> = {
  github: import.meta.env.VITE_PIXORA_GITHUB_URL,
  telegram: import.meta.env.VITE_PIXORA_TELEGRAM_URL,
  support: import.meta.env.VITE_PIXORA_SUPPORT_URL,
};

export function projectLinkUrl(id: ProjectLinkId): string | undefined {
  const input = configuredLinks[id]?.trim();
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return url.href;
    if (id === 'support' && url.protocol === 'mailto:' && url.pathname.includes('@')) return url.href;
  } catch {
    // An unset or malformed link must never become a clickable placeholder.
  }
  return undefined;
}
