import type { StatusBadgeTone } from '../../components/ui/StatusBadge';
import type { ConnectionState } from './types';

export interface ConnectionStatusDescription {
  label: string;
  tone: StatusBadgeTone;
}

/**
 * One Arabic label + visual tone per connection state, shared by the TV and player lobbies — the
 * status must be understandable from the TEXT alone (never color-only), matching the accessibility
 * requirement in the Step 7B brief.
 */
export function describeConnectionState(state: ConnectionState): ConnectionStatusDescription {
  switch (state) {
    case 'idle':
      return { label: 'بانتظار الجلسة', tone: 'neutral' };
    case 'connecting':
      return { label: 'جاري الاتصال', tone: 'info' };
    case 'authenticating':
      return { label: 'جاري التحقق من الجلسة', tone: 'info' };
    case 'connected':
      return { label: 'متصل', tone: 'success' };
    case 'reconnecting':
      return { label: 'جاري إعادة الاتصال', tone: 'warning' };
    case 'disconnected':
      return { label: 'انقطع الاتصال مؤقتًا', tone: 'warning' };
    case 'unauthorized':
      return { label: 'انتهت الجلسة، انضم من جديد', tone: 'danger' };
    case 'failed':
      return { label: 'تعذر الاتصال بالخادم', tone: 'danger' };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
