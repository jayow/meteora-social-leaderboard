import type { ReactNode } from "react";

/**
 * The one empty / not-found / error block: a centred title, a line of help and an optional action. No box:
 * it sits on the page surface.
 */
export function EmptyState({
  title,
  children,
  action,
  className = "",
  testId,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={`px-6 py-12 text-center ${className}`} data-testid={testId}>
      <h2 className="text-md font-semibold text-fg">{title}</h2>
      {children && <div className="mx-auto mt-1 max-w-md text-base text-mute">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Page title block: one size for every page title, optional one-line description and right-side slot. */
export function PageHeader({ title, description, children, testId }: { title: ReactNode; description?: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight" data-testid={testId}>
          {title}
        </h1>
        {description && <p className="mt-1 text-base text-mute">{description}</p>}
      </div>
      {children}
    </div>
  );
}
