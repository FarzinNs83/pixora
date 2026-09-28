import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import puppeteer from 'puppeteer-core';

const port = 4188;
const origin = `http://127.0.0.1:${port}`;
const viteCli = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const preview = spawn(process.execPath, [viteCli, process.argv.includes('--dev') ? 'dev' : 'preview', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pixora-e2e-'));

try {
  await waitForServer(origin);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--disable-gpu', '--no-first-run'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error(`Browser page error: ${error.stack ?? error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`Browser console error: ${message.text()}`);
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(origin, { waitUntil: 'networkidle0' });
    await installDownloadCapture(page);

    const home = await page.evaluate(() => ({
      version: document.querySelector('.home-version bdi')?.textContent,
      imageLoaded: document.querySelector('.home-hero-art img')?.naturalWidth > 0,
      tools: document.querySelectorAll('.home-featured-tool, .home-tool-row').length,
      links: document.querySelectorAll('.home-project-links > a, .home-project-link-unset').length,
    }));
    assert(/^\d+\.\d+\.\d+$/.test(home.version ?? '') && home.imageLoaded && home.tools === 4 && home.links === 3, `Home is incomplete: ${JSON.stringify(home)}`);

    if (process.argv.includes('--preview-home')) {
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await page.screenshot({ path: join(process.cwd(), '.home-desktop.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.screenshot({ path: join(process.cwd(), '.home-mobile.png'), fullPage: true });
      await page.click('.mobile-toolbar button[aria-label="Theme"]');
      await page.screenshot({ path: join(process.cwd(), '.home-mobile-light.png'), fullPage: true });
      await page.click('.mobile-toolbar button[aria-label="Theme"]');
      await page.click('.mobile-toolbar button[aria-label="Language"]');
      await page.screenshot({ path: join(process.cwd(), '.home-mobile-fa.png'), fullPage: true });
      await page.click('.mobile-toolbar button:first-child');
    }

    await assertNoOverflow(page, 390, 844, 'mobile portrait');
    await assertNoOverflow(page, 375, 667, 'compact mobile');
    await assertNoOverflow(page, 844, 390, 'compact landscape');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reducedMotionDuration = await page.$eval('.home-featured-tool', (element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
    assert(reducedMotionDuration <= 0.001, `Reduced motion is not applied: ${reducedMotionDuration}s.`);
    await page.emulateMediaFeatures([]);

    assert(await page.evaluate(() => document.documentElement.dataset.theme === 'dark'), 'Dark theme was not the default.');
    assert(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor.includes('rgb(108, 108, 126)')), 'Dark scrollbar colors were not applied.');
    await page.click('.mobile-toolbar button[aria-label="Theme"]');
    assert(await page.evaluate(() => document.documentElement.dataset.theme === 'light'), 'Light theme was not applied.');
    assert(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor.includes('rgb(136, 136, 151)')), 'Light scrollbar colors were not applied.');
    await page.click('.mobile-toolbar button[aria-label="Theme"]');
    await page.click('.mobile-toolbar button[aria-label="Language"]');
    assert(await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'fa'), 'Persian RTL mode was not applied.');
    await page.click('.mobile-toolbar button[aria-label="زبان"]');
    assert(await page.evaluate(() => document.documentElement.dir === 'ltr' && document.documentElement.lang === 'en'), 'English LTR mode was not restored.');

    await clickButtonText(page, 'Image converter');
    await page.waitForSelector('[data-testid="image-input"]');
    const controls = await page.evaluate(() => {
      const label = document.querySelector('.resize-toggle');
      const checkbox = label?.querySelector('input');
      const text = label?.querySelector('span');
      if (!label || !checkbox || !text) return null;
      const box = checkbox.getBoundingClientRect();
      const caption = text.getBoundingClientRect();
      return {
        display: getComputedStyle(label).display,
        offset: Math.abs((box.top + box.bottom) / 2 - (caption.top + caption.bottom) / 2),
        presetCount: document.querySelectorAll('.quality-presets').length,
      };
    });
    assert(controls?.display === 'flex' && controls.offset < 4, 'Resize checkbox and label are not vertically aligned.');
    assert(controls.presetCount === 0, 'Quick quality presets should not be shown.');
    const pngPath = join(temporaryDirectory, 'fixture.png');
    await writeFile(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const input = await page.$('[data-testid="image-input"]');
    await input.uploadFile(pngPath);

    await page.click('[data-testid="convert-images"]');
    await page.waitForSelector('[data-testid="image-job"][data-status="done"]', { timeout: 30000 });
    await page.click('[data-testid="download-image"]');
    const webp = await capturedDownload(page, 'fixture.webp');
    assert(webp.subarray(0, 4).toString('ascii') === 'RIFF', 'WebP output is missing the RIFF signature.');
    assert(webp.subarray(8, 12).toString('ascii') === 'WEBP', 'WebP output is missing the WEBP signature.');

    await page.click('[data-testid="download-all-images"]');
    const archive = await capturedDownload(page, 'pixora-images.zip');
    assert(archive.subarray(0, 2).toString('ascii') === 'PK', 'Download-all output is not a ZIP archive.');
    await page.click('[data-testid="download-center-mobile"]');
    await page.waitForSelector('#download-center-mobile');
    assert(await page.$eval('#download-center-mobile', (element) => element.textContent?.includes('fixture.webp')), 'Download center did not record the converted image.');
    await page.click('#download-center-mobile button[aria-label="Close"]');

    await page.click('[data-testid="format-svg"]');
    await page.click('[data-testid="convert-images"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="image-job"]')?.getAttribute('data-status') !== 'done');
    await page.waitForFunction(() => document.querySelector('[data-testid="image-job"]')?.getAttribute('data-status') === 'done', { timeout: 60000 });
    await page.click('[data-testid="download-image"]');
    const svg = new TextDecoder().decode(await capturedDownload(page, 'fixture.svg'));
    assert(svg.includes('<svg'), 'SVG output has no SVG root.');
    assert(svg.includes('<path'), 'SVG output contains no traced vector path.');

    await clickButtonText(page, 'Lorem generator');
    await page.waitForSelector('textarea[aria-label="Generated text"]');
    const loremBefore = await page.$eval('textarea[aria-label="Generated text"]', (element) => ({ value: element.value, direction: element.dir }));
    assert(loremBefore.direction === 'rtl' && /[\u0600-\u06ff]/.test(loremBefore.value), 'Lorem does not default to Persian.');
    await clickButtonText(page, 'Words');
    const loremAfter = await page.$eval('textarea[aria-label="Generated text"]', (element) => element.value);
    assert(loremAfter !== loremBefore.value, 'Lorem output did not update immediately.');

    await createVideoFixture(page, join(temporaryDirectory, 'sample.webm'));
    await clickButtonText(page, 'Video converter');
    await page.waitForSelector('[data-testid="video-input"]');
    const videoInput = await page.$('[data-testid="video-input"]');
    await videoInput.uploadFile(join(temporaryDirectory, 'sample.webm'));
    await page.click('[data-testid="video-format-mp4"]');
    await page.click('[data-testid="convert-videos"]');
    await page.waitForSelector('[data-testid="video-job"][data-status="done"]', { timeout: 180000 });
    await clickUncoveredButton(page, '[data-testid="download-video"]');
    const mp4 = await capturedDownload(page, 'sample.mp4');
    assert(mp4.subarray(4, 8).toString('ascii') === 'ftyp', 'MP4 output is missing the ftyp signature.');
    await page.click('[data-testid="download-all-videos"]');
    const videoArchive = await capturedDownload(page, 'pixora-videos.zip');
    assert(videoArchive.subarray(0, 2).toString('ascii') === 'PK', 'Video download-all output is not a ZIP archive.');
    const mp4Path = join(temporaryDirectory, 'encoded.mp4');
    await writeFile(mp4Path, mp4);
    await clickButtonText(page, 'Clear');
    await videoInput.uploadFile(mp4Path);
    await page.click('[data-testid="convert-videos"]');
    await page.waitForSelector('[data-testid="video-job"][data-status="done"]', { timeout: 180000 });
    if (process.argv.includes('--large-video')) {
      const largePath = join(temporaryDirectory, 'large.mp4');
      const generated = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', '-y', largePath], { encoding: 'utf8' });
      assert(generated.status === 0, `Could not create larger MP4 fixture: ${generated.stderr}`);
      const fixtureBytes = statSync(largePath).size;
      assert(fixtureBytes > 3_700_000, `Larger MP4 fixture is only ${fixtureBytes} bytes.`);
      await clickButtonText(page, 'Clear');
      await videoInput.uploadFile(largePath);
      await page.click('[data-testid="convert-videos"]');
      try {
        await page.waitForSelector('[data-testid="video-job"][data-status="done"]', { timeout: 180000 });
      } catch (error) {
        const jobs = await page.$$eval('[data-testid="video-job"]', (items) => items.map((item) => ({ status: item.getAttribute('data-status'), text: item.textContent })));
        throw new Error(`Larger MP4 did not convert: ${JSON.stringify(jobs)}`, { cause: error });
      }
      console.log(`Large MP4 conversion passed (${(fixtureBytes / 1024 / 1024).toFixed(1)} MiB input).`);
    }

    const portraitPath = join(temporaryDirectory, 'portrait.png');
    const fixturePage = await browser.newPage();
    await fixturePage.setViewport({ width: 320, height: 320, deviceScaleFactor: 1 });
    await fixturePage.setContent('<style>*{box-sizing:border-box}body{margin:0;width:320px;height:320px;background:linear-gradient(135deg,#f0d48a,#67b8d8);overflow:hidden}.head{position:absolute;left:126px;top:35px;width:68px;height:68px;border-radius:50%;background:#25324a}.body{position:absolute;left:84px;top:96px;width:152px;height:210px;border-radius:70px 70px 20px 20px;background:#25324a}.shirt{position:absolute;left:102px;top:124px;width:116px;height:130px;border-radius:46px;background:#5454c7}</style><div class="head"></div><div class="body"></div><div class="shirt"></div>');
    await fixturePage.screenshot({ path: portraitPath });
    await fixturePage.close();
    const secondPortraitPath = join(temporaryDirectory, 'portrait-2.png');
    await copyFile(portraitPath, secondPortraitPath);

    await clickButtonText(page, 'Background remover');
    await page.waitForSelector('[data-testid="background-input"]');
    const backgroundInput = await page.$('[data-testid="background-input"]');
    await backgroundInput.uploadFile(portraitPath, secondPortraitPath);
    assert(await page.$$eval('[data-testid="background-job"]', (items) => items.length) === 2, 'Background remover did not queue both images.');
    await page.click('[data-testid="remove-background"]');
    try {
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="background-job"][data-status="done"]').length === 2, { timeout: 90000 });
    } catch (error) {
      const jobs = await page.$$eval('[data-testid="background-job"]', (items) => items.map((item) => ({ status: item.getAttribute('data-status'), text: item.textContent })));
      throw new Error(`Background batch did not finish: ${JSON.stringify(jobs)}`, { cause: error });
    }
    await clickUncoveredButton(page, '[data-testid="download-background"]');
    const transparent = await capturedDownload(page, 'portrait-no-background.png', 180000);
    assert(transparent.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Background output is not a PNG.');
    await page.click('[data-testid="download-all-backgrounds"]');
    const backgroundArchive = await capturedDownload(page, 'pixora-backgrounds.zip');
    assert(backgroundArchive.subarray(0, 2).toString('ascii') === 'PK', 'Background download-all output is not a ZIP archive.');

    console.log('E2E passed: responsive layout, downloads/ZIP, instant Persian lorem, WebP, real SVG, MP4 input/output and batch background removal.');
  } finally {
    await browser.close();
  }
} finally {
  preview.kill();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function findBrowser() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error('No supported Chrome or Edge executable was found for E2E tests.');
  return browser;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error('Vite preview did not start.');
}

async function installDownloadCapture(page) {
  await page.evaluate(() => {
    window.__pixoraDownloads = [];
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function captureDownload() {
      if (!this.download || !this.href.startsWith('blob:')) {
        nativeClick.call(this);
        return;
      }
      const entry = { name: this.download, mimeType: '', bytes: null, error: '' };
      window.__pixoraDownloads.push(entry);
      fetch(this.href)
        .then(async (response) => {
          entry.mimeType = response.headers.get('content-type') ?? '';
          entry.bytes = [...new Uint8Array(await response.arrayBuffer())];
        })
        .catch((error) => { entry.error = error instanceof Error ? error.message : String(error); });
    };
  });
}

async function capturedDownload(page, expectedName, timeout = 30000) {
  try {
    await page.waitForFunction(
      (name) => window.__pixoraDownloads?.some((item) => item.name === name && (item.bytes || item.error)),
      { timeout },
      expectedName,
    );
  } catch (error) {
    const captured = await page.evaluate(() => window.__pixoraDownloads?.map(({ name, mimeType, bytes, error }) => ({ name, mimeType, size: bytes?.length ?? 0, error })) ?? []);
    throw new Error(`Download was not captured as ${expectedName}. Captured: ${JSON.stringify(captured)}`, { cause: error });
  }
  const result = await page.evaluate(
    (name) => window.__pixoraDownloads.find((item) => item.name === name),
    expectedName,
  );
  assert(result && !result.error, `Download capture failed for ${expectedName}: ${result?.error ?? 'missing result'}`);
  assert(Array.isArray(result.bytes) && result.bytes.length > 0, `Download is empty: ${expectedName}`);
  return Buffer.from(result.bytes);
}

async function clickUncoveredButton(page, selector) {
  const visible = await page.$eval(selector, (button) => {
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return bounds.width > 0 && bounds.height > 0 && Boolean(hit && (hit === button || button.contains(hit)));
  });
  assert(visible, `Button is hidden or covered: ${selector}`);
  await page.$eval(selector, (button) => button.click());
}

async function createVideoFixture(page, outputPath) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#5454c7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.font = 'bold 20px sans-serif';
    context.fillText('PIX', 27, 39);
    const stream = canvas.captureStream(10);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.frequency.value = 440;
    oscillator.start();
    stream.addTrack(destination.stream.getAudioTracks()[0]);
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('Headless browser cannot record a WebM fixture.');
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.stop();
    await stopped;
    oscillator.stop();
    await audio.close();
    stream.getTracks().forEach((track) => track.stop());
    const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  });
  await writeFile(outputPath, Buffer.from(base64, 'base64'));
}

async function clickButtonText(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    button?.click();
    return Boolean(button);
  }, text);
  assert(clicked, `Button was not found: ${text}`);
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

async function assertNoOverflow(page, width, height, label) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const layout = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
  assert(layout.viewport === width, `Expected ${width}px for ${label}, got ${layout.viewport}.`);
  assert(layout.content <= layout.viewport, `${label} has horizontal overflow: ${layout.content}px in ${layout.viewport}px.`);
}
