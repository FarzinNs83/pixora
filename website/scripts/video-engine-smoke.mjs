import { readFile } from 'node:fs/promises';

globalThis.self = {
  location: {
    href: new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', import.meta.url).href,
  },
};

const [{ default: createFFmpegCore }, wasm] = await Promise.all([
  import('@ffmpeg/core'),
  readFile(new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', import.meta.url)),
]);
const ffmpeg = await createFFmpegCore({ wasmBinary: wasm });

const width = 16;
const height = 16;
const frameCount = 2;
const rgba = new Uint8Array(width * height * 4 * frameCount);
for (let frame = 0; frame < frameCount; frame += 1) {
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = (frame * width * height + pixel) * 4;
    rgba[offset] = frame ? 79 : 37;
    rgba[offset + 1] = frame ? 79 : 99;
    rgba[offset + 2] = frame ? 189 : 235;
    rgba[offset + 3] = 255;
  }
}

ffmpeg.FS.writeFile('fixture.rgba', rgba);
const videoExitCode = ffmpeg.exec(
  '-f', 'rawvideo',
  '-pixel_format', 'rgba',
  '-video_size', `${width}x${height}`,
  '-framerate', '5',
  '-i', 'fixture.rgba',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  'fixture.mp4',
);
assert(videoExitCode === 0, `FFmpeg video conversion exited with ${videoExitCode}.`);
const mp4 = ffmpeg.FS.readFile('fixture.mp4');
assert(mp4.length > 32, 'FFmpeg created an empty MP4.');
assert(Buffer.from(mp4.subarray(4, 8)).toString('ascii') === 'ftyp', 'MP4 output has no ftyp signature.');

ffmpeg.reset();
ffmpeg.FS.writeFile('input.mp4', mp4);
const transcodeExitCode = ffmpeg.exec('-threads', '1', '-filter_threads', '1', '-i', 'input.mp4', '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '1', '-crf', '28', '-pix_fmt', 'yuv420p', '-an', 'converted.mp4');
assert(transcodeExitCode === 0, `FFmpeg MP4 to MP4 transcode exited with ${transcodeExitCode}.`);
const converted = ffmpeg.FS.readFile('converted.mp4');
assert(converted.length > 32 && Buffer.from(converted.subarray(4, 8)).toString('ascii') === 'ftyp', 'MP4 transcode has no valid output.');

ffmpeg.reset();
const samples = new Int16Array(1600);
for (let index = 0; index < samples.length; index += 1) {
  samples[index] = Math.round(Math.sin((index / 8000) * Math.PI * 880) * 12000);
}
ffmpeg.FS.writeFile('fixture.pcm', new Uint8Array(samples.buffer));
const audioExitCode = ffmpeg.exec(
  '-f', 's16le',
  '-ar', '8000',
  '-ac', '1',
  '-i', 'fixture.pcm',
  '-c:a', 'libmp3lame',
  '-q:a', '4',
  'fixture.mp3',
);
assert(audioExitCode === 0, `FFmpeg audio conversion exited with ${audioExitCode}.`);
const mp3 = ffmpeg.FS.readFile('fixture.mp3');
const mp3Header = Buffer.from(mp3.subarray(0, 3)).toString('ascii');
assert(mp3.length > 32 && (mp3Header === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)), 'MP3 output has no valid header.');

console.log(`Video engine smoke passed: MP4 encode (${mp4.length} B), MP4 transcode (${converted.length} B), MP3 (${mp3.length} B).`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
