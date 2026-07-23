import { LoadingIndicator } from '../components/ui/LoadingIndicator';

/** App Router loading foundation — shown automatically while a route segment (or its data) is still loading. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoadingIndicator size="lg" />
    </div>
  );
}
