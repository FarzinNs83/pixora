import { ArrowRight, ArrowUpRight, GithubLogo, Lifebuoy, TelegramLogo } from '@phosphor-icons/react';
import type { MouseEvent } from 'react';

import { tools, toolText, type ToolId } from './catalog';
import { openExternalProjectLink } from './desktop-bridge';
import type { Language, MessageKey } from './i18n';
import { translate } from './i18n';
import { projectLinkUrl, type ProjectLinkId } from './project-links';
import './home.css';

const copy = {
  en: {
    label: 'Your creative workspace',
    intro: 'Convert images and video, remove backgrounds, and make sample text in one place.',
    start: 'Open image tools',
    tools: 'Choose what to work on',
    toolsHint: 'Go straight to the tool you need.',
    about: 'About Pixora',
    aboutText: 'A focused workspace for your media and everyday design work.',
    version: 'Version',
    links: 'Project & support',
    github: 'GitHub project',
    telegram: 'Telegram channel',
    support: 'Support',
    missingLink: 'Link not set',
  },
  fa: {
    label: 'فضای کار شما',
    intro: 'تصویر و ویدیو را تبدیل کن، پس‌زمینه را بردار و متن نمونه بساز.',
    start: 'ابزار تصویر',
    tools: 'با کدام ابزار شروع می‌کنی؟',
    toolsHint: 'مستقیم برو سراغ کاری که می‌خواهی انجام بدهی.',
    about: 'دربارهٔ پیکسورا',
    aboutText: 'یک فضای کار جمع‌وجور برای فایل‌های رسانه‌ای و کارهای روزمرهٔ طراحی.',
    version: 'نسخه',
    links: 'پروژه و پشتیبانی',
    github: 'پروژه در گیت‌هاب',
    telegram: 'کانال تلگرام',
    support: 'پشتیبانی',
    missingLink: 'لینک ثبت نشده',
  },
} as const;

const projectLinks = [
  { id: 'github', icon: GithubLogo },
  { id: 'telegram', icon: TelegramLogo },
  { id: 'support', icon: Lifebuoy },
] as const satisfies ReadonlyArray<{ id: ProjectLinkId; icon: typeof GithubLogo }>;

function onExternalClick(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (openExternalProjectLink(url)) event.preventDefault();
}

export function HomePage({ language, onOpen }: { language: Language; onOpen: (id: ToolId) => void }) {
  const t = (key: MessageKey) => translate(language, key);
  const c = copy[language];
  const featured = tools[0];
  const FeaturedIcon = featured.icon;

  return <main className="home-page">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <span className="home-hero-label">{c.label}</span>
        <h1 id="home-title">{t('headline')}</h1>
        <p>{c.intro}</p>
        <button className="home-primary-action" onClick={() => onOpen('image-converter')}>
          {c.start}<ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="home-hero-art" aria-hidden="true">
        <img src="./home-media.png" alt="" width="1456" height="1086" decoding="async" />
      </div>
    </section>

    <section className="home-tools" aria-labelledby="home-tools-title">
      <div className="home-section-heading">
        <h2 id="home-tools-title">{c.tools}</h2>
        <p>{c.toolsHint}</p>
      </div>
      <div className="home-tool-layout">
        <button className="home-featured-tool" onClick={() => onOpen(featured.id)} aria-label={t(toolText[featured.id][0])}>
          <span className="home-featured-icon"><FeaturedIcon size={29} weight="duotone" aria-hidden="true" /></span>
          <span className="home-featured-copy">
            <strong>{t(toolText[featured.id][0])}</strong>
            <small>{t(toolText[featured.id][1])}</small>
          </span>
          <ArrowUpRight className="home-featured-arrow" size={23} aria-hidden="true" />
        </button>
        <div className="home-tool-list">
          {tools.slice(1).map(({ id, icon: Icon }) => <button key={id} className="home-tool-row" onClick={() => onOpen(id)} aria-label={t(toolText[id][0])}>
            <span className="home-row-icon"><Icon size={22} weight="duotone" aria-hidden="true" /></span>
            <span className="home-row-copy"><strong>{t(toolText[id][0])}</strong><small>{t(toolText[id][1])}</small></span>
            <ArrowUpRight size={18} className="home-row-arrow" aria-hidden="true" />
          </button>)}
        </div>
      </div>
    </section>

    <section className="home-about" aria-labelledby="home-about-title">
      <div className="home-about-summary">
        <div className="home-about-heading"><img src="./pixora-mark.svg" alt="" width="37" height="37" /><h2 id="home-about-title">{c.about}</h2></div>
        <p>{c.aboutText}</p>
        <span className="home-version">{c.version} <bdi dir="ltr">{__PIXORA_VERSION__}</bdi></span>
      </div>
      <div className="home-project-links">
        <h3>{c.links}</h3>
        {projectLinks.map(({ id, icon: Icon }) => {
          const url = projectLinkUrl(id);
          const content = <><Icon size={20} aria-hidden="true" /><span>{c[id]}</span>{url ? <ArrowUpRight size={16} aria-hidden="true" /> : <small>{c.missingLink}</small>}</>;
          return url
            ? <a key={id} href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => onExternalClick(event, url)}>{content}</a>
            : <div key={id} className="home-project-link-unset">{content}</div>;
        })}
      </div>
    </section>
  </main>;
}
