import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as path;

import 'native_video_engine.dart';

class NativeVideoHttpApi {
  NativeVideoHttpApi({NativeVideoEngine? engine})
    : _engine = engine ?? NativeVideoEngine();

  final NativeVideoEngine _engine;
  final Map<String, _NativeVideoJob> _jobs = {};

  Future<void> handle(HttpRequest request, String route) async {
    if (route == 'capabilities' && request.method == 'GET') {
      await _json(request.response, HttpStatus.ok, {
        'desktop': true,
        'available': await _engine.executable != null,
      });
      return;
    }
    final match = RegExp(
      r'^jobs/([A-Za-z0-9-]{1,80})/(watermark|convert|status|cancel)$',
    ).firstMatch(route);
    if (match == null) {
      await _json(request.response, HttpStatus.notFound, {
        'error': 'Not found.',
      });
      return;
    }
    final id = match[1]!;
    final action = match[2]!;
    if (action == 'status' && request.method == 'GET') {
      final job = _jobs[id];
      await _json(
        request.response,
        job == null ? HttpStatus.notFound : HttpStatus.ok,
        {'status': job?.status ?? 'missing', 'progress': job?.progress ?? 0},
      );
    } else if (action == 'watermark' && request.method == 'POST') {
      await _saveWatermark(request, id);
    } else if (action == 'convert' && request.method == 'POST') {
      await _convert(request, id);
    } else if (action == 'cancel' && request.method == 'POST') {
      await _cancel(request, id);
    } else {
      await _json(request.response, HttpStatus.methodNotAllowed, {
        'error': 'Method not allowed.',
      });
    }
  }

  Future<_NativeVideoJob> _getOrCreate(String id) async {
    final existing = _jobs[id];
    if (existing != null) return existing;
    final directory = await Directory.systemTemp.createTemp('pixora-video-');
    final job = _NativeVideoJob(directory);
    _jobs[id] = job;
    return job;
  }

  Future<void> _saveWatermark(HttpRequest request, String id) async {
    final job = await _getOrCreate(id);
    if (job.running) {
      await _json(request.response, HttpStatus.conflict, {
        'error': 'Conversion already started.',
      });
      return;
    }
    final file = File(path.join(job.directory.path, 'watermark.png'));
    try {
      await _saveBody(request, file);
      job.watermark = file;
      await _json(request.response, HttpStatus.ok, {'ready': true});
    } catch (error) {
      await _json(request.response, HttpStatus.badRequest, {'error': '$error'});
      await _dispose(id);
    }
  }

  Future<void> _convert(HttpRequest request, String id) async {
    final response = request.response;
    NativeVideoOptions options;
    try {
      final raw = request.headers.value('x-pixora-options');
      options = NativeVideoOptions.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw ?? '') as Map),
      );
    } catch (error) {
      await _json(response, HttpStatus.badRequest, {'error': '$error'});
      return;
    }
    if (await _engine.executable == null) {
      await _json(response, HttpStatus.serviceUnavailable, {
        'error': 'Native FFmpeg is not available.',
      });
      return;
    }
    final job = await _getOrCreate(id);
    if (job.running) {
      await _json(response, HttpStatus.conflict, {
        'error': 'Conversion already started.',
      });
      return;
    }
    job.running = true;
    final extension = request.headers.value('x-pixora-extension') ?? 'bin';
    final safeExtension = RegExp(r'^[a-zA-Z0-9]{1,8}$').hasMatch(extension)
        ? extension.toLowerCase()
        : 'bin';
    final input = File(path.join(job.directory.path, 'input.$safeExtension'));
    final output = File(
      path.join(job.directory.path, 'output.${options.format}'),
    );
    var responseStarted = false;
    try {
      job.status = 'uploading';
      await _saveBody(request, input);
      if (job.cancelled) throw const _CancelledVideoJob();
      job.status = 'processing';
      await _engine.convert(
        input: input.path,
        output: output.path,
        options: options,
        watermark: job.watermark?.path,
        onProgress: (value) => job.progress = value,
        onProcess: (process) {
          job.process = process;
          if (job.cancelled) process.kill();
        },
      );
      if (job.cancelled) throw const _CancelledVideoJob();
      if (!await output.exists() || await output.length() == 0) {
        throw StateError('FFmpeg did not create an output file.');
      }
      job.status = 'done';
      response.statusCode = HttpStatus.ok;
      response.headers.contentType = ContentType.parse(
        _mimeType(options.format),
      );
      response.contentLength = await output.length();
      responseStarted = true;
      await response.addStream(output.openRead());
      await response.close();
    } catch (error) {
      if (!responseStarted) {
        job.status = job.cancelled ? 'cancelled' : 'error';
        try {
          await _json(
            response,
            job.cancelled
                ? HttpStatus.conflict
                : HttpStatus.unprocessableEntity,
            {'error': '$error'},
          );
        } catch (_) {
          // The WebView may have aborted the request while cancelling.
        }
      }
    } finally {
      await _dispose(id);
    }
  }

  Future<void> _cancel(HttpRequest request, String id) async {
    final job = _jobs[id];
    if (job != null) {
      job.cancelled = true;
      job.process?.kill();
      if (!job.running) await _dispose(id);
    }
    await _json(request.response, HttpStatus.ok, {'cancelled': true});
  }

  Future<void> _dispose(String id) async {
    final job = _jobs.remove(id);
    if (job == null) return;
    try {
      if (await job.directory.exists()) {
        await job.directory.delete(recursive: true);
      }
    } catch (_) {
      // Windows can briefly hold an output handle after request cancellation.
    }
  }

  Future<void> close() async {
    final ids = _jobs.keys.toList();
    for (final id in ids) {
      final process = _jobs[id]?.process;
      if (process != null) {
        process.kill();
        await process.exitCode;
      }
      await _dispose(id);
    }
  }
}

class _NativeVideoJob {
  _NativeVideoJob(this.directory);
  final Directory directory;
  File? watermark;
  Process? process;
  bool running = false;
  bool cancelled = false;
  String status = 'ready';
  double progress = 0;
}

class _CancelledVideoJob implements Exception {
  const _CancelledVideoJob();
  @override
  String toString() => 'Video conversion cancelled.';
}

Future<void> _saveBody(HttpRequest request, File target) async {
  final sink = target.openWrite();
  try {
    await sink.addStream(request);
    await sink.flush();
  } finally {
    await sink.close();
  }
}

Future<void> _json(
  HttpResponse response,
  int status,
  Map<String, Object?> body,
) async {
  response.statusCode = status;
  response.headers.contentType = ContentType.json;
  response.write(jsonEncode(body));
  await response.close();
}

String _mimeType(String format) => switch (format) {
  'mp4' => 'video/mp4',
  'webm' => 'video/webm',
  'mov' => 'video/quicktime',
  'mkv' => 'video/x-matroska',
  'gif' => 'image/gif',
  'mp3' => 'audio/mpeg',
  _ => 'audio/wav',
};
