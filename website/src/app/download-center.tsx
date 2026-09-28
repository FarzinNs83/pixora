import { ArrowClockwise, CheckCircle, DownloadSimple, Trash, TrayArrowDown, X } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Language } from './i18n';

interface DownloadRequest {
  name: string;
  blob: Blob;
}

interface DownloadEntry extends DownloadRequest {
  id: string;
  createdAt: number;
}

interface DownloadCenterValue {
  entries: DownloadEntry[];
  downloadFile: (request: DownloadRequest) => void;
  redownload: (entry: DownloadEntry) => void;
  clear: () => void;
}

const DownloadCenterContext = createContext<DownloadCenterValue | null>(null);

export function DownloadCenterProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<DownloadEntry[]>([]);

  const triggerDownload = useCallback((request: DownloadRequest) => {
    const url = URL.createObjectURL(request.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = request.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const downloadFile = useCallback((request: DownloadRequest) => {
    triggerDownload(request);
    const entry: DownloadEntry = {
      ...request,
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
    };
    setEntries((current) => [entry, ...current].slice(0, 12));
  }, [triggerDownload]);

  const redownload = useCallback((entry: DownloadEntry) => {
    triggerDownload(entry);
    setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, createdAt: Date.now() } : item));
  }, [triggerDownload]);

  return (
    <DownloadCenterContext.Provider value={{ entries, downloadFile, redownload, clear: () => setEntries([]) }}>
      {children}
    </DownloadCenterContext.Provider>
  );
}

export function useDownloadCenter() {
  const value = useContext(DownloadCenterContext);
  if (!value) throw new Error('useDownloadCenter must be used inside DownloadCenterProvider.');
  return value;
}

export function DownloadCenterButton({ uiLanguage, placement }: { uiLanguage: Language; placement: 'sidebar' | 'mobile' }) {
  const { entries, redownload, clear } = useDownloadCenter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const copy = uiLanguage === 'fa'
    ? { label: 'دانلودها', title: 'دانلودهای اخیر', empty: 'هنوز فایلی دانلود نشده است.', again: 'دانلود دوباره', clear: 'پاک کردن فهرست', close: 'بستن' }
    : { label: 'Downloads', title: 'Recent downloads', empty: 'No files downloaded yet.', again: 'Download again', clear: 'Clear history', close: 'Close' };

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`download-center download-center-${placement}`} ref={rootRef}>
      <button
        className={entries.length ? 'download-center-trigger has-downloads' : 'download-center-trigger'}
        type="button"
        aria-label={copy.label}
        aria-expanded={open}
        aria-controls={`download-center-${placement}`}
        data-testid={`download-center-${placement}`}
        onClick={() => setOpen((value) => !value)}
      >
        <TrayArrowDown size={20} />
        {entries.length > 0 && <span className="download-count" aria-hidden="true">{Math.min(entries.length, 9)}{entries.length > 9 ? '+' : ''}</span>}
      </button>
      {open && (
        <section className="download-popover" id={`download-center-${placement}`} role="dialog" aria-label={copy.title}>
          <header>
            <span><CheckCircle size={18} weight="fill" /><strong>{copy.title}</strong></span>
            <button type="button" className="popover-icon-button" aria-label={copy.close} onClick={() => setOpen(false)}><X size={17} /></button>
          </header>
          {entries.length === 0 ? (
            <div className="download-empty"><DownloadSimple size={28} /><span>{copy.empty}</span></div>
          ) : (
            <div className="download-list">
              {entries.map((entry) => (
                <article key={entry.id}>
                  <span className="download-file-icon"><DownloadSimple size={17} /></span>
                  <div><strong title={entry.name}>{entry.name}</strong><small>{formatBytes(entry.blob.size)} · {new Intl.DateTimeFormat(uiLanguage === 'fa' ? 'fa-IR' : 'en', { hour: '2-digit', minute: '2-digit' }).format(entry.createdAt)}</small></div>
                  <button type="button" className="popover-icon-button" aria-label={`${copy.again}: ${entry.name}`} title={copy.again} onClick={() => redownload(entry)}><ArrowClockwise size={17} /></button>
                </article>
              ))}
            </div>
          )}
          {entries.length > 0 && <footer><button type="button" onClick={clear}><Trash size={16} />{copy.clear}</button></footer>}
        </section>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
