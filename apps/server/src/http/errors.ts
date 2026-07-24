import type { ApiErrorCode } from '../shared.js';

/**
 * The one exception type every HTTP route handler throws. `HttpApiServer`'s central catch-all
 * converts it into `{code, message}` at the given status — nothing else (a stack trace, a Redis
 * error, an internal exception message) ever reaches the response body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const ApiErrors = {
  invalidRequest: (message = 'الطلب غير صالح.') => new ApiError(400, 'INVALID_REQUEST', message),
  invalidRoomCode: (message = 'رمز الغرفة غير صالح.') => new ApiError(400, 'INVALID_ROOM_CODE', message),
  roomNotFound: (message = 'الغرفة غير موجودة.') => new ApiError(404, 'ROOM_NOT_FOUND', message),
  roomFull: (message = 'الغرفة ممتلئة.') => new ApiError(409, 'ROOM_FULL', message),
  roomNotJoinable: (message = 'لا يمكن الانضمام إلى هذه الغرفة الآن.') => new ApiError(409, 'ROOM_NOT_JOINABLE', message),
  invalidDisplayName: (message = 'الاسم غير صالح.') => new ApiError(400, 'INVALID_DISPLAY_NAME', message),
  duplicatePlayer: (message = 'تم استلام طلب مطابق مسبقًا بمعرّف مختلف.') => new ApiError(409, 'DUPLICATE_PLAYER', message),
  rateLimited: (message = 'محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.') => new ApiError(429, 'RATE_LIMITED', message),
  internal: (message = 'حدث خطأ في الخادم. حاول مرة أخرى.') => new ApiError(500, 'INTERNAL_ERROR', message),
};
