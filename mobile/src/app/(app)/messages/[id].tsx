/**
 * شاشة المحادثة — نفس بيانات الويب:
 * GET /api/inbox/conversations/{id} (thread) · POST .../reply (Form) · POST .../read.
 * فقاعات رسائل RTL + إدخال رد لاصق أسفل مع KeyboardAvoidingView.
 *
 * r154 (P6-2-e2 — قواعد غرفة الآلة، مرآة messages/page.tsx):
 *  - الطوابع الزمنية mono HH:MM عبر MonoStamp (dir=ltr مثبت — ختم
 *    الويب font-mono tabular-nums dir="ltr"؛ التاريخ العربي الكامل يركب
 *    تسمية الوصول بدل الـtitle الأرضي — لا tooltip على الجوال).
 *  - ذيل ركض البوت: أفاتار RobotMark idle على آخر فقاعة في كل سلسلة
 *    صفحة (نمط أفاتار الذيل في ماسنجر — الويب نفسه؛ زخرفي).
 *  - «رد آلي ⚡» لايم على ردود البوت: الخيط يخدم from.name="SmartBot"
 *    للردود الآلية (تُخزن كذلك في الخادم) و«الصفحة» لردود الوكيل —
 *    مشتق عرض فقط، لا تغيير في API.
 *  - نقاط التفكير اللايم (TypingDots) بجانب الصفحة أثناء إرسال الرد
 *    (سجل الإرسال — .sb-typing الويب) مع جملة وصول حية مرآة sr-only.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button, MonoStamp, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { DirectionalIcon } from '@/components/directional-icon'
import { PressableScale } from '@/components/pressable-scale'
import { RobotMark } from '@/components/robot-mark'
import { TypingDots } from '@/components/typing-dots'
import { apiGet, apiPost, apiPostForm } from '@/services/api'
import { LoadingState, ErrorState, describeError } from '@/components/state-views'
import { formatDate, formatTime } from '@/lib/format'

interface ThreadMessage {
  id: string
  message: string
  from: { id: string; name: string }
  is_from_page: boolean
  created_time: string | null
}

export default function ConversationScreen() {
  const { colors, fontBody } = useTheme()
  const insets = useSafeAreaInsets()
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: thread, isLoading, isError, error, refetch } = useQuery<ThreadMessage[]>({
    queryKey: ['conversation', id],
    queryFn: () => apiGet<ThreadMessage[]>(`/api/inbox/conversations/${id}`),
    refetchInterval: 15_000,
  })

  // فتح المحادثة = مقروءة (نفس عقد الويب v17-E-B1) — M-22: تنقية قائمة
  // المحادثات بعد النجاح حتى يزول شارز "الجديدة" فورًا
  useEffect(() => {
    if (id) {
      apiPost(`/api/inbox/conversations/${id}/read`)
        .then(() => queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] }))
        .catch(() => undefined)
    }
  }, [id, queryClient])

  const replyMutation = useMutation({
    mutationFn: (message: string) => apiPostForm(`/api/inbox/conversations/${id}/reply`, { message }),
    onSuccess: () => {
      setDraft('')
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
    onError: (e) => setSendError(describeError(e)),
  })

  const renderItem = useCallback(
    ({ item, index }: { item: ThreadMessage; index: number }) => {
      const fromPage = item.is_from_page
      /* r154: «رد آلي» — ركض البوت يعلن نفسه: ردود الآلة تُخزن باسم
       * المرسل "SmartBot" (ردود الوكيل ترجع «الصفحة»؛ مسار الـGraph
       * الحي يخدم اسم الصفحة — بلا شارة، لا نخمّن). */
      const isBotReply = fromPage && (item.from?.name ?? '') === 'SmartBot'
      /* r154: أفاتار الذيل — آخر فقاعة في كل سلسلة صفحة تحمل الروبوت
       * (مرآة isLastPageRun الويب — سلسلة الرسائل المتتالية تتجمّع تحت
       * علامة هوية واحدة؛ جهة العميل لا تحمل أفاتار أبدًا). */
      const isLastPageRun = fromPage && thread?.[index + 1]?.is_from_page !== true
      /* r134 (تكافؤ التوأم — messages/page.tsx:1035-1037): الوصفة كانت
       * معكوسة عن الويب (العميل خافت والصفحة أساسية). المرآة الحرفية:
       * رسالة الصفحة = فقاعة خافتة bg-muted بزاوية بداية مربية
       * (rounded-ss-sm ≙ borderTopRightRadius في RTL)، ورسالة العميل =
       * فقاعة أساسية bg-primary بنص primaryFg وزاوية نهاية مربية
       * (rounded-se-sm ≙ borderTopLeftRadius في RTL) — فتُرسم المحادثة
       * نفسها على الشاشتين بالهوية نفسها. تعتيم سطر الوقت على الفقاعة
       * الأساسية أُسقط أيضًا (v14-E5 في الويب: 0.7 يقيس 3.14:1 —
       * primaryFg الكامل يجتاز). */
      return (
        <View
          style={[
            styles.bubbleRow,
            { justifyContent: fromPage ? 'flex-start' : 'flex-end', alignItems: 'flex-end' },
          ]}
        >
          {isLastPageRun ? (
            /* أفاتار الذيل — قشرة سطح بخُطة، الروبوت داخله (زخرفي) */
            <View style={[styles.tailAvatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <RobotMark state="idle" size={20} />
            </View>
          ) : null}
          {!fromPage ? (
            <View style={[styles.bubble, { backgroundColor: colors.primary, borderTopLeftRadius: radius.sm }]}>
              <AppText variant="small" style={{ color: colors.primaryFg }}>
                {item.message}
              </AppText>
              {/* r154: الختم الزمني mono HH:MM (LTR مثبت) — التاريخ
                  العربي الكامل في تسمية الوصول (مرآة title الويب) */}
              <MonoStamp
                value={formatTime(item.created_time)}
                color="primaryFg"
                size={11}
                weight={400}
                style={{ alignSelf: 'flex-start', marginTop: 2 }}
                accessibilityLabel={formatDate(item.created_time)}
              />
            </View>
          ) : (
            <View style={[styles.bubble, { backgroundColor: colors.muted, borderTopRightRadius: radius.sm }]}>
              <AppText variant="small" style={{ color: colors.foreground }}>
                {item.message}
              </AppText>
              <Row style={{ alignSelf: 'flex-start', marginTop: 2, gap: 6 }}>
                <MonoStamp
                  value={formatTime(item.created_time)}
                  color="mutedFg"
                  size={11}
                  weight={400}
                  accessibilityLabel={formatDate(item.created_time)}
                />
                {isBotReply ? (
                  /* r154: شارة «رد آلي» — السجل المحجوز: بنفسجي + صاعقة
                      (مرآة نقطة AI في /demo الويب) */
                  <View style={[styles.aiChip, { borderColor: `${colors.violet}52` }]}>
                    <Icon name="zap" size={10} color={colors.violet} />
                    <AppText variant="caption" style={{ color: colors.violet, fontWeight: '500' }}>
                      رد آلي
                    </AppText>
                  </View>
                ) : (
                  <AppText variant="caption" color="mutedFg">
                    · الصفحة
                  </AppText>
                )}
              </Row>
            </View>
          )}
        </View>
      )
    },
    [colors, thread],
  )

  // M-22: آخر الرسائل في الأسفل — نمرر لآخر المحتوى كلما نما (تحميل أولي
  // أو رسالة جديدة) بدل ترك المستخدم أعلى الخيط
  const listRef = useRef<FlatList<ThreadMessage>>(null)
  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false })
  }, [])

  if (isLoading) return <LoadingState label="جارٍ تحميل المحادثة…" />

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* الترويسة */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={styles.backBtn}
          scaleTo={press.button}
        >
          {/* r131: أيقونة الاتجاه من الدلالة — مرآة RTL كالويب */}
          <DirectionalIcon
            semanticDirection="back"
            variant="chevron"
            size={24}
            color={colors.foreground}
          />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {name || 'محادثة'}
          </AppText>
          <AppText variant="caption" color="mutedFg">
            ماسنجر فيسبوك
          </AppText>
        </View>
        <PressableScale
          accessibilityLabel="تحديث"
          onPress={() => refetch()}
          style={styles.backBtn}
          scaleTo={press.button}
        >
          <Icon name="refresh" size={20} color={colors.mutedFg} />
        </PressableScale>
      </View>

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (thread ?? []).length === 0 ? (
        <ErrorState message="لا توجد رسائل في هذه المحادثة" onRetry={() => refetch()} />
      ) : (
        <FlatList
          ref={listRef}
          data={thread}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={scrollToEnd}
          inverted={false}
          /* r154: سجل الإرسال — نقاط التفكير اللايم بجانب الصفحة أثناء
           * طيران الرد (المرآة الجوالة لـ.sb-typing + sr-only الويب:
           * الغلاف المُوصول يحمل جملة الحالة للقارئات، والنقاط زخرفية) */
          ListFooterComponent={
            replyMutation.isPending ? (
              <View accessible accessibilityLabel="جارٍ إرسال الرد…" style={{ alignSelf: 'flex-start' }}>
                <TypingDots />
              </View>
            ) : undefined
          }
        />
      )}

      {/* صندوق الرد */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {sendError ? (
          <AppText variant="caption" style={{ color: colors.destructive, padding: spacing.xs }}>
            {sendError}
          </AppText>
        ) : null}
        <Row style={{ gap: spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب ردك…"
            placeholderTextColor={colors.placeholder}
            textAlign="right"
            multiline
            accessibilityLabel="نص الرد"
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                fontFamily: fontBody,
              },
            ]}
          />
          <Button
            title="إرسال"
            onPress={() => draft.trim() && replyMutation.mutate(draft.trim())}
            loading={replyMutation.isPending}
            disabled={!draft.trim()}
            size="sm"
          />
        </Row>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  /* r154: الصف بمحاذاة سفلية — أفاتار الذيل يلامس قاعدة الفقاعة (items-end الويب) */
  bubbleRow: { flexDirection: 'row' },
  /* r154: قشرة الأفاتار — 28px دائرة بخُطة وسطح (size-7 الويب) */
  tailAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* r154: شارة «رد آلي» — كبسولة لايم بحد 32% (عائلة sb-ai-chip) */
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 8,
    minHeight: 48,
    maxHeight: 120,
    fontSize: 16,
    textAlignVertical: 'top',
  },
})
