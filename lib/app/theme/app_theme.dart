import 'package:flutter/material.dart';

abstract final class AppColors {
  static const accent = Color(0xFF5B5BD6);
  static const accentLight = Color(0xFFEEEEFF);
  static const background = Color(0xFFF7F7FA);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE5E5EC);
  static const text = Color(0xFF202027);
  static const mutedText = Color(0xFF6F6F7B);
  static const success = Color(0xFF16845B);
  static const warning = Color(0xFFB46A08);
  static const danger = Color(0xFFCA3B45);
}

abstract final class AppTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.accent,
      brightness: brightness,
      surface: isDark ? const Color(0xFF1B1B20) : AppColors.surface,
    );
    final base = ThemeData(
      brightness: brightness,
      colorScheme: scheme,
      useMaterial3: true,
      fontFamily: 'Segoe UI',
      scaffoldBackgroundColor: isDark
          ? const Color(0xFF131316)
          : AppColors.background,
      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: isDark ? const Color(0xFFF1F1F4) : AppColors.text,
        displayColor: isDark ? const Color(0xFFF1F1F4) : AppColors.text,
      ),
      dividerColor: isDark ? const Color(0xFF323239) : AppColors.border,
      cardTheme: CardThemeData(
        elevation: 0,
        color: isDark ? const Color(0xFF1B1B20) : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: isDark ? const Color(0xFF323239) : AppColors.border,
          ),
        ),
      ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: isDark
            ? const Color(0xFF131316)
            : AppColors.background,
        surfaceTintColor: Colors.transparent,
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: isDark ? const Color(0xFF1B1B20) : AppColors.surface,
        selectedColor: isDark
            ? AppColors.accent.withValues(alpha: 0.24)
            : AppColors.accentLight,
        side: BorderSide(
          color: isDark ? const Color(0xFF3A3A42) : AppColors.border,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF24242A) : const Color(0xFFFAFAFC),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
            color: isDark ? const Color(0xFF3A3A42) : AppColors.border,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      tooltipTheme: const TooltipThemeData(
        waitDuration: Duration(milliseconds: 450),
      ),
    );
  }
}
