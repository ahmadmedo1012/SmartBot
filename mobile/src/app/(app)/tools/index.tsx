/**
 * شاشة الأدوات — العروض + قوالب الردود (نفس الويب /dashboard/tools):
 * GET /api/offers · POST /api/offers/{id}/toggle · GET /api/templates.
 */
import { useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatNumber } from '@/lib/format'
import type { Offer, ReplyTemplate } from '@/types/api'

export default function ToolsScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'offers' | 'templates'>('offers')

  const { data: offers, isLoading: offersLoading, isError: offersError, error: oErr, refetch: oRefetch } = useQuery<Offer[]>({
    queryKey: ['offers'],
    queryFn: () => apiGet<Offer[]>('/api/offers'),
    enabled: tab === 'offers',
  })

  const { data: templates, isLoading: tplLoading, isError: tplError, error: tErr, refetch: tRefetch } = useQuery<ReplyTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => apiGet<ReplyTemplate[]>('/api/templates'),
    enabled: tab === 'templates',
  })

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
        ) : (offers ?? []).length === 0 ? (
          <EmptyState message="لا عروض بعد" hint="أنشئ عرضًا ترويجيًا لجمهورك من لوحة الويب الكاملة" />
        ) : (
          <FlatList
            data={offers ?? []}
            keyExtractor={(o) => String(o.id)}
            onRefresh={() => oRefetch()}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => {
              const active = item.is_active ?? item.active ?? false
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
                  <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
                    {item.code ? <Badge tone="brand" text={item.code} /> : null}
                    {item.discount != null ? <AppText variant="caption" color="mutedFg">خصم {formatNumber(String(item.discount))}%</AppText> : null}
                    {item.claims != null ? <AppText variant="caption" color="mutedFg">{formatNumber(item.claims)} مطالبة</AppText> : null}
                  </Row>
                  <Row style={{ marginTop: spacing.md }}>
                    <Button
                      title={active ? 'إيقاف' : 'تنشيط'}
                      size="sm"
                      variant="secondary"
                      onPress={() => toggleMutation.mutate(item.id)}
                      loading={toggleMutation.isPending}
                    />
                  </Row>
                </Card>
              )
            }}
          />
        )
      ) : tplError ? (
        <ErrorState message={describeError(tErr)} onRetry={() => tRefetch()} />
      ) : (templates ?? []).length === 0 ? (
        <EmptyState message="لا قوالب بعد" hint="احفظ ردودًا جاهزة لإعادة استخدامها في القواعد" />
      ) : (
        <FlatList
          data={templates ?? []}
          keyExtractor={(t) => String(t.id)}
          onRefresh={() => tRefetch()}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? item.title ?? 'قالب'}
                </AppText>
                {item.created_at ? (
                  <AppText variant="caption" color="mutedFg">
                    {formatDate(item.created_at)}
                  </AppText>
                ) : null}
              </Row>
              <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.sm }} numberOfLines={4}>
                {item.content ?? item.body ?? ''}
              </AppText>
            </Card>
          )}
        />
      )}
    </StackScreen>
  )
}
