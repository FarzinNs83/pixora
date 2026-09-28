import { CheckCircle, DownloadSimple, FileImage, FileZip, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useRef, useState } from 'react';

import { createZip } from '../../app/archive';
import { useDownloadCenter } from '../../app/download-center';
import type { Language } from '../../app/i18n';
import { imageConversionService } from './image-service';
import {
  formatFileSize,
  imageOutputFormats,
  maxImageDimension,
  maxImageScalePercent,
  outputFileName,
  outputMime,
  parseImageDimension,
  parseImageScalePercent,
  savingPercent,
  type ImageJob,
  type ImageOutputFormat,
} from './image-types';

const copy = {
  en: {
    title: 'Image converter',
    drop: 'Drop images here', browse: 'Choose images', support: 'PNG, JPEG, WebP, AVIF, GIF, TIFF, BMP, ICO, SVG, HEIC and more', empty: 'No images yet',
    output: 'Output format', quality: 'Quality', dimensions: 'Resize', exactSize: 'Set exact pixel dimensions', percentage: 'Scale', width: 'Width', height: 'Height', original: '100% keeps the original size', resizeMode: 'Fit method', contain: 'Fit inside', cover: 'Fill & crop', stretch: 'Stretch',
    metadata: 'Remove metadata', convert: 'Convert files', downloadAll: 'Download all', preparingZip: 'Preparing ZIP', clear: 'Clear', queued: 'Ready', processing: 'Converting', done: 'Complete', error: 'Failed',
    download: 'Download', smaller: 'smaller', larger: 'larger', noFiles: 'Add at least one image to continue.', invalidDimensions: `Width and height must be whole numbers from 1 to ${maxImageDimension}.`, invalidPercentage: `Scale must be between 1% and ${maxImageScalePercent}%.`, watermark: 'Image watermark', chooseWatermark: 'Choose logo', removeWatermark: 'Remove', watermarkScale: 'Watermark size', watermarkOpacity: 'Opacity', position: 'Position', northwest: 'Top left', northeast: 'Top right', center: 'Center', southwest: 'Bottom left', southeast: 'Bottom right',
  },
  fa: {
    title: 'مبدل تصویر',
    drop: 'تصاویر را اینجا رها کنید', browse: 'انتخاب تصاویر', support: 'PNG، JPEG، WebP، AVIF، GIF، TIFF، BMP، ICO، SVG، HEIC و فرمت‌های بیشتر', empty: 'هنوز تصویری اضافه نشده',
    output: 'فرمت خروجی', quality: 'کیفیت', dimensions: 'تغییر اندازه', exactSize: 'انتخاب اندازه دقیق برحسب پیکسل', percentage: 'مقیاس', width: 'عرض', height: 'ارتفاع', original: '۱۰۰٪ اندازه اصلی را حفظ می‌کند', resizeMode: 'روش تطبیق', contain: 'حفظ کامل تصویر', cover: 'پر کردن و برش', stretch: 'کشیدن تصویر',
    metadata: 'حذف متادیتا', convert: 'تبدیل فایل‌ها', downloadAll: 'دانلود همه', preparingZip: 'در حال ساخت ZIP', clear: 'پاک کردن', queued: 'آماده', processing: 'در حال تبدیل', done: 'تکمیل شد', error: 'ناموفق',
    download: 'دانلود', smaller: 'کوچک‌تر', larger: 'بزرگ‌تر', noFiles: 'برای ادامه حداقل یک تصویر اضافه کنید.', invalidDimensions: `عرض و ارتفاع باید عدد صحیح بین ۱ تا ${maxImageDimension} باشند.`, invalidPercentage: `مقیاس باید بین ۱٪ تا ${maxImageScalePercent}٪ باشد.`, watermark: 'واترمارک تصویری', chooseWatermark: 'انتخاب لوگو', removeWatermark: 'حذف', watermarkScale: 'اندازه واترمارک', watermarkOpacity: 'شفافیت', position: 'موقعیت', northwest: 'بالا چپ', northeast: 'بالا راست', center: 'مرکز', southwest: 'پایین چپ', southeast: 'پایین راست',
  },
} as const;

export function ImageConverterPage({ uiLanguage }: { uiLanguage: Language }) {
  const t = copy[uiLanguage];
  const { downloadFile } = useDownloadCenter();
  const inputRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [format, setFormat] = useState<ImageOutputFormat>('webp');
  const [quality, setQuality] = useState(80);
  const [exactSize, setExactSize] = useState(false);
  const [scalePercent, setScalePercent] = useState('100');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover' | 'stretch'>('contain');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [watermark, setWatermark] = useState<File>();
  const [watermarkScale, setWatermarkScale] = useState(22);
  const [watermarkOpacity, setWatermarkOpacity] = useState(72);
  const [watermarkPosition, setWatermarkPosition] = useState<'northwest' | 'northeast' | 'center' | 'southwest' | 'southeast'>('southeast');
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState('');
  const [zipping, setZipping] = useState(false);
  const busy = jobs.some((job) => job.status === 'processing');

  const addFiles = (files: FileList | File[]) => {
    const additions = Array.from(files).map<ImageJob>((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file, status: 'queued' }));
    setJobs((current) => [...current, ...additions.filter((item) => !current.some((job) => job.id === item.id))]);
    setFormError('');
  };

  const convert = async () => {
    if (!jobs.length) { setFormError(t.noFiles); return; }
    const parsedWidth = exactSize ? parseImageDimension(width) : undefined;
    const parsedHeight = exactSize ? parseImageDimension(height) : undefined;
    const parsedScale = exactSize ? undefined : parseImageScalePercent(scalePercent);
    if (parsedWidth === null || parsedHeight === null) { setFormError(t.invalidDimensions); return; }
    if (parsedScale === null) { setFormError(t.invalidPercentage); return; }
    setFormError('');
    const watermarkBytes = watermark ? new Uint8Array(await watermark.arrayBuffer()) : undefined;
    for (const job of jobs) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'processing', error: undefined } : item));
      try {
        const output = await imageConversionService.convert(job.file, {
          outputFormat: format, quality,
          width: parsedWidth,
          height: parsedHeight,
          scalePercent: parsedScale,
          resizeMode,
          stripMetadata,
          watermark: watermarkBytes ? { bytes: watermarkBytes, scalePercent: watermarkScale, opacity: watermarkOpacity, position: watermarkPosition } : undefined,
        });
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'done', output, detectedFormat: output.inputFormat } : item));
      } catch (error) {
        setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : String(error) } : item));
      }
    }
  };

  const download = (job: ImageJob) => {
    if (!job.output) return;
    const blob = new Blob([job.output.bytes as BlobPart], { type: outputMime(job.output.outputFormat) });
    downloadFile({ name: outputFileName(job.file.name, job.output.outputFormat), blob });
  };

  const downloadAll = async () => {
    const completed = jobs.filter((job) => job.output);
    if (!completed.length) return;
    setZipping(true);
    try {
      const blob = await createZip(completed.map((job) => ({ name: outputFileName(job.file.name, job.output!.outputFormat), bytes: job.output!.bytes })));
      downloadFile({ name: 'pixora-images.zip', blob });
    } finally {
      setZipping(false);
    }
  };

  return <main className="tool-page">
    <header className="tool-heading"><h1>{t.title}</h1></header>
    <input ref={inputRef} data-testid="image-input" className="visually-hidden" type="file" accept="image/*,.heic,.heif,.tif,.tiff,.ico,.psd,.dng,.raw" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} />
    <input ref={watermarkRef} className="visually-hidden" type="file" accept="image/png,image/webp,image/svg+xml" onChange={(event) => setWatermark(event.target.files?.[0])} />
    <section className={dragging ? 'drop-zone dragging' : 'drop-zone'} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <span className="drop-icon"><UploadSimple size={28} weight="duotone" /></span><div><strong>{t.drop}</strong><small>{t.support}</small></div><button type="button" onClick={() => inputRef.current?.click()}>{t.browse}</button>
    </section>

    <div className="converter-layout">
      <section className="queue-panel">
        <div className="queue-toolbar"><strong>{jobs.length} {uiLanguage === 'fa' ? 'فایل' : 'files'}</strong><div><button type="button" data-testid="download-all-images" disabled={busy || zipping || !jobs.some((job) => job.output)} onClick={downloadAll}><FileZip size={17} />{zipping ? t.preparingZip : t.downloadAll}</button><button type="button" disabled={busy || !jobs.length} onClick={() => setJobs([])}><Trash size={17} />{t.clear}</button></div></div>
        <div className="queue-list">{jobs.length === 0 ? <div className="queue-empty"><FileImage size={34} /><span>{t.empty}</span></div> : jobs.map((job) => <article className="queue-item" data-testid="image-job" data-status={job.status} key={job.id}><span className={`job-state ${job.status}`}>{job.status === 'done' ? <CheckCircle size={19} /> : job.status === 'error' ? <WarningCircle size={19} /> : <FileImage size={19} />}</span><div><strong title={job.file.name}>{job.file.name}</strong><small>{job.detectedFormat ?? (job.file.type || 'image')} / {formatFileSize(job.file.size)}{job.output ? ` → ${formatFileSize(job.output.bytes.byteLength)}` : ''}</small>{job.error && <em>{job.error}</em>}</div><span className="job-result">{job.status === 'processing' ? t.processing : job.status === 'done' && job.output ? `${Math.abs(savingPercent(job.file.size, job.output.bytes.byteLength))}% ${savingPercent(job.file.size, job.output.bytes.byteLength) >= 0 ? t.smaller : t.larger}` : t[job.status]}</span>{job.output && <button className="icon-action" data-testid="download-image" type="button" aria-label={t.download} title={t.download} onClick={() => download(job)}><DownloadSimple size={18} /></button>}</article>)}</div>
      </section>

      <aside className="image-settings">
        <fieldset className="format-field"><legend>{t.output}</legend><div>{imageOutputFormats.map((item) => <button type="button" data-testid={`format-${item}`} className={format === item ? 'active' : ''} key={item} onClick={() => setFormat(item)}>{item.toUpperCase()}</button>)}</div></fieldset>
        {(['jpg', 'webp', 'avif'] as ImageOutputFormat[]).includes(format) && <fieldset className="range-field quality-field"><legend><span>{t.quality}</span><b>{quality}%</b></legend><input aria-label={t.quality} type="range" min="25" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></fieldset>}
        <fieldset className="dimension-field"><legend>{t.dimensions}</legend><label className="check-field resize-toggle"><input type="checkbox" checked={exactSize} onChange={(event) => setExactSize(event.target.checked)} /><span>{t.exactSize}</span></label>{exactSize ? <><div><label>{t.width}<input inputMode="numeric" type="number" min="1" max={maxImageDimension} placeholder="px" value={width} onChange={(event) => setWidth(event.target.value)} /></label><label>{t.height}<input inputMode="numeric" type="number" min="1" max={maxImageDimension} placeholder="px" value={height} onChange={(event) => setHeight(event.target.value)} /></label></div>{width && height && <label className="select-field nested-select">{t.resizeMode}<select value={resizeMode} onChange={(event) => setResizeMode(event.target.value as typeof resizeMode)}><option value="contain">{t.contain}</option><option value="cover">{t.cover}</option><option value="stretch">{t.stretch}</option></select></label>}</> : <label className="percent-field">{t.percentage}<span><input data-testid="image-scale-percent" inputMode="decimal" type="number" min="1" max={maxImageScalePercent} value={scalePercent} onChange={(event) => setScalePercent(event.target.value)} /><b>%</b></span></label>}<small>{t.original}</small></fieldset>
        <label className="check-field"><input type="checkbox" checked={stripMetadata} onChange={(event) => setStripMetadata(event.target.checked)} /><span>{t.metadata}</span></label>
        <fieldset className="watermark-field"><legend>{t.watermark}</legend><div className="watermark-picker"><button type="button" onClick={() => watermarkRef.current?.click()}>{t.chooseWatermark}</button>{watermark && <button type="button" onClick={() => setWatermark(undefined)}>{t.removeWatermark}</button>}</div>{watermark && <><small title={watermark.name}>{watermark.name}</small><label className="range-field"><span>{t.watermarkScale}<b>{watermarkScale}%</b></span><input type="range" min="5" max="60" value={watermarkScale} onChange={(event) => setWatermarkScale(Number(event.target.value))} /></label><label className="range-field"><span>{t.watermarkOpacity}<b>{watermarkOpacity}%</b></span><input type="range" min="10" max="100" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label><label className="select-field">{t.position}<select value={watermarkPosition} onChange={(event) => setWatermarkPosition(event.target.value as typeof watermarkPosition)}>{(['northwest', 'northeast', 'center', 'southwest', 'southeast'] as const).map((position) => <option value={position} key={position}>{t[position]}</option>)}</select></label></>}</fieldset>
        {formError && <p className="form-error"><WarningCircle size={17} />{formError}</p>}
        <button className="primary-button" data-testid="convert-images" type="button" disabled={busy} onClick={convert}>{busy ? t.processing : t.convert}</button>
      </aside>
    </div>
  </main>;
}
