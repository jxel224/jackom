import type { ApiClientErrorCode } from './client';

/** One Arabic message per typed error code — components render this, never a raw exception message. */
const MESSAGES: Record<ApiClientErrorCode, string> = {
  INVALID_REQUEST: 'الطلب غير صالح.',
  INVALID_ROOM_CODE: 'رمز الغرفة غير صالح.',
  ROOM_NOT_FOUND: 'الغرفة غير موجودة.',
  ROOM_EXPIRED: 'انتهت صلاحية هذه الغرفة.',
  ROOM_FULL: 'الغرفة ممتلئة.',
  ROOM_NOT_JOINABLE: 'لا يمكن الانضمام إلى هذه الغرفة الآن.',
  INVALID_DISPLAY_NAME: 'الاسم غير صالح. الرجاء إدخال اسم صحيح.',
  DUPLICATE_PLAYER: 'تم استلام هذا الطلب مسبقًا.',
  RATE_LIMITED: 'محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.',
  INTERNAL_ERROR: 'حدث خطأ في الخادم. حاول مرة أخرى.',
  NETWORK_ERROR: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.',
  TIMEOUT: 'انتهت مهلة الاتصال بالخادم.',
  NOT_CONFIGURED: 'الخدمة غير متاحة حاليًا.',
  // Permanent Business Backend (Users/Auth/Ownership) — see PERMANENT_BACKEND_FOUNDATION_REPORT.md.
  INVALID_EMAIL: 'البريد الإلكتروني غير صالح.',
  WEAK_PASSWORD: 'كلمة المرور قصيرة جدًا (٨ أحرف على الأقل).',
  INVALID_DISPLAY_NAME_LENGTH: 'الاسم غير صالح. الرجاء إدخال اسم صحيح.',
  EMAIL_ALREADY_REGISTERED: 'هذا البريد الإلكتروني مسجّل بالفعل.',
  INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  UNAUTHENTICATED: 'يجب تسجيل الدخول أولًا.',
  GAME_NOT_FOUND: 'اللعبة غير موجودة.',
  GAME_NOT_ACTIVE: 'هذه اللعبة غير متاحة حاليًا.',
  GAME_NOT_OWNED: 'أنت لا تملك هذه اللعبة.',
};

/** Falls back to the server-supplied message (already Arabic-friendly) when a code has no local override needed, else a safe generic message. */
export function arabicMessageForErrorCode(code: ApiClientErrorCode, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? 'حدث خطأ غير متوقع.';
}
