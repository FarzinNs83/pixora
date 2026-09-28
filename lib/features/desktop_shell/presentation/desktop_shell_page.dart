import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:desktop_webview_window/desktop_webview_window.dart'
    as desktop_webview;
import 'package:webview_windows/webview_windows.dart' as windows_webview;
import 'package:window_manager/window_manager.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/server/external_link_launcher.dart';
import '../application/desktop_shell_cubit.dart';
import 'widgets/pixora_title_bar.dart';

class DesktopShellPage extends StatelessWidget {
  const DesktopShellPage({super.key, required this.preferences});

  final SharedPreferences preferences;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DesktopShellCubit(preferences: preferences)..initialize(),
      child: const _DesktopShellView(),
    );
  }
}

class _DesktopShellView extends StatefulWidget {
  const _DesktopShellView();

  @override
  State<_DesktopShellView> createState() => _DesktopShellViewState();
}

class _DesktopShellViewState extends State<_DesktopShellView> {
  Brightness? _webBrightness;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (Platform.isWindows)
          PixoraTitleBar(
            brightness: _webBrightness ?? Theme.of(context).brightness,
          ),
        Expanded(
          child: BlocBuilder<DesktopShellCubit, DesktopShellState>(
            builder: (context, state) => AnimatedSwitcher(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 220),
              child: switch (state.phase) {
                DesktopShellPhase.initializing => const _SplashView(
                  key: ValueKey('splash'),
                ),
                DesktopShellPhase.connecting => _SplashView(
                  key: const ValueKey('connecting'),
                  message: _text(context, 'starting'),
                ),
                DesktopShellPhase.choosingPort => _PortSetupView(
                  key: const ValueKey('port'),
                  initialPort: state.port,
                  errorKey: state.errorKey,
                ),
                DesktopShellPhase.ready => _WebAppLauncher(
                  key: ValueKey(state.appUri),
                  uri: state.appUri!,
                  onThemeChanged: _setWebBrightness,
                ),
              },
            ),
          ),
        ),
      ],
    );
  }

  void _setWebBrightness(Brightness brightness) {
    if (_webBrightness == brightness) return;
    setState(() => _webBrightness = brightness);
  }
}

class _SplashView extends StatelessWidget {
  const _SplashView({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Image.asset(
                'website/dist/pixora-mark-192.png',
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    const Icon(Icons.auto_awesome_rounded, color: Colors.white),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'Pixora',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            Text(
              message ?? _text(context, 'preparing'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            const SizedBox(
              width: 150,
              child: LinearProgressIndicator(minHeight: 3),
            ),
          ],
        ),
      ),
    );
  }
}

class _PortSetupView extends StatefulWidget {
  const _PortSetupView({super.key, this.initialPort, this.errorKey});

  final int? initialPort;
  final String? errorKey;

  @override
  State<_PortSetupView> createState() => _PortSetupViewState();
}

class _PortSetupViewState extends State<_PortSetupView> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _controller;
  bool _suggesting = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: widget.initialPort?.toString() ?? '47832',
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rtl = Localizations.localeOf(context).languageCode == 'fa';
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: constraints.maxWidth < 620 ? 22 : 42,
              vertical: 32,
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight - 64,
              ),
              child: Center(
                child: SizedBox(
                  width: 480,
                  child: Form(
                    key: _formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Icon(
                          Icons.dns_outlined,
                          size: 42,
                          color: AppColors.accent,
                        ),
                        const SizedBox(height: 18),
                        Text(
                          _text(context, 'portTitle'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          _text(context, 'portDescription'),
                          textAlign: TextAlign.center,
                          style: Theme.of(
                            context,
                          ).textTheme.bodyMedium?.copyWith(height: 1.6),
                        ),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _controller,
                          textDirection: TextDirection.ltr,
                          textAlign: rtl ? TextAlign.right : TextAlign.left,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: _text(context, 'portLabel'),
                            helperText: _text(context, 'portExample'),
                            prefixIcon: const Icon(Icons.lan_outlined),
                          ),
                          validator: (value) {
                            final port = int.tryParse(value?.trim() ?? '');
                            if (port == null || port < 1024 || port > 65535) {
                              return _text(context, 'invalidPort');
                            }
                            return null;
                          },
                          onFieldSubmitted: (_) => _submit(),
                        ),
                        if (widget.errorKey != null) ...[
                          const SizedBox(height: 12),
                          _InlineError(
                            message: _text(context, widget.errorKey!),
                          ),
                        ],
                        const SizedBox(height: 18),
                        FilledButton.icon(
                          onPressed: _submit,
                          icon: const Icon(Icons.check_circle_outline),
                          label: Text(_text(context, 'checkAndOpen')),
                        ),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: _suggesting ? null : _suggest,
                          icon: const Icon(Icons.casino_outlined),
                          label: Text(_text(context, 'suggestPort')),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    context.read<DesktopShellCubit>().connect(_controller.text);
  }

  Future<void> _suggest() async {
    setState(() => _suggesting = true);
    final port = await context.read<DesktopShellCubit>().suggestPort();
    if (!mounted) return;
    _controller.text = port.toString();
    setState(() => _suggesting = false);
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        Icon(
          Icons.error_outline,
          color: Theme.of(context).colorScheme.onErrorContainer,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
          ),
        ),
      ],
    ),
  );
}

class _WebAppLauncher extends StatefulWidget {
  const _WebAppLauncher({
    super.key,
    required this.uri,
    required this.onThemeChanged,
  });
  final Uri uri;
  final ValueChanged<Brightness> onThemeChanged;

  @override
  State<_WebAppLauncher> createState() => _WebAppLauncherState();
}

class _WebAppLauncherState extends State<_WebAppLauncher> {
  String? _error;
  windows_webview.WebviewController? _controller;
  StreamSubscription<dynamic>? _themeSubscription;
  StreamSubscription<String>? _urlSubscription;
  bool _environmentReady = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _launch());
  }

  @override
  void dispose() {
    unawaited(_themeSubscription?.cancel());
    unawaited(_urlSubscription?.cancel());
    final controller = _controller;
    if (controller != null) unawaited(controller.dispose());
    super.dispose();
  }

  Future<void> _launch() async {
    if (Platform.isWindows) {
      await _launchEmbeddedWebView();
      return;
    }
    await _launchExternalWebView();
  }

  Future<void> _launchEmbeddedWebView() async {
    final webviewBackground = Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF151518)
        : const Color(0xFFF6F6F8);
    windows_webview.WebviewController? initializedController;
    try {
      final runtimeVersion =
          await windows_webview.WebviewController.getWebViewVersion();
      if (runtimeVersion == null) {
        throw StateError('Microsoft Edge WebView2 Runtime is not available.');
      }
      if (!_environmentReady) {
        final supportDirectory = await getApplicationSupportDirectory();
        await windows_webview.WebviewController.initializeEnvironment(
          // Reuse the existing WebView2 profile so saved theme/language and
          // other local browser settings survive the title-bar migration.
          userDataPath: path.join(supportDirectory.path, 'webview'),
        );
        _environmentReady = true;
      }
      final controller = windows_webview.WebviewController();
      await controller.initialize();
      initializedController = controller;
      await controller.setBackgroundColor(webviewBackground);
      await controller.setPopupWindowPolicy(
        windows_webview.WebviewPopupWindowPolicy.deny,
      );
      _themeSubscription = controller.webMessage.listen(_handleWebMessage);
      _urlSubscription = controller.url.listen((url) {
        final target = Uri.tryParse(url);
        final allowed =
            target != null &&
            target.host == widget.uri.host &&
            target.port == widget.uri.port;
        if (!allowed && target?.scheme != 'about') {
          unawaited(controller.stop());
          unawaited(controller.loadUrl(widget.uri.toString()));
        }
      });
      await controller.loadUrl(widget.uri.toString());
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _error = null;
      });
      initializedController = null;
    } catch (error) {
      await _themeSubscription?.cancel();
      await _urlSubscription?.cancel();
      _themeSubscription = null;
      _urlSubscription = null;
      if (initializedController != null) {
        await initializedController.dispose();
      }
      if (mounted) setState(() => _error = error.toString());
    }
  }

  void _handleWebMessage(dynamic message) {
    if (message is! Map || message['source'] != 'pixora') return;
    if (message['type'] == 'externalLink') {
      unawaited(launchExternalLink(message['value']));
      return;
    }
    if (message['type'] != 'theme') return;
    final value = message['value'];
    if (value == 'dark') widget.onThemeChanged(Brightness.dark);
    if (value == 'light') widget.onThemeChanged(Brightness.light);
  }

  Future<void> _launchExternalWebView() async {
    try {
      final available =
          await desktop_webview.WebviewWindow.isWebviewAvailable();
      if (!available) {
        throw StateError('Native WebView runtime is not available.');
      }
      final supportDirectory = await getApplicationSupportDirectory();
      final webview = await desktop_webview.WebviewWindow.create(
        configuration: desktop_webview.CreateConfiguration(
          title: 'Pixora',
          windowWidth: 1280,
          windowHeight: 820,
          titleBarHeight: 0,
          titleBarTopPadding: 0,
          userDataFolderWindows: path.join(supportDirectory.path, 'webview'),
        ),
      );
      webview
        ..setApplicationNameForUserAgent(' Pixora/1.0.0')
        ..setOnUrlRequestCallback((url) {
          final target = Uri.tryParse(url);
          return target != null &&
              target.host == widget.uri.host &&
              target.port == widget.uri.port;
        })
        ..launch(widget.uri.toString());
      if (Platform.isMacOS) {
        webview.registerJavaScriptMessageHandler('pixora', (_, body) {
          if (body is Map &&
              body['source'] == 'pixora' &&
              body['type'] == 'externalLink') {
            unawaited(launchExternalLink(body['value']));
          }
        });
      }
      await windowManager.hide();
      await webview.onClose;
      await windowManager.close();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller != null && controller.value.isInitialized) {
      return ColoredBox(
        color: Theme.of(context).scaffoldBackgroundColor,
        child: windows_webview.Webview(
          controller,
          permissionRequested: (_, _, _) async =>
              windows_webview.WebviewPermissionDecision.deny,
        ),
      );
    }
    if (_error == null) {
      return const _SplashView(message: 'Opening Pixora');
    }
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.web_asset_off_outlined, size: 42),
              const SizedBox(height: 14),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _launch, child: const Text('Try again')),
            ],
          ),
        ),
      ),
    );
  }
}

String _text(BuildContext context, String key) {
  final fa = Localizations.localeOf(context).languageCode == 'fa';
  const en = {
    'preparing': 'Preparing your local workspace',
    'starting': 'Starting the private local server',
    'portTitle': 'Choose a local port',
    'portDescription':
        'Pixora uses this port only on your computer. Your files are never sent to the internet.',
    'portLabel': 'Port number',
    'portExample': 'Example: 47832 (allowed range: 1024-65535)',
    'checkAndOpen': 'Check port and open Pixora',
    'suggestPort': 'Suggest an available port',
    'invalidPort': 'Enter a number from 1024 to 65535.',
    'reservedPort': 'Ports below 1024 are reserved. Choose a higher number.',
    'portUnavailable': 'This port is already in use. Enter another one.',
    'savedPortUnavailable':
        'Your saved port is unavailable. Choose another port.',
  };
  const faText = {
    'preparing': 'در حال آماده‌سازی فضای کار محلی',
    'starting': 'در حال اجرای سرور خصوصی روی دستگاه',
    'portTitle': 'یک پورت محلی انتخاب کنید',
    'portDescription':
        'پیکسورا این پورت را فقط روی کامپیوتر شما استفاده می‌کند. هیچ فایلی به اینترنت ارسال نمی‌شود.',
    'portLabel': 'شماره پورت',
    'portExample': 'مثال: 47832 (محدوده مجاز: 1024 تا 65535)',
    'checkAndOpen': 'بررسی پورت و ورود به پیکسورا',
    'suggestPort': 'پیشنهاد یک پورت آزاد',
    'invalidPort': 'یک عدد بین 1024 تا 65535 وارد کنید.',
    'reservedPort':
        'پورت‌های کمتر از 1024 رزرو شده‌اند. عدد بزرگ‌تری انتخاب کنید.',
    'portUnavailable': 'این پورت در حال استفاده است. یک پورت دیگر وارد کنید.',
    'savedPortUnavailable':
        'پورت ذخیره‌شده در دسترس نیست. یک پورت دیگر انتخاب کنید.',
  };
  return (fa ? faText : en)[key] ?? key;
}
