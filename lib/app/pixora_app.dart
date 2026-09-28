import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/desktop_shell/presentation/desktop_shell_page.dart';
import 'theme/app_theme.dart';

class PixoraApp extends StatelessWidget {
  const PixoraApp({
    super.key,
    required this.preferences,
    this.locale,
    this.themeMode = ThemeMode.dark,
  });

  final SharedPreferences preferences;
  final Locale? locale;
  final ThemeMode themeMode;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Pixora',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      locale: locale,
      supportedLocales: const [Locale('en'), Locale('fa')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: DesktopShellPage(preferences: preferences),
    );
  }
}
