import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'native_video_http_api.dart';

class LocalWebServer {
  LocalWebServer._(this._server, this._token, this._videoApi) {
    _subscription = _server.listen(_handleRequest);
  }

  static const assetRoot = 'website/dist';

  final HttpServer _server;
  final String _token;
  final NativeVideoHttpApi _videoApi;
  late final StreamSubscription<HttpRequest> _subscription;

  int get port => _server.port;
  Uri get appUri => Uri.parse('http://127.0.0.1:$port/$_token/');
  Uri get healthUri => Uri.parse('http://127.0.0.1:$port/health');

  static Future<LocalWebServer> start(
    int port, {
    NativeVideoHttpApi? videoApi,
  }) async {
    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      port,
      shared: false,
    );
    return LocalWebServer._(
      server,
      _createToken(),
      videoApi ?? NativeVideoHttpApi(),
    );
  }

  static String _createToken() {
    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  Future<void> _handleRequest(HttpRequest request) async {
    final response = request.response;
    _applySecurityHeaders(response);

    if (request.method != 'GET' &&
        request.method != 'HEAD' &&
        !(request.method == 'POST' &&
            request.uri.path.startsWith('/$_token/api/video/'))) {
      response.statusCode = HttpStatus.methodNotAllowed;
      await response.close();
      return;
    }

    if (request.uri.path == '/health') {
      response.headers.contentType = ContentType.json;
      response.write('{"status":"ready"}');
      await response.close();
      return;
    }

    if (request.uri.path == '/') {
      response.redirect(appUri);
      await response.close();
      return;
    }

    final prefix = '/$_token';
    if (request.uri.path == prefix) {
      response.redirect(appUri);
      await response.close();
      return;
    }
    if (!request.uri.path.startsWith('$prefix/')) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }

    var relativePath = Uri.decodeComponent(
      request.uri.path.substring(prefix.length + 1),
    );
    if (relativePath.isEmpty) relativePath = 'index.html';
    if (!_isSafePath(relativePath)) {
      response.statusCode = HttpStatus.badRequest;
      await response.close();
      return;
    }

    if (relativePath.startsWith('api/video/')) {
      await _videoApi.handle(
        request,
        relativePath.substring('api/video/'.length),
      );
      return;
    }

    await _serveAsset(request, relativePath);
  }

  Future<void> _serveAsset(HttpRequest request, String relativePath) async {
    final response = request.response;
    ByteData data;
    var resolvedPath = relativePath;
    try {
      data = await rootBundle.load('$assetRoot/$resolvedPath');
    } on FlutterError {
      if (relativePath.contains('.')) {
        response.statusCode = HttpStatus.notFound;
        await response.close();
        return;
      }
      resolvedPath = 'index.html';
      try {
        data = await rootBundle.load('$assetRoot/$resolvedPath');
      } on FlutterError {
        response.statusCode = HttpStatus.serviceUnavailable;
        response.write('Pixora web assets are missing. Run the website build.');
        await response.close();
        return;
      }
    }

    response.headers.set(
      HttpHeaders.contentTypeHeader,
      _contentType(resolvedPath),
    );
    response.headers.set(
      HttpHeaders.cacheControlHeader,
      resolvedPath.startsWith('assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
    );
    if (request.method != 'HEAD') {
      response.add(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
    }
    await response.close();
  }

  static bool _isSafePath(String path) {
    if (path.startsWith('/') || path.contains('\\')) return false;
    return !path.split('/').any((segment) => segment == '..');
  }

  static void _applySecurityHeaders(HttpResponse response) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; "
          "style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; "
          "worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; "
          "frame-ancestors 'none'; base-uri 'self'",
    );
  }

  static String _contentType(String path) {
    final extension = path.split('.').last.toLowerCase();
    return switch (extension) {
      'html' => 'text/html; charset=utf-8',
      'js' || 'mjs' => 'text/javascript; charset=utf-8',
      'css' => 'text/css; charset=utf-8',
      'json' || 'webmanifest' => 'application/json; charset=utf-8',
      'svg' => 'image/svg+xml',
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'webp' => 'image/webp',
      'gif' => 'image/gif',
      'ico' => 'image/x-icon',
      'wasm' => 'application/wasm',
      'woff' => 'font/woff',
      'woff2' => 'font/woff2',
      'ttf' => 'font/ttf',
      'map' => 'application/json',
      _ => 'application/octet-stream',
    };
  }

  Future<void> close() async {
    await _subscription.cancel();
    await _videoApi.close();
    await _server.close(force: true);
  }
}
