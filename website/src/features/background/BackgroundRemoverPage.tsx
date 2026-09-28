import { CheckCircle, FileImage, FileZip, Stop, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { createZip } from '../../app/archive';
import { useDownloadCenter } from '../../app/download-center';
import type { Language } from '../../app/i18n';
import { formatFileSize } from '../image/image-types';
import { backgroundRemovalService } from './background-service';
import { backgroundOutputName, type BackgroundRemovalResult } from './background-types';

type BackgroundStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';
interface BackgroundJob {
  id: string;
  file: File;
  sourceUrl: string;
  resultUrl?: string;
  result?: BackgroundRemovalResult;
  progress: number;
  status: BackgroundStatus;
  error?: string;
}

const copy = {
  en: {
    title: 'Background remover', drop: 'Drop images here', browse: 'Choose images', support: 'PNG, JPG, WebP, HEIC and more',
    original: 'Original', result: 'Transparent result', empty: 'No images yet', noResult: 'No result yet',
    remove: 'Remove backgrounds', cancel: 'Cancel', download: 'Download PNG', downloadAll: 'Download all', preparingZip: 'Preparing ZIP', clear: 'Clear', files: 'files',
    queued: 'Ready', processing: 'Removing', done: 'Complete', error: 'Failed', cancelled: 'Cancelled', failed: 'Background removal failed',
  },
  fa: {
    title: 'حذف پس‌زمینه', drop: 'تصاویر را اینجا رها کنید', browse: 'انتخاب تصاویر', support: 'PNG، JPG، WebP، HEIC و فرمت‌های بیشتر',
    original: 'تصویر اصلی', result: 'خروجی شفاف', empty: 'هنوز تصویری اضافه نشده', noResult: 'هنوز خروجی ندارد',
    remove: 'حذف پس‌زمینه‌ها', cancel: 'لغو', download: 'دانلود PNG', downloadAll: 'دانلود همه', preparingZip: 'در حال ساخت ZIP', clear: 'پاک کردن', files: 'فایل',
    queued: 'آماده', processing: 'در حال حذف', done: 'تکمیل شد', error: 'ناموفق', cancelled: 'لغو شد', failed: 'حذف پس‌زمینه ناموفق بود',
  },
} as const;

export function BackgroundRemoverPage({ uiLanguage }: { uiLanguage: Language }) {
  const t = copy[uiLanguage];
  const { downloadFile } = useDownloadCenter();
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const runId = useRef(0);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  useEffect(() => () => {
    runId.current += 1;
    backgroundRemovalService.cancel();
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const additions = Array.from(files).map<BackgroundJob>((file) => {
      const sourceUrl = URL.createObjectURL(file);
      urls.current.add(sourceUrl);
      return { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, file, sourceUrl, progress: 0, status: 'queued' };
    });
    setJobs((current) => [...current, ...additions]);
    setSelectedId((current) => current || additions[0]?.id || '');
    setArchiveError('');
  };

  const remove = async () => {
    if (!jobs.length || busy) return;
    const run = ++runId.current;
    setBusy(true);
    for (const job of jobs) {
      if (run !== runId.current) break;
      setSelectedId(job.id);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'processing', progress: 0, error: undefined } : item));
      try {
        const result = await backgroundRemovalService.remove(job.file, (progress) =>
          setJobs((current) => current.map((item) => item.id === job.id ? { ...item, progress } : item)));
        if (run !== runId.current) break;
        const resultUrl = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'image/png' }));
        urls.current.add(resultUrl);
        if (job.resultUrl) { URL.revokeObjectURL(job.resultUrl); urls.current.delete(job.resultUrl); }
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, result, resultUrl, status: 'done', progress: 1 } : item));
        downloadFile({ name: backgroundOutputName(job.file.name), blob: new Blob([result.bytes as BlobPart], { type: 'image/png' }) });
      } catch (reason) {
        if (run !== runId.current) break;
        setJobs((current) => current.map((item) => item.id === job.id ? {
          ...item, status: 'error', error: reason instanceof Error ? reason.message : t.failed,
        } : item));
      }
    }
    if (run === runId.current) setBusy(false);
  };

  const cancel = () => {
    runId.current += 1;
    backgroundRemovalService.cancel();
    setJobs((current) => current.map((job) => job.status === 'processing' ? { ...job, status: 'cancelled', progress: 0 } : job));
    setBusy(false);
  };

  const clear = () => {
    for (const job of jobs) {
      URL.revokeObjectURL(job.sourceUrl);
      urls.current.delete(job.sourceUrl);
      if (job.resultUrl) { URL.revokeObjectURL(job.resultUrl); urls.current.delete(job.resultUrl); }
    }
    setJobs([]);
    setSelectedId('');
    setArchiveError('');
  };

  const downloadAll = async () => {
    const completed = jobs.filter((job) => job.result);
    if (!completed.length) return;
    setZipping(true);
    setArchiveError('');
    try {
      const blob = await createZip(completed.map((job) => ({ name: backgroundOutputName(job.file.name), bytes: job.result!.bytes })));
      downloadFile({ name: 'pixora-backgrounds.zip', blob });
    } catch (reason) {
      setArchiveError(reason instanceof Error ? reason.message : String(reason));
    } finally { setZipping(false); }
  };

  return <main className="tool-page">
    <header className="tool-heading"><h1>{t.title}</h1></header>
    <input ref={inputRef} data-testid="background-input" className="visually-hidden" type="file" accept="image/*,.heic,.heif,.tif,.tiff,.ico,.psd" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
    <section className={dragging ? 'drop-zone dragging' : 'drop-zone'} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <span className="drop-icon"><UploadSimple size={28} weight="duotone" /></span><div><strong>{t.drop}</strong><small>{t.support}</small></div><button type="button" onClick={() => inputRef.current?.click()}>{t.browse}</button>
    </section>
    <section className="queue-panel background-queue">
      <div className="queue-toolbar"><strong>{jobs.length} {t.files}</strong><div><button type="button" data-testid="download-all-backgrounds" disabled={busy || zipping || !jobs.some((job) => job.result)} onClick={downloadAll}><FileZip size={17} />{zipping ? t.preparingZip : t.downloadAll}</button><button type="button" disabled={busy || !jobs.length} onClick={clear}><Trash size={17} />{t.clear}</button></div></div>
      <div className="queue-list">{jobs.length === 0 ? <div className="queue-empty"><FileImage size={34} /><span>{t.empty}</span></div> : jobs.map((job) => <article className="queue-item" data-testid="background-job" data-status={job.status} key={job.id}>
        <span className={`job-state ${job.status}`}>{job.status === 'done' ? <CheckCircle size={19} /> : job.status === 'error' ? <WarningCircle size={19} /> : <FileImage size={19} />}</span>
        <button type="button" className={selected?.id === job.id ? 'background-file active' : 'background-file'} onClick={() => setSelectedId(job.id)} aria-label={`${job.file.name} · ${t[job.status]}`}><strong title={job.file.name}>{job.file.name}</strong><small>{formatFileSize(job.file.size)}{job.result ? ` → ${formatFileSize(job.result.bytes.byteLength)}` : ''}</small>{job.error && <em>{job.error}</em>}{job.status === 'processing' && <span className="job-progress"><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></span>}</button>
        <span className="job-result">{job.status === 'processing' ? `${Math.round(job.progress * 100)}%` : t[job.status]}</span>
      </article>)}</div>
    </section>
    {selected && <section className="background-workspace">
      <figure><figcaption>{t.original}</figcaption><div className="image-preview"><img src={selected.sourceUrl} alt={selected.file.name} /></div></figure>
      <figure><figcaption>{t.result}</figcaption><div className="image-preview transparency-grid">{selected.resultUrl ? <img src={selected.resultUrl} alt={`${t.result}: ${selected.file.name}`} /> : <span>{t.noResult}</span>}</div></figure>
    </section>}
    <section className="background-actions">
      <div>{selected?.status === 'processing' && <><strong>{t.processing} · {Math.round(selected.progress * 100)}%</strong><span className="wide-progress"><i style={{ width: `${Math.round(selected.progress * 100)}%` }} /></span></>}{archiveError && <p className="form-error" role="alert"><WarningCircle size={17} />{archiveError}</p>}</div>
      <div>{busy ? <button className="secondary-danger-button" type="button" onClick={cancel}><Stop size={17} weight="fill" />{t.cancel}</button> : <button className="primary-button" data-testid="remove-background" type="button" disabled={!jobs.length} onClick={remove}>{t.remove}</button>}</div>
    </section>
  </main>;
}
