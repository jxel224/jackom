import type { ReactNode } from 'react';
import { Panel } from '../../ui/Panel';

/** Player-only component. TV gameplay modules must never import this file. */
export function PrivatePromptCard({ title = 'معلومتك الخاصة', children }: { title?: string; children: ReactNode }) {
  return (
    <Panel as="section" variant="hard" className="flex flex-col gap-3" data-private-prompt>
      <h2 className="text-sm font-bold text-brand">{title}</h2>
      <div className="text-lg font-semibold leading-relaxed text-ink">{children}</div>
    </Panel>
  );
}
