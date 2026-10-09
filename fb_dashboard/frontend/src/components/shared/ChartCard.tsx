'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

/* Ported from Smart-Menu (world-class launch plan v3 §6.2):
 * standard chart wrapper with loading/error/empty/retry states + summary. */

interface ChartCardProps {
        title: string;
        description?: string;
        icon?: LucideIcon;
        loading?: boolean;
        error?: string | null;
        empty?: boolean;
        emptyTitle?: string;
        emptyDescription?: string;
        onRetry?: () => void;
        actions?: ReactNode;
        summary?: string;
        children: ReactNode;
        className?: string;
}

export function ChartCard({
        title,
        description,
        icon: Icon,
        loading = false,
        error = null,
        empty = false,
        emptyTitle = 'لا توجد بيانات بعد',
        emptyDescription = 'ستظهر النتائج هنا بعد أول التفاعلات.',
        onRetry,
        actions,
        summary,
        children,
        className,
}: ChartCardProps) {
        return (
                <section
                        className={cn(
                                'rounded-xl border border-border/60 bg-card p-5 shadow-sm',
                                className
                        )}
                >
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                                {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                                                <h2 className="text-sm font-semibold">{title}</h2>
                                        </div>
                                        {description ? (
                                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                                        ) : null}
                                </div>
                                {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
                        </div>

                        {loading ? (
                                /* r131-F8 (A4 P1-2): the pulse blink → the canonical
                                  .skeleton shimmer (1200ms linear, RM-killed via the
                                  token) on shape-matched slabs: caption bar + the
                                  160px chart band this block always drew. */
                                <div
                                        className="flex h-[220px] flex-col justify-end gap-3"
                                        aria-busy="true"
                                        aria-label="جارٍ تحميل الرسم البياني"
                                >
                                        <div className="skeleton h-3 w-24 rounded-full" />
                                        <div className="skeleton h-[160px] rounded-md" />
                                        <span className="sr-only">جارٍ التحميل</span>
                                </div>
                        ) : error ? (
                                /* r131-F8 (A4 P2-8): the bare-AlertCircle error row rides the
                                  canonical .state family (globals.css r131-F7) — rose-soft
                                  tile + -ink glyph + 42ch desc + sm outline retry. */
                                <div className="state state-danger h-[200px]">
                                        <div className="state-icon" aria-hidden="true">
                                                <AlertCircle />
                                        </div>
                                        <p className="state-title">تعذّر تحميل الرسم البياني</p>
                                        <p className="state-desc">{error}</p>
                                        {onRetry ? (
                                                <Button variant="outline" size="sm" onClick={onRetry}>
                                                        إعادة المحاولة
                                                </Button>
                                        ) : null}
                                </div>
                        ) : empty ? (
                                <EmptyState icon={Icon ?? AlertCircle} title={emptyTitle} description={emptyDescription} />
                        ) : (
                                <div>
                                        {summary ? <p className="sr-only">{summary}</p> : null}
                                        {children}
                                </div>
                        )}
                </section>
        );
}
