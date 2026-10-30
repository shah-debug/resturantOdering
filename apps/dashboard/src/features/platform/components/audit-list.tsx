import type { AuditEntry } from '@app/contracts';

export function describeChanges(changes: unknown): string {
  if (!changes || typeof changes !== 'object') {
    return '';
  }
  return Object.entries(changes as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(' · ');
}

export function AuditList({
  entries,
  showOrganization,
}: {
  entries: AuditEntry[];
  showOrganization: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit entries.</p>;
  }
  return (
    <ol className="grid gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="grid gap-0.5 rounded-lg border bg-card px-4 py-3 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <code className="text-xs font-semibold">{entry.action}</code>
            <span className="text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
            </span>
          </span>
          <span className="text-muted-foreground">
            {entry.actor ? `${entry.actor.fullName} (${entry.actor.email})` : 'System or customer'}
            {showOrganization && entry.organizationName ? ` · ${entry.organizationName}` : ''}
            {entry.ipAddress ? ` · IP ${entry.ipAddress}` : ''}
          </span>
          {describeChanges(entry.changes) ? (
            <span className="break-words">{describeChanges(entry.changes)}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
