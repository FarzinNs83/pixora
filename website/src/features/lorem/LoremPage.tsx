import { Check, Copy, DownloadSimple } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { useDownloadCenter } from '../../app/download-center';
import type { Language } from '../../app/i18n';
import {
  generateLorem,
  getTextStats,
  type HtmlTag,
  type LoremFormat,
  type LoremLanguage,
  type LoremUnit,
} from './lorem';

const labels = {
  en: {
    title: 'Lorem generator',
    language: 'Text language', persian: 'Persian', english: 'English', unit: 'Generate by', words: 'Words',
    sentences: 'Sentences', paragraphs: 'Paragraphs', count: 'Amount', format: 'Output format', plain: 'Plain text',
    html: 'HTML', markdown: 'Markdown', tag: 'HTML tag', start: 'Start with classic lorem',
    copy: 'Copy', copied: 'Copied', download: 'Download', preview: 'Generated text', wordCount: 'words', chars: 'characters',
  },
  fa: {
    title: 'لورم‌ساز',
    language: 'زبان متن', persian: 'فارسی', english: 'انگلیسی', unit: 'نوع تولید', words: 'کلمه',
    sentences: 'جمله', paragraphs: 'پاراگراف', count: 'تعداد', format: 'فرمت خروجی', plain: 'متن ساده',
    html: 'HTML', markdown: 'Markdown', tag: 'تگ HTML', start: 'شروع با لورم کلاسیک',
    copy: 'کپی', copied: 'کپی شد', download: 'دانلود', preview: 'متن ساخته‌شده', wordCount: 'کلمه', chars: 'کاراکتر',
  },
} as const;

export function LoremPage({ uiLanguage }: { uiLanguage: Language }) {
  const t = labels[uiLanguage];
  const { downloadFile } = useDownloadCenter();
  const [language, setLanguage] = useState<LoremLanguage>('fa');
  const [unit, setUnit] = useState<LoremUnit>('paragraphs');
  const [count, setCount] = useState(3);
  const [format, setFormat] = useState<LoremFormat>('plain');
  const [tag, setTag] = useState<HtmlTag>('p');
  const [classicStart, setClassicStart] = useState(true);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => generateLorem({ language, unit, count, format, htmlTag: tag, classicStart }), [language, unit, count, format, tag, classicStart]);
  const stats = useMemo(() => getTextStats(text), [text]);

  useEffect(() => setCopied(false), [text]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'txt';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadFile({ name: `pixora-lorem.${extension}`, blob });
  };

  return (
    <motion.main className="tool-page" initial={false}>
      <header className="tool-heading">
        <h1>{t.title}</h1>
      </header>

      <div className="lorem-layout">
        <section className="control-panel">
          <Segment label={t.language} value={language} onChange={(value) => setLanguage(value as LoremLanguage)} options={[['fa', t.persian], ['en', t.english]]} />
          <Segment label={t.unit} value={unit} onChange={(value) => setUnit(value as LoremUnit)} options={[['words', t.words], ['sentences', t.sentences], ['paragraphs', t.paragraphs]]} />
          <label className="field-label" htmlFor="lorem-count">{t.count}</label>
          <div className="number-field">
            <button type="button" aria-label="Decrease" onClick={() => setCount((value) => Math.max(1, value - 1))}>−</button>
            <input id="lorem-count" type="number" min="1" max="100" value={count} onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value))))} />
            <button type="button" aria-label="Increase" onClick={() => setCount((value) => Math.min(100, value + 1))}>+</button>
          </div>
          <Segment label={t.format} value={format} onChange={(value) => setFormat(value as LoremFormat)} options={[['plain', t.plain], ['html', t.html], ['markdown', t.markdown]]} />
          {format !== 'plain' && (
            <label className="select-field">{t.tag}
              <select value={tag} onChange={(event) => setTag(event.target.value as HtmlTag)}>
                {(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as HtmlTag[]).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}
          <label className="check-field">
            <input type="checkbox" checked={classicStart} onChange={(event) => setClassicStart(event.target.checked)} />
            <span>{t.start}</span>
          </label>
        </section>

        <section className="result-panel" aria-live="polite">
          <div className="result-toolbar">
            <div><strong>{t.preview}</strong><span>{stats.words} {t.wordCount} / {stats.characters} {t.chars}</span></div>
            <div className="toolbar-actions">
              <button type="button" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? t.copied : t.copy}</button>
              <button type="button" onClick={download}><DownloadSimple size={17} />{t.download}</button>
            </div>
          </div>
          <textarea className="result-text" dir={language === 'fa' ? 'rtl' : 'ltr'} value={text} readOnly spellCheck={false} aria-label={t.preview} />
        </section>
      </div>
    </motion.main>
  );
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <fieldset className="segment-field"><legend>{label}</legend><div className="segment-control">{options.map(([key, text]) => <button className={value === key ? 'active' : ''} type="button" key={key} onClick={() => onChange(key)}>{text}</button>)}</div></fieldset>;
}
