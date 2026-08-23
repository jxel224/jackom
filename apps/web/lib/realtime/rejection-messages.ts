/** One short Arabic message per gameplay `RejectionCode` (see `packages/shared-types/src/events.ts`) — components render this, never a raw code. */
const MESSAGES: Record<string, string> = {
  STALE_PHASE: 'انتهت هذه المرحلة قبل إرسال إجراءك. حاول مجددًا في المرحلة الحالية.',
  DUPLICATE_ACTION: 'تم إرسال هذا الإجراء مسبقًا.',
  OUT_OF_ORDER: 'وصل إجراء قديم. حاول مجددًا.',
  NOT_PARTICIPANT: 'أنت لست مشاركًا في هذه الجولة.',
  INVALID_PLAYER_COUNT: 'عدد اللاعبين غير مناسب لبدء الجولة.',
  MATCH_IN_PROGRESS: 'الجولة بدأت بالفعل.',
  NOT_HACKER: 'هذا الإجراء متاح للهاكر فقط.',
  NOT_ELIGIBLE_VOTER: 'لا يمكنك المشاركة في هذا التصويت.',
  INVALID_ACTION: 'إجراء غير صالح.',
  INVALID_EVENT_FOR_STATE: 'هذا الإجراء غير متاح في المرحلة الحالية.',
  NOT_ADMIN: 'أنت لست المسؤول عن هذه الجولة.',
  INVALID_MINIGAME_ID: 'لعبة غير صالحة.',
  INVALID_PARTICIPANTS: 'عدد المشاركين أو اختيارهم غير صالح.',
  NO_HACKS_REMAINING: 'لا تملك عمليات اختراق متبقية.',
  ALREADY_HACKED_THIS_ROUND: 'استخدمت اختراقك لهذه الجولة بالفعل.',
  INVALID_TARGET: 'هذا اللاعب ليس هدفًا صالحًا.',
  TARGET_ALREADY_HACKED: 'تم استهداف هذا اللاعب بالفعل هذه الجولة.',
  FIREWALL_ACTIVE: 'الجدار الناري مفعّل — لا يمكن الاختراق هذه الجولة.',
  ACCUSATION_ON_COOLDOWN: 'زر الطوارئ غير متاح مؤقتًا بعد الاتهام السابق.',
  NOT_INITIATOR: 'أنت لست من بدأ هذا الاتهام.',
  INVALID_SUSPECTS: 'عدد المشتبهين أو اختيارهم غير صالح.',
};

export function arabicMessageForRejectionCode(code: string): string {
  return MESSAGES[code] ?? 'تعذر إرسال الإجراء. حاول مجددًا.';
}
