import 'dart:io';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/server/local_web_server.dart';
import '../../../core/server/port_service.dart';

enum DesktopShellPhase { initializing, choosingPort, connecting, ready }

class DesktopShellState extends Equatable {
  const DesktopShellState({
    this.phase = DesktopShellPhase.initializing,
    this.port,
    this.errorKey,
    this.appUri,
  });

  final DesktopShellPhase phase;
  final int? port;
  final String? errorKey;
  final Uri? appUri;

  DesktopShellState copyWith({
    DesktopShellPhase? phase,
    int? port,
    String? errorKey,
    bool clearError = false,
    Uri? appUri,
  }) => DesktopShellState(
    phase: phase ?? this.phase,
    port: port ?? this.port,
    errorKey: clearError ? null : errorKey ?? this.errorKey,
    appUri: appUri ?? this.appUri,
  );

  @override
  List<Object?> get props => [phase, port, errorKey, appUri];
}

class DesktopShellCubit extends Cubit<DesktopShellState> {
  DesktopShellCubit({
    required SharedPreferences preferences,
    PortService portService = const PortService(),
  }) : _preferences = preferences,
       _portService = portService,
       super(const DesktopShellState());

  static const portPreferenceKey = 'desktop_server_port';

  final SharedPreferences _preferences;
  final PortService _portService;
  LocalWebServer? _server;

  Future<void> initialize() async {
    final savedPort = _preferences.getInt(portPreferenceKey);
    if (savedPort == null) {
      emit(const DesktopShellState(phase: DesktopShellPhase.choosingPort));
      return;
    }
    await connect(savedPort.toString(), automatic: true);
  }

  Future<int> suggestPort() => _portService.suggestAvailable();

  Future<void> connect(String rawPort, {bool automatic = false}) async {
    final port = int.tryParse(rawPort.trim());
    final validation = _portService.validateValue(port);
    if (!validation.isValid) {
      emit(
        DesktopShellState(
          phase: DesktopShellPhase.choosingPort,
          port: port,
          errorKey: validation.failure == PortValidationFailure.reserved
              ? 'reservedPort'
              : 'invalidPort',
        ),
      );
      return;
    }

    emit(DesktopShellState(phase: DesktopShellPhase.connecting, port: port));
    try {
      await _server?.close();
      final server = await LocalWebServer.start(port!);
      _server = server;
      await _preferences.setInt(portPreferenceKey, port);
      emit(
        DesktopShellState(
          phase: DesktopShellPhase.ready,
          port: port,
          appUri: server.appUri,
        ),
      );
    } on SocketException {
      emit(
        DesktopShellState(
          phase: DesktopShellPhase.choosingPort,
          port: port,
          errorKey: automatic ? 'savedPortUnavailable' : 'portUnavailable',
        ),
      );
    }
  }

  Future<void> chooseAnotherPort() async {
    await _server?.close();
    _server = null;
    emit(
      DesktopShellState(
        phase: DesktopShellPhase.choosingPort,
        port: state.port,
      ),
    );
  }

  @override
  Future<void> close() async {
    await _server?.close();
    return super.close();
  }
}
