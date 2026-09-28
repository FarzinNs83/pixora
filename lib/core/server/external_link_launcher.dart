import 'dart:io';

bool isSafeExternalUrl(Object? value) {
  if (value is! String || value.length > 2048) return false;
  final uri = Uri.tryParse(value);
  if (uri == null) return false;
  if (uri.scheme == 'https') {
    return uri.host.isNotEmpty && uri.userInfo.isEmpty;
  }
  return uri.scheme == 'mailto' &&
      uri.path.contains('@') &&
      !uri.path.contains('\n') &&
      !uri.path.contains('\r');
}

Future<void> launchExternalLink(Object? value) async {
  if (!isSafeExternalUrl(value)) return;
  final command = Platform.isWindows
      ? 'explorer.exe'
      : Platform.isMacOS
      ? 'open'
      : 'xdg-open';
  await Process.start(command, [
    value as String,
  ], mode: ProcessStartMode.detached);
}
