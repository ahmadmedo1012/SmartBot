/**
 * شاشة الأدوات — العروض + قوالب الردود (نفس الويب /dashboard/tools):
 * GET /api/offers (مصفوفة مجردة) · POST /api/offers/{id}/toggle · GET /api/templates.
 * عقد v25 (M-18): العروض {title, code, discount_value, used_count, is_active}
 * والقوالب {name, text} (لا discount/claims/content).
 */
import { useState } from 'react'
import { FlatList } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatNumber } from '@/lib/format'
import type { Offer, ReplyTemplate } from '@/types/api'

export default function ToolsScreen() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'offers' | 'templates'>('offers')

  const { data: offers, isLoading: offersLoading, isError: offersError, error: oErr, refetch: oRefetch } = useQuery<unknown, Error, Offer[]>({
    queryKey: ['offers'],
    queryFn: () => apiGet('/api/offers'),
    select: (res) => extractItems<Offer>(res),
    enabled: tab === 'offers',
  })
  const offerList = offers ?? []

  const { data: templates, isLoading: tplLoading, isError: tplError, error: tErr, refetch: tRefetch } = useQuery<unknown, Error, ReplyTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => apiGet('/api/templates'),
    select: (res) => extractItems<ReplyTemplate>(res),
    enabled: tab === 'templates',
  })
  const templateList = templates ?? []

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/offers/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offers'] }),
  })

  return (
    <StackScreen
      title="الأدوات"
      subtitle="العروض الترويجية وقوالب الردود"
      action={
        <Row style={{ gap: spacing.sm }}>
          <Button title="العروض" size="sm" variant={tab === 'offers' ? 'primary' : 'secondary'} onPress={() => setTab('offers')} />
          <Button title="القوالب" size="sm" variant={tab === 'templates' ? 'primary' : 'secondary'} onPress={() => setTab('templates')} />
        </Row>
      }
      isLoading={tab === 'offers' ? offersLoading : tplLoading}
    >
      {tab === 'offers' ? (
        offersError ? (
          <ErrorState message={describeError(oErr)} onRetry={() => oRefetch()} />
        ) : offerList.length === 0 ? (
          <EmptyState message="لا عروض بعد" hint="أنشئ عرضًا ترويجيًا لجمهورك من لوحة الويب الكاملة" />
        ) : (
          <FlatList
            data={offerList}
            keyExtractor={(o) => String(o.id)}
            onRefresh={() => oRefetch()}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => {
              const active = item.is_active ?? false
              return (
                <Card>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                      {item.title ?? 'عرض'}
                    </AppText>
                    <Badge tone={active ? 'success' : 'muted'} text={active ? 'نشط' : 'موقوف'} />
                  </Row>
                  {item.description ? (
                    <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }} numberOfLines={2}>
                      {item.description}
                    </AppText>
                  ) : null}
                  <Row style={{ marginTop: spacing.md, gap: spacing.lg, flexWrap: 'wrap' }}>
                    {item.code ? <Badge tone="brand" text={item.code} /> : null}
                    {/* M-18: الحقول الفعلية — discount_value + used_count */}
                    {item.discount_value != null ? (
                      <AppText variant="caption" color="mutedFg">
                        خصم {formatNumber(item.discount_value)}
                        {item.discount_type === 'percentage' ? '%' : item.discount_type === 'fixed' ? ' د.ل' : ''}
                      </AppText>
                    ) : null}
                    {typeof item.used_count === 'number' ? (
                      <AppText variant="caption" color="mutedFg">
                        {formatNumber(item.used_count)} مطالبة
                        {typeof item.max_uses === 'number' ? ` من ${formatNumber(item.max_uses)}` : ''}
                      </AppText>
                    ) : null}
                    {item.expires_at ? (
                      <AppText variant="caption" color="mutedFg">
                        حتى {formatDate(item.expires_at)}
                      </AppText>
                    ) : null}
                  </Row>
                  <Row style={{ marginTop: spacing.md }}>
                    <Button
                      title={active ? 'إيقاف' : 'تنشيط'}
                      size="sm"
                      variant="secondary"
                      onPress={() => toggleMutation.mutate(item.id)}
                      loading={toggleMutation.isPending && toggleMutation.variables === item.id}
                    />
                  </Row>
                </Card>
              )
            }}
          />
        )
      ) : tplError ? (
        <ErrorState message={describeError(tErr)} onRetry={() => tRefetch()} />
      ) : templateList.length === 0 ? (
        <EmptyState message="لا قوالب بعد" hint="احفظ ردودًا جاهزة لإعادة استخدامها في القواعد" />
      ) : (
        <FlatList
          data={templateList}
          keyExtractor={(t) => String(t.id)}
          onRefresh={() => tRefetch()}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? 'قالب'}
                </AppText>
                {item.category ? <Badge tone="muted" text={item.category} /> : null}
              </Row>
              {/* M-18: نص القالب في text — لا content/body */}
              <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.sm }} numberOfLines={4}>
                {item.text ?? ''}
              </AppText>
            </Card>
          )}
        />
      )}
    </StackScreen>
  )
}
