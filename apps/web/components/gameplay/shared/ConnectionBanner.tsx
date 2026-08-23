import type { ConnectionState } from '../../../lib/realtime/types';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/StatusBadge';

export function ConnectionBanner({ state, onRetry }: { state: ConnectionState; onRetry?: () => void }) {
  if (state === 'connected') return null;
  const recoverable = state === 'failed' || state === 'disconnected';
  const label = state === 'reconnecting' ? 'جاري إعادة الاتصال…'
    : state === 'connecting' || state === 'authenticating' ? 'جاري الاتصال…'
      : recoverable ? 'انقطع الاتصال' : state === 'unauthorized' ? 'انتهت الجلسة' : 'بانتظار الاتصال';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="status" aria-live="polite">
      <StatusBadge tone={recoverable || state === 'unauthorized' ? 'danger' : 'info'}>{label}</StatusBadge>
      {recoverable && onRetry ? <Button variant="secondary" onClick={onRetry}>إعادة المحاولة</Button> : null}
    </div>
  );
}
