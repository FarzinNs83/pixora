import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path/path.dart' as path;

class NativeVideoOptions {
  NativeVideoOptions._({
    required this.format,
    required this.quality,
    required this.keepAudio,
    required this.stripMetadata,
    this.maxWidth,
    this.trimStart,
    this.trimEnd,
    this.watermark,
  });

  final String format;
  final int quality;
  final int? maxWidth;
  final bool keepAudio;
  final bool stripMetadata;
  final double? trimStart;
  final double? trimEnd;
  final NativeWatermarkOptions? watermark;

  static const formats = {'mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3', 'wav'};

  factory NativeVideoOptions.fromJson(Map<String, dynamic> json) {
    final format = json['outputFormat'];
    final quality = json['quality'];
    final width = json['maxWidth'];
    final start = json['trimStart'];
    final end = json['trimEnd'];
    if (format is! String || !formats.contains(format)) {
      throw const FormatException('Unsupported output format.');
    }
    if (quality is! num || !quality.isFinite || quality < 1 || quality > 100) {
      throw const FormatException('Invalid quality.');
    }
    if (width != null &&
        (width is! int || width < 2 || width > 7680 || width.isOdd)) {
      throw const FormatException('Invalid maximum width.');
    }
    if (start != null && (start is! num || !start.isFinite || start < 0)) {
      throw const FormatException('Invalid trim start.');
    }
    if (end != null && (end is! num || !end.isFinite || end <= (start ?? 0))) {
      throw const FormatException('Invalid trim end.');
    }
    if (json['keepAudio'] is! bool || json['stripMetadata'] is! bool) {
      throw const FormatException('Invalid video options.');
    }
    final watermarkJson = json['watermark'];
    return NativeVideoOptions._(
      format: format,
      quality: quality.round(),
      maxWidth: width as int?,
      keepAudio: json['keepAudio'] as bool,
      stripMetadata: json['stripMetadata'] as bool,
      trimStart: (start as num?)?.toDouble(),
      trimEnd: (end as num?)?.toDouble(),
      watermark: watermarkJson == null
          ? null
          : NativeWatermarkOptions.fromJson(
              Map<String, dynamic>.from(watermarkJson as Map),
            ),
    );
  }
}

class NativeWatermarkOptions {
  NativeWatermarkOptions._(this.scalePercent, this.opacity, this.position);

  final int scalePercent;
  final int opacity;
  final String position;

  factory NativeWatermarkOptions.fromJson(Map<String, dynamic> json) {
    final scale = json['scalePercent'];
    final opacity = json['opacity'];
    final position = json['position'];
    if (scale is! int ||
        scale < 5 ||
        scale > 60 ||
        opacity is! int ||
        opacity < 10 ||
        opacity > 100 ||
        !{
          'northwest',
          'northeast',
          'center',
          'southwest',
          'southeast',
        }.contains(position)) {
      throw const FormatException('Invalid watermark options.');
    }
    return NativeWatermarkOptions._(scale, opacity, position as String);
  }
}

List<String> buildNativeVideoArgs(
  String input,
  String output,
  NativeVideoOptions options, {
  String? watermark,
}) {
  final args = <String>[
    '-hide_banner',
    '-nostdin',
    '-y',
    '-progress',
    'pipe:2',
    '-nostats',
  ];
  if (options.trimStart != null && options.trimStart! > 0) {
    args.addAll(['-ss', '${options.trimStart}']);
  }
  args.addAll(['-i', input]);
  if (watermark != null &&
      options.watermark != null &&
      !{'mp3', 'wav'}.contains(options.format)) {
    args.addAll(['-loop', '1', '-i', watermark]);
  }
  if (options.trimEnd != null) {
    args.addAll(['-t', '${options.trimEnd! - (options.trimStart ?? 0)}']);
  }
  if (options.stripMetadata) args.addAll(['-map_metadata', '-1']);

  final scale = options.maxWidth == null
      ? null
      : "scale='min(${options.maxWidth},iw)':-2";
  if (options.format == 'gif') {
    _addFilter(
      args,
      'fps=12,${scale ?? 'scale=iw:-2'}:flags=lanczos',
      options,
      watermark,
    );
    args.addAll(['-an', '-loop', '0']);
  } else if (options.format == 'mp3') {
    args.addAll([
      '-vn',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '${_audioQuality(options.quality)}',
    ]);
  } else if (options.format == 'wav') {
    args.addAll(['-vn', '-c:a', 'pcm_s16le']);
  } else if (options.format == 'webm') {
    args.addAll([
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '${_videoCrf(options.quality, 18, 48)}',
      '-b:v',
      '0',
    ]);
    args.addAll(
      options.keepAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-an'],
    );
    _addFilter(args, scale, options, watermark);
  } else {
    args.addAll([
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '${_videoCrf(options.quality, 17, 36)}',
      '-pix_fmt',
      'yuv420p',
    ]);
    args.addAll(options.keepAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']);
    _addFilter(args, scale, options, watermark);
    if (options.format == 'mp4' || options.format == 'mov') {
      args.addAll(['-movflags', '+faststart']);
    }
  }
  args.add(output);
  return args;
}

void _addFilter(
  List<String> args,
  String? resize,
  NativeVideoOptions options,
  String? watermark,
) {
  final mark = options.watermark;
  if (watermark == null || mark == null) {
    if (resize != null) args.addAll(['-vf', resize]);
    return;
  }
  final base = resize ?? 'null';
  final opacity = mark.opacity / 100;
  final scale = mark.scalePercent / 100;
  final overlay = switch (mark.position) {
    'northwest' => '20:20',
    'northeast' => 'W-w-20:20',
    'center' => '(W-w)/2:(H-h)/2',
    'southwest' => '20:H-h-20',
    _ => 'W-w-20:H-h-20',
  };
  args.addAll([
    '-filter_complex',
    '[0:v]$base[base];[1:v]format=rgba,colorchannelmixer=aa=$opacity[alpha];'
        '[alpha][base]scale2ref=w=main_w*$scale:h=ow/mdar[wm][video];'
        '[video][wm]overlay=$overlay:shortest=1[vout]',
    '-map',
    '[vout]',
  ]);
  if (options.keepAudio) args.addAll(['-map', '0:a?']);
  args.add('-shortest');
}

int _videoCrf(int quality, int best, int worst) =>
    (worst - ((quality - 1) / 99) * (worst - best)).round();

int _audioQuality(int quality) => (9 - ((quality - 1) / 99) * 7).round();

class NativeVideoEngine {
  Future<String?>? _executable;

  Future<String?> get executable => _executable ??= _findExecutable();

  Future<String?> _findExecutable() async {
    final binary = Platform.isWindows ? 'ffmpeg.exe' : 'ffmpeg';
    final bundled = File(
      path.join(File(Platform.resolvedExecutable).parent.path, binary),
    );
    if (await bundled.exists()) return bundled.path;
    try {
      final result = await Process.run(
        Platform.isWindows ? 'where.exe' : 'which',
        [binary],
      );
      if (result.exitCode != 0) return null;
      final found = (result.stdout as String)
          .split(RegExp(r'[\r\n]+'))
          .first
          .trim();
      return await File(found).exists() ? found : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> convert({
    required String input,
    required String output,
    required NativeVideoOptions options,
    String? watermark,
    required void Function(double) onProgress,
    required void Function(Process) onProcess,
  }) async {
    final command = await executable;
    if (command == null) throw StateError('Native FFmpeg is not available.');
    final process = await Process.start(
      command,
      buildNativeVideoArgs(input, output, options, watermark: watermark),
      runInShell: false,
    );
    onProcess(process);
    final errors = <String>[];
    double? durationSeconds;
    final stderrDone = process.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .forEach((line) {
          final duration = RegExp(
            r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',
          ).firstMatch(line);
          if (duration != null) {
            durationSeconds =
                int.parse(duration[1]!) * 3600 +
                int.parse(duration[2]!) * 60 +
                double.parse(duration[3]!);
          }
          if (line.startsWith('out_time_us=') ||
              line.startsWith('out_time_ms=')) {
            final microseconds = int.tryParse(line.split('=').last);
            final total = options.trimEnd != null
                ? options.trimEnd! - (options.trimStart ?? 0)
                : (durationSeconds ?? 0) - (options.trimStart ?? 0);
            if (microseconds != null && total > 0) {
              onProgress(min(0.98, max(0.01, microseconds / 1000000 / total)));
            }
          }
          if (line.contains('Error') ||
              line.contains('Invalid') ||
              line.contains('failed')) {
            errors.add(line.trim());
            if (errors.length > 5) errors.removeAt(0);
          }
        });
    final stdoutDone = process.stdout.drain<void>();
    final code = await process.exitCode;
    await Future.wait([stderrDone, stdoutDone]);
    if (code != 0) {
      throw StateError(
        errors.isNotEmpty
            ? errors.last
            : 'Video conversion failed (code $code).',
      );
    }
    onProgress(1);
  }
}
