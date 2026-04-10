import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useAllMembersFgacQueries,
  useFgacSchemaQueries,
  useProjectClientsQuery,
  useProjectDetailQuery,
  useProjectMembersQuery,
  useProjectScopeSetsQuery,
} from '@/hooks/use-oidc-queries';
import { type FgacDocType, FGAC_DOC_TYPES } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowUpRight,
  BookMarked,
  Fingerprint,
  Layers2,
  Search,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type MatrixRow = {
  readonly userId: string;
  readonly email: string;
  readonly projectMembershipRole: string;
  readonly resourceType: FgacDocType;
  readonly relation: string;
  readonly resourceId: string;
  readonly resourceLabel: string;
  readonly effectivePermissions: readonly string[];
  readonly oidcScopes: readonly string[] | null;
  readonly expiresAt: number | null;
};

const TYPE_STYLES: Record<string, string> = {
  project:
    'border-primary/40 bg-primary/[0.1] text-primary shadow-[inset_0_-2px_0_0_hsl(var(--primary)/0.2)]',
  client:
    'border-accent-foreground/30 bg-accent/30 text-accent-foreground shadow-[inset_0_-2px_0_0_hsl(var(--accent)/0.25)]',
  scope_set:
    'border-secondary-foreground/25 bg-secondary/90 text-secondary-foreground shadow-[inset_0_-2px_0_0_hsl(var(--border)/0.6)]',
  user: 'border-muted-foreground/35 bg-muted text-muted-foreground shadow-[inset_0_-2px_0_0_hsl(var(--muted-foreground)/0.12)]',
};

const TYPE_RULE: Record<string, string> = {
  project: 'bg-primary',
  client: 'bg-accent',
  scope_set: 'bg-secondary-foreground/50',
  user: 'bg-muted-foreground/45',
};

function typePillClass(type: string): string {
  return TYPE_STYLES[type] ?? 'border-border/70 bg-card text-foreground';
}

function typeRuleClass(type: string): string {
  return TYPE_RULE[type] ?? 'bg-border';
}

export function AccessOverviewPage() {
  const { slug } = useParams({ from: '/app/projects/$slug/access' });
  const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');

  const projectDetailQuery = useProjectDetailQuery(slug);
  const membersQuery = useProjectMembersQuery(slug);
  const clientsQuery = useProjectClientsQuery(slug);
  const scopeSetsQuery = useProjectScopeSetsQuery(slug);

  const docTypesForUi = useMemo(
    () => projectDetailQuery.data?.fgacDocTypes.merged ?? [...FGAC_DOC_TYPES],
    [projectDetailQuery.data?.fgacDocTypes.merged],
  );

  const memberUserIds = useMemo(
    () => (membersQuery.data ?? []).map((m) => m.userId),
    [membersQuery.data],
  );

  const schemaQueries = useFgacSchemaQueries(slug, docTypesForUi);
  const fgacQueries = useAllMembersFgacQueries(slug, memberUserIds, docTypesForUi);

  const projectId = projectDetailQuery.data?.id ?? null;

  const memberById = useMemo(() => {
    const m = new Map<string, { email: string; name: string | null; role: string }>();
    for (const row of membersQuery.data ?? []) {
      m.set(row.userId, {
        email: row.user?.email ?? row.userId,
        name: row.user?.name ?? null,
        role: row.role,
      });
    }
    return m;
  }, [membersQuery.data]);

  const resolveLabel = useMemo(() => {
    return (type: FgacDocType, id: string): string => {
      if (type === 'project' && projectId === id)
        return projectDetailQuery.data?.name ?? id.slice(0, 8);
      if (type === 'client') {
        const c = clientsQuery.data?.find((x) => x.id === id);
        return c ? `${c.name} (${c.clientId})` : id.slice(0, 8);
      }
      if (type === 'scope_set') {
        const s = scopeSetsQuery.data?.find((x) => x.id === id);
        return s?.name ?? id.slice(0, 8);
      }
      if (type === 'user') {
        const u = memberById.get(id);
        return u ? u.email : id.slice(0, 8);
      }
      return id.slice(0, 8);
    };
  }, [
    projectId,
    projectDetailQuery.data?.name,
    clientsQuery.data,
    scopeSetsQuery.data,
    memberById,
  ]);

  const permissionByTypeAndRelation = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const t of docTypesForUi) {
      const rels = schemaQueries.byType.get(t)?.data?.relations ?? {};
      for (const [name, def] of Object.entries(rels)) {
        map.set(`${t}:${name}`, def.permissions ?? []);
      }
    }
    return map;
  }, [docTypesForUi, schemaQueries]);

  const scopeSetScopesById = useMemo(() => {
    const m = new Map<string, readonly string[]>();
    for (const s of scopeSetsQuery.data ?? []) {
      m.set(s.id, s.scopes);
    }
    return m;
  }, [scopeSetsQuery.data]);

  const rows = useMemo((): MatrixRow[] => {
    const out: MatrixRow[] = [];
    let qIdx = 0;
    for (const userId of memberUserIds) {
      const mem = memberById.get(userId);
      const email = mem?.email ?? userId;
      const projectMembershipRole = mem?.role ?? '—';
      for (const _t of docTypesForUi) {
        const res = fgacQueries[qIdx]?.data;
        qIdx += 1;
        const rels = res?.relations ?? [];
        for (const r of rels) {
          const resourceType = r.type as FgacDocType;
          const perms = permissionByTypeAndRelation.get(`${resourceType}:${r.relation}`) ?? [];
          const oidcScopes =
            resourceType === 'scope_set' ? (scopeSetScopesById.get(r.id) ?? []) : null;
          out.push({
            userId,
            email,
            projectMembershipRole,
            resourceType,
            relation: r.relation,
            resourceId: r.id,
            resourceLabel: resolveLabel(resourceType, r.id),
            effectivePermissions: perms,
            oidcScopes,
            expiresAt: r.expires_at,
          });
        }
      }
    }
    return out;
  }, [
    memberUserIds,
    memberById,
    docTypesForUi,
    fgacQueries,
    permissionByTypeAndRelation,
    scopeSetScopesById,
    resolveLabel,
  ]);

  const loadingFgac = fgacQueries.some((q) => q.isLoading);
  const fgacError = fgacQueries.find((q) => q.isError)?.error;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.resourceType !== typeFilter) return false;
      if (!q) return true;
      const blob = [
        r.email,
        r.userId,
        r.projectMembershipRole,
        r.resourceType,
        r.relation,
        r.resourceLabel,
        r.resourceId,
        ...r.effectivePermissions,
        ...(r.oidcScopes ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query, typeFilter]);

  const memberCount = membersQuery.data?.length ?? 0;
  const scopeSetCount = scopeSetsQuery.data?.length ?? 0;

  useEffect(() => {
    setSelectedProjectSlug(slug);
  }, [setSelectedProjectSlug, slug]);

  const loading = membersQuery.isLoading || loadingFgac;

  return (
    <div className="space-y-12 pb-20">
      <header
        className="access-ledger-hero relative grid gap-8 overflow-hidden rounded-[1.35rem] border border-primary/20 bg-card p-6 shadow-panel sm:p-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-end md:gap-12"
        style={{ animation: 'rise-in 620ms cubic-bezier(0.2, 0.65, 0.15, 1) both' }}
      >
        <span className="access-ledger-noise" aria-hidden />
        <div
          className="pointer-events-none absolute -left-8 top-1/2 hidden h-[118%] w-32 -translate-y-1/2 skew-y-[-8deg] bg-gradient-to-r from-primary/[0.07] to-transparent md:block"
          aria-hidden
        />
        <div className="relative z-[1] flex flex-col justify-between gap-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] text-primary shadow-sm">
                <Fingerprint className="size-5" strokeWidth={1.75} />
              </span>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.32em] text-primary/90">
                Access ledger
              </p>
            </div>
            <p className="mt-6 font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-foreground">
              Who holds what
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground/90">
              Project workspace · notarized view
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-[7.5rem] flex-col rounded-2xl border border-border/60 bg-background/60 px-4 py-3 backdrop-blur-sm">
              <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <UsersRound className="size-3.5 opacity-70" />
                Members
              </span>
              <span className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
                {loading ? '—' : memberCount}
              </span>
            </div>
            <div className="flex min-w-[7.5rem] flex-col rounded-2xl border border-border/60 bg-background/60 px-4 py-3 backdrop-blur-sm">
              <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="size-3.5 opacity-70" />
                Grants
              </span>
              <span className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
                {loading ? '—' : rows.length}
              </span>
            </div>
            <div className="flex min-w-[7.5rem] flex-col rounded-2xl border border-border/60 bg-background/60 px-4 py-3 backdrop-blur-sm">
              <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <Layers2 className="size-3.5 opacity-70" />
                Scope sets
              </span>
              <span className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
                {scopeSetsQuery.isLoading ? '—' : scopeSetCount}
              </span>
            </div>
          </div>
        </div>
        <div className="relative z-[1] border-t border-dashed border-primary/15 pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each row is one FGAC tuple.{' '}
            <span className="font-medium text-foreground/90">Project role</span> is the membership
            on the Members tab; <span className="font-medium text-foreground/90">Relation</span> is
            the grant on that resource (often the same word after membership sync). OIDC scopes show
            on scope-set rows.
          </p>
          <Link
            to="/projects/$slug/permissions"
            params={{ slug }}
            className="group mt-5 inline-flex items-center gap-2 font-mono text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Open grant / revoke
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      <section
        className="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm backdrop-blur-md sm:p-5"
        style={{ animation: 'rise-in 560ms cubic-bezier(0.2, 0.65, 0.15, 1) 40ms both' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
            <Input
              className="h-12 rounded-2xl border-border/70 bg-background/80 pl-11 font-body text-sm shadow-inner"
              placeholder="Filter email, relation, resource id, scopes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div
            className="flex flex-wrap gap-2 rounded-2xl border border-border/40 bg-muted/30 p-1.5"
            role="group"
            aria-label="Resource type filter"
          >
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={cn(
                'rounded-xl px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition-all',
                typeFilter === 'all'
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
              )}
            >
              All
            </button>
            {docTypesForUi.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'rounded-xl px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all',
                  typeFilter === t
                    ? cn('shadow-sm ring-1 ring-border/60', typePillClass(t))
                    : 'border border-transparent text-muted-foreground hover:border-border/50 hover:bg-background/60 hover:text-foreground',
                )}
              >
                {t.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
        {query.trim() || typeFilter !== 'all' ? (
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            Showing <span className="text-foreground">{filteredRows.length}</span> of{' '}
            <span className="text-foreground">{rows.length}</span> grants
          </p>
        ) : null}
      </section>

      {fgacError ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/[0.06] px-5 py-4 font-mono text-sm text-destructive"
        >
          {fgacError instanceof Error ? fgacError.message : 'Failed to load access data'}
        </div>
      ) : null}

      <Card
        className="access-ledger-matrix relative overflow-hidden rounded-[1.25rem] border-border/55 bg-card/95 shadow-panel"
        style={{ animation: 'rise-in 580ms cubic-bezier(0.2, 0.65, 0.15, 1) 80ms both' }}
      >
        <CardHeader className="relative z-[1] space-y-1 border-b border-border/45 bg-gradient-to-r from-secondary/35 via-card to-transparent py-5 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-xl tracking-tight sm:text-2xl">
                FGAC matrix
              </CardTitle>
              <CardDescription className="mt-1.5 max-w-3xl space-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>
                  <span className="text-foreground/80">{slug}</span>
                  <span className="mx-2 text-border">·</span>
                  {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
                </span>
                <span className="block normal-case tracking-normal text-[10px] leading-relaxed text-muted-foreground">
                  Project role = row in Members; relation = FGAC grant on this resource (sync copies
                  membership role onto project/client/scope resources).
                </span>
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-primary/25 bg-primary/[0.06] font-mono text-[10px] uppercase tracking-wider text-primary"
            >
              Live projection
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="relative z-[1] p-0">
          {loading ? (
            <div className="space-y-0 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-4 border-b border-border/30 py-4 last:border-0"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-muted/80 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-2/5 max-w-xs rounded-md bg-muted/90 animate-pulse" />
                    <div className="h-3 w-3/5 max-w-md rounded-md bg-muted/60 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (membersQuery.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.05] text-primary">
                <UsersRound className="size-7 opacity-80" strokeWidth={1.5} />
              </div>
              <p className="font-display text-lg text-foreground">No members yet</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Invite people from Members — this ledger fills as FGAC tuples attach to resources.
              </p>
              <Link
                to="/projects/$slug/members"
                params={{ slug }}
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.08] px-4 py-2 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/[0.12]"
              >
                Go to members
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                <Search className="size-6" strokeWidth={1.5} />
              </div>
              <p className="font-display text-lg text-foreground">
                {rows.length === 0 ? 'No grants on file' : 'Nothing matches'}
              </p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {rows.length === 0
                  ? 'Use Permissions → Grant / revoke to attach relations to resources.'
                  : 'Loosen filters or clear the search field.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[min(70vh,52rem)] overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border/60 bg-card/92 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border)/0.5)] backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
                    <th className="sticky left-0 z-20 w-10 bg-card/92 px-2 py-3.5 text-center font-medium backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
                      #
                    </th>
                    <th className="sticky left-10 z-20 min-w-[10rem] bg-card/92 px-3 py-3.5 font-medium backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
                      Member
                    </th>
                    <th className="px-3 py-3.5 font-medium">Project role</th>
                    <th className="px-3 py-3.5 font-medium">Type</th>
                    <th className="px-3 py-3.5 font-medium">Relation</th>
                    <th className="min-w-[12rem] px-3 py-3.5 font-medium">Resource</th>
                    <th className="px-3 py-3.5 font-medium">Permissions</th>
                    <th className="min-w-[11rem] px-3 py-3.5 font-medium">OIDC scopes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => (
                    <tr
                      key={`${r.userId}-${r.resourceType}-${r.relation}-${r.resourceId}-${i}`}
                      className={cn(
                        'group border-b border-border/35 transition-colors duration-200 hover:bg-primary/[0.035]',
                        i % 2 === 1 && 'bg-secondary/[0.28]',
                      )}
                      style={{
                        animation: `rise-in 420ms cubic-bezier(0.2, 0.65, 0.15, 1) both`,
                        animationDelay: `${Math.min(i, 24) * 22}ms`,
                      }}
                    >
                      <td className="sticky left-0 z-[1] bg-inherit px-2 py-3.5 text-center font-mono text-[10px] tabular-nums text-muted-foreground group-hover:bg-primary/[0.035]">
                        {i + 1}
                      </td>
                      <td className="relative left-10 z-[1] min-w-[10rem] bg-inherit px-3 py-3.5 group-hover:bg-primary/[0.035]">
                        <div
                          className={cn(
                            'absolute bottom-0 left-0 top-0 w-1',
                            typeRuleClass(r.resourceType),
                          )}
                        />
                        <p className="pl-2 font-medium leading-snug text-foreground">{r.email}</p>
                        <p className="mt-0.5 pl-2 font-mono text-[10px] leading-tight text-muted-foreground">
                          {r.userId}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <Badge
                          variant="outline"
                          className="border-border/60 font-mono text-[9px] uppercase tracking-wide"
                        >
                          {r.projectMembershipRole}
                        </Badge>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <span
                          className={cn(
                            'inline-block rounded-lg border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide',
                            typePillClass(r.resourceType),
                          )}
                        >
                          {r.resourceType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 align-top font-mono text-xs font-medium text-foreground">
                        {r.relation}
                      </td>
                      <td className="max-w-[240px] px-3 py-3.5 align-top">
                        <p className="leading-snug text-foreground">{r.resourceLabel}</p>
                        <p className="mt-1 font-mono text-[10px] leading-tight text-muted-foreground">
                          {r.resourceId}
                        </p>
                        {r.expiresAt ? (
                          <p className="mt-1.5 font-mono text-[9px] text-primary/80">
                            expires {new Date(r.expiresAt).toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        {r.effectivePermissions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.effectivePermissions.map((p) => (
                              <span
                                key={p}
                                className="rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground/90"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[220px] px-3 py-3.5 align-top">
                        {r.oidcScopes && r.oidcScopes.length > 0 ? (
                          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {r.oidcScopes.join(' · ')}
                          </p>
                        ) : r.resourceType === 'scope_set' ? (
                          <span className="text-xs italic text-muted-foreground">empty set</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card
          className="overflow-hidden rounded-[1.15rem] border-border/55 bg-gradient-to-b from-card to-secondary/15 shadow-sm"
          style={{ animation: 'rise-in 560ms cubic-bezier(0.2, 0.65, 0.15, 1) 120ms both' }}
        >
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent-foreground">
              <BookMarked className="size-4" strokeWidth={1.75} />
            </span>
            <div>
              <CardTitle className="font-display text-lg">Scope set catalog</CardTitle>
              <CardDescription className="mt-1 text-pretty">
                OIDC scope strings bundled per set — clients inherit these at token time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {(scopeSetsQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No scope sets in this project.
              </p>
            ) : (
              (scopeSetsQuery.data ?? []).map((s, idx) => (
                <div
                  key={s.id}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-border/55 bg-card/90 p-4 shadow-sm transition-transform duration-300 hover:-translate-y-0.5',
                    idx % 2 === 1 && 'md:ml-4',
                  )}
                  style={{
                    animation: `rise-in 480ms cubic-bezier(0.2, 0.65, 0.15, 1) both`,
                    animationDelay: `${140 + idx * 45}ms`,
                  }}
                >
                  <div className="pointer-events-none absolute right-3 top-3 size-16 rounded-full border border-dashed border-primary/15" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-base font-medium text-foreground">{s.name}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {s.id.slice(0, 10)}…
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-[11px] leading-relaxed tracking-tight text-muted-foreground">
                    {s.scopes.length ? s.scopes.join(' · ') : '—'}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card
          className="relative overflow-hidden rounded-[1.15rem] border-2 border-dashed border-primary/20 bg-primary/[0.03] shadow-sm"
          style={{ animation: 'rise-in 560ms cubic-bezier(0.2, 0.65, 0.15, 1) 140ms both' }}
        >
          <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-accent/20 blur-2xl" />
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">How to read rows</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="list-none space-y-4 text-pretty text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-semibold text-foreground">Member role</span> is coarse
                  project membership; FGAC rows are finer-grained tuples on resources.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  <span className="font-semibold text-foreground">Permissions</span> are expanded
                  from the schema definition for that relation on that doc type.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-secondary-foreground/40" />
                <span>
                  <span className="font-semibold text-foreground">OIDC scopes</span> on a row apply
                  when the resource is a scope set. Project role is separate from relation unless
                  you only use membership sync.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
