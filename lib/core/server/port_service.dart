import 'dart:io';

enum PortValidationFailure { invalid, reserved, unavailable }

class PortValidationResult {
  const PortValidationResult._({required this.isValid, this.failure});

  const PortValidationResult.valid() : this._(isValid: true);

  const PortValidationResult.invalid(PortValidationFailure failure)
    : this._(isValid: false, failure: failure);

  final bool isValid;
  final PortValidationFailure? failure;
}

class PortService {
  const PortService();

  static const minUserPort = 1024;
  static const maxPort = 65535;

  PortValidationResult validateValue(int? port) {
    if (port == null || port < 1 || port > maxPort) {
      return const PortValidationResult.invalid(PortValidationFailure.invalid);
    }
    if (port < minUserPort) {
      return const PortValidationResult.invalid(PortValidationFailure.reserved);
    }
    return const PortValidationResult.valid();
  }

  Future<bool> isAvailable(int port) async {
    if (!validateValue(port).isValid) return false;
    try {
      final socket = await ServerSocket.bind(
        InternetAddress.loopbackIPv4,
        port,
        shared: false,
      );
      await socket.close();
      return true;
    } on SocketException {
      return false;
    }
  }

  Future<int> suggestAvailable() async {
    final socket = await ServerSocket.bind(
      InternetAddress.loopbackIPv4,
      0,
      shared: false,
    );
    final port = socket.port;
    await socket.close();
    return port;
  }
}
