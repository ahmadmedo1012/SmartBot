/**
 * شاشة الفريق (نفس الويب /dashboard/team — GAP-BOT-3 · P42-5b):
 * GET /api/team/members · POST /api/users (Form: username/password/role)
 * · PUT /api/users/{id} (Form: role) · DELETE /api/users/{id}.
 *
 * كانت الشاشة قراءة-only بتلميح ميت يحيل المستخدم إلى لوحة الويب
 * (فجوة GAP-BOT-3): الوعد «فريق حتى N» في صفحة الأسعار بلا سطح
 * إنشاء على الجوال. القرار الموثق: النقل لا التأجيل —
 * الطفرة واحدة (نموذج إضافة) فوق عائلة القفل الموجودة فعلًا (gates.ts)،
 * والجمهور الذي يرى القائمة أصلًا هو أدمن المستأجر (GET يتطلب admin —
 * team_routes.py:14)، وهو نفسه المخوّل بالكتابة خادميًا.
 *
 * عقد الويب الحرفي (dashboard/team/page.tsx — v17-E-F8 (D6-5)):
 *   - الأدوار القابلة للتعيين: admin|editor|viewer (ASSIGNABLE_ROLES).
 *   - إضافة عضو: POST /api/users بجسم Form-encoded — username 3-32،
 *     password ≥ 8، دور من القائمة (تعطيل الزر قبلها كالويب).
 *   - المالك بلا تحكم: «owner» ليس دورًا صالحًا في PUT (400) وحذف
 *     المالك مدمر — شارة فقط.
 *   - حارس دور مدير المنصة (users.py:27): منح admin حكر لمدير المنصة —
 *     403 عربي صادق يظهر كما هو (تلميح النموذج يشرحه مقدمًا).
 *   - 403 حد المقاعد (E-B2 — users.py:22): «حد أعضاء الفريق لخطتك هو
 *     {n} — رقّ خطتك لإضافة المزيد» — عائلة كوطة مستقلة (لا تنتهي
 *     بلاحقة «رقِّ خطتك» فلا يلتقطها isPlanLocked) تصنّفها isSeatLimit:
 *     نص الخادم الحرفي + باب ترقية عند موضع الطفرة، والنموذج يبقى
 *     مفتوحًا (كما لا يغلقه toast الويب). الميزة تعمل في الخطة — نفدت
 *     المقاعد فقط — فلا بطاقة «متاحة في Premium» ولا إخفاء زر الإنشاء
 *     (الحذف يحرّر مقعدًا فالباب يظل حيًا).
 *
 * فشل الخادم صادق دائمًا: أخطاء الطفرات تظهر ببطاقة خطأ قابلة للإغلاق
 * (نص الخادم العربي عبر describeError) — لا نجاح كاذب أبدًا؛ النجاح
 * الوحيد هو رد الخادم الفعلي (invalidate يحدّث القائمة).
 */
import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PressableScale } from '@/components/pressable-scale'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiDelete, apiGet, apiPostForm, apiPutForm } from '@/services/api'
import { confirmAction } from '@/lib/confirm'
import { seatLimitMessage } from '@/lib/gates'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate } from '@/lib/format'
import type { TeamMember } from '@/types/api'

/* v17-E-F8 (D6-5): الأدوار القابلة للتعيين — عقد /api/users (routers/
 * users.py): admin|editor|viewer. حارس E-B2 يرفع 403 عربيًا لمنح admin
 * لأدمن المستأجر — الرسالة تظهر بصدق إن اختاره المستخدم. */
const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'] as const

/* نفس ROLE_LABELS الويب (v4 §2.3 — owner حصل على تسميته بدل تسريب
 * الإنجليزية الخام). */
const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير',
  editor: 'محرر',
  viewer: 'مشاهد',
  member: 'عضو',
  owner: 'مالك',
}

export default function TeamScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()

  /* نموذج الإضافة (v17-E-F8 — عقد الويب: القيم الافتراضية نفسها). */
  const [showForm, setShowForm] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<string>('viewer')
  const [formError, setFormError] = useState<string | null>(null)
  /* كوطة المقاعد: نص الخادم الحرفي حين تصنّفها isSeatLimit — يبقى
   * النموذج مفتوحًا ويُعرض النص مع باب الترقية (الرسالة نفسها تقول
   * «رقّ خطتك لإضافة المزيد»). */
  const [seatLimit, setSeatLimit] = useState<string | null>(null)

  /* أخطاء تغيير الدور/الحذف (خارج النموذج) — بطاقة قابلة للإغلاق. */
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: () => apiGet<TeamMember[]>('/api/team/members'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team-members'] })

  const addMember = useMutation({
    /* عقد POST /api/users — Form-encoded (username/password/role)، نفس
     * نداء الويب حرفيًا (team/page.tsx:54-63). */
    mutationFn: () =>
      apiPostForm<{ id: number }>('/api/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      }),
    onSuccess: () => {
      setShowForm(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('viewer')
      setFormError(null)
      setSeatLimit(null)
      invalidate()
    },
    onError: (e) => {
      /* GAP-BOT-3: كوطة المقاعد (403 E-B2) → النص الحرفي + باب ترقية
       * داخل النموذج (لا toast يختفي على الجوال ولا إغلاق يخفي السبب). */
      const quota = seatLimitMessage(e)
      if (quota) {
        setSeatLimit(quota)
        setFormError(null)
        return
      }
      /* 400 التحقق (اسم 3-32، كلمة مرور، اسم مكرر) و403 حارس دور مدير
       * المنصة و403 الصلاحيات — كلها نصوص خادم عربية تظهر كما هي. */
      setSeatLimit(null)
      setFormError(describeError(e))
    },
  })

  const changeRole = useMutation({
    /* عقد PUT /api/users/{id} — Form(role)؛ التغيير صريح بلمسة دور
     * مختلف عن الحالي (نفس دلالة onChange الويب: القيمة نفسها لا نداء). */
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiPutForm<{ ok: boolean }>(`/api/users/${id}`, { role }),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const deleteMember = useMutation({
    /* حذف نهائي — تأكيد بلمسة ثانية (قواعد الحذف في الأسطول؛ مرآة
     * التأكيد ثنائي الخطوات في الويب). الخادم يرفض حذف النفس
     * (400 «لا يمكنك حذف حسابك») والمالك محجوب أصلًا بلا تحكم. */
    mutationFn: async (m: TeamMember) => {
      const confirmed = await confirmAction({
        title: `حذف العضو ${m.username}؟`,
        message: 'سيُحذف حساب العضو نهائيًا من مساحة عملك ولن يستطيع الدخول بعدها.',
        confirmText: 'حذف نهائي',
      })
      if (!confirmed) throw new Error('cancelled')
      return apiDelete(`/api/users/${m.id}`)
    },
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: (e) => {
      if (!String((e as Error)?.message).includes('cancelled')) setActionError(describeError(e))
    },
  })

  function openForm() {
    setShowForm(true)
    setFormError(null)
    setSeatLimit(null)
  }

  const members = data ?? []

  return (
    <StackScreen
      title="الفريق"
      subtitle={`${members.length} عضوًا`}
      action={
        <Button title="عضو جديد" size="sm" onPress={() => (showForm ? setShowForm(false) : openForm())} />
      }
      isLoading={isLoading}
    >
      {actionError ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Card style={{ backgroundColor: colors.destructiveSoft }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" style={{ color: colors.destructive, flex: 1 }}>
                {actionError}
              </AppText>
              <PressableScale
                accessibilityLabel="إغلاق الخطأ"
                hitSlop={14}
                onPress={() => setActionError(null)}
                scaleTo={press.button}
              >
                <Icon name="x" size={18} color={colors.destructive} />
              </PressableScale>
            </Row>
          </Card>
        </View>
      ) : null}

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : members.length === 0 ? (
        /* v17-E-F8: وعد «فريق حتى N» صار له سطح إنشاء على الجوال —
           النص الحرفي للويب (لا تلميح لوحة الويب الميتة). */
        <EmptyState
          message="لا يوجد أعضاء فريق بعد"
          hint="أضف أعضاء فريقك من زر «عضو جديد» ليشاركوك إدارة الردود والتقارير."
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => String(m.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const changingThis = changeRole.isPending && changeRole.variables?.id === item.id
            const deletingThis = deleteMember.isPending && deleteMember.variables?.id === item.id
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: spacing.md, flex: 1 }}>
                    <View style={[styles.avatar, { backgroundColor: `${colors.accentFg}1a` }]}>
                      <AppText variant="smallBold" style={{ color: colors.accentFg }}>
                        {(item.username ?? '؟').charAt(0).toUpperCase()}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="smallBold" numberOfLines={1}>
                        {item.username}
                      </AppText>
                      {item.email ? (
                        <AppText variant="caption" color="mutedFg" numberOfLines={1}>
                          {item.email}
                        </AppText>
                      ) : null}
                    </View>
                  </Row>
                  {item.role === 'owner' ? (
                    /* v17-E-F8: المالك بلا تحكم — شارة فقط («owner» ليس
                     * دورًا صالحًا في PUT وحذف المالك مدمر). */
                    <Badge tone="brand" text={ROLE_LABELS[item.role] ?? 'مالك'} />
                  ) : (
                    /* تغيير الدور — لمسة دور مختلف عن الحالي تطلق PUT
                     * فورًا (مرآة onChange الويب)؛ تعطيل الصف أثناء طيران
                     * طفرة هذا العضو فقط (لا spinner على الصف كله). */
                    <Row style={{ gap: spacing.sm }}>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <PressableScale
                          key={r}
                          accessibilityLabel={`دور العضو ${item.username}: ${ROLE_LABELS[r]}`}
                          accessibilityState={{ selected: item.role === r, disabled: changingThis }}
                          disabled={changingThis || item.role === r}
                          onPress={() => changeRole.mutate({ id: item.id, role: r })}
                          scaleTo={press.button}
                          style={[
                            styles.roleChip,
                            {
                              borderColor: item.role === r ? colors.primary : colors.border,
                              backgroundColor: item.role === r ? `${colors.primary}24` : 'transparent',
                              opacity: changingThis ? 0.5 : 1,
                            },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={{
                              color: item.role === r ? colors.accentFg : colors.mutedFg,
                              fontWeight: '700',
                            }}
                          >
                            {ROLE_LABELS[r]}
                          </AppText>
                        </PressableScale>
                      ))}
                    </Row>
                  )}
                </Row>
                {item.created_at ? (
                  <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.sm }}>
                    انضم {formatDate(item.created_at)}
                  </AppText>
                ) : null}
                {item.role !== 'owner' ? (
                  <Row style={{ marginTop: spacing.md, justifyContent: 'flex-end' }}>
                    <Button
                      title="حذف"
                      size="sm"
                      variant="ghost"
                      onPress={() => deleteMember.mutate(item)}
                      loading={deletingThis}
                    />
                  </Row>
                ) : null}
              </Card>
            )
          }}
        />
      )}

      {/* Sheet إضافة عضو — عقد POST /api/users (Form-encoded)؛ نفس بنية
          sheets الأسطول (M-21: KAV لئلا تغطي لوحة المفاتيح الحقول). */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowForm(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              إضافة عضو جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput
                label="اسم المستخدم"
                value={newUsername}
                onChangeText={(v) => {
                  setNewUsername(v)
                  setSeatLimit(null)
                  setFormError(null)
                }}
                placeholder="اسم المستخدم (3-32 حرفًا)"
                accessibilityLabel="اسم المستخدم للعضو الجديد"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <AppInput
                label="كلمة المرور"
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v)
                  setSeatLimit(null)
                  setFormError(null)
                }}
                placeholder="كلمة المرور (8 أحرف على الأقل)"
                accessibilityLabel="كلمة المرور للعضو الجديد"
                secureTextEntry
              />
              <View style={{ gap: spacing.sm }}>
                <AppText variant="small" color="mutedFg">
                  الدور
                </AppText>
                <Row style={{ gap: spacing.sm }}>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <PressableScale
                      key={r}
                      accessibilityLabel={`دور العضو الجديد: ${ROLE_LABELS[r]}`}
                      accessibilityState={{ selected: newRole === r }}
                      onPress={() => setNewRole(r)}
                      scaleTo={press.button}
                      style={[
                        styles.roleChip,
                        {
                          borderColor: newRole === r ? colors.primary : colors.border,
                          backgroundColor: newRole === r ? `${colors.primary}24` : 'transparent',
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{ color: newRole === r ? colors.accentFg : colors.mutedFg, fontWeight: '700' }}
                      >
                        {ROLE_LABELS[r]}
                      </AppText>
                    </PressableScale>
                  ))}
                </Row>
                {/* تلميح الدور الحرفي للويب (team/page.tsx:177-181): حارس
                    منح admin مذكور مقدمًا بصدق — الخطأ العربي الذي سيظهر
                    لأدمن المستأجر ليس مفاجأة. */}
                <AppText variant="caption" color="mutedFg">
                  {newRole === 'admin'
                    ? 'تعيين دور «مدير» متاح لمدير المنصة فقط — سيظهر خطأ عربيًا إن لم تكن مدير المنصة'
                    : 'محرر يستطيع إنشاء القواعد والبث، ومشاهد يرى التقارير فقط'}
                </AppText>
              </View>

              {/* GAP-BOT-3: كوطة المقاعد — نص الخادم الحرفي + باب ترقية
                  العائلة (الرسالة نفسها تأمر بالترقية «رقّ خطتك لإضافة
                  المزيد»). النموذج يبقى مفتوحًا: الترقية أو تحرير مقعد
                  (حذف) كلاهما مخرج حي. */}
              {seatLimit ? (
                <View style={[styles.quotaCard, { backgroundColor: colors.warningSoft }]}>
                  <AppText variant="small" style={{ color: colors.warning }}>
                    {seatLimit}
                  </AppText>
                  <Button
                    title="ترقية الخطة"
                    size="sm"
                    variant="secondary"
                    icon={<Icon name="crown" size={14} color={colors.foreground} />}
                    onPress={() => router.push({ pathname: '/(app)/subscribe' })}
                  />
                </View>
              ) : formError ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {formError}
                </AppText>
              ) : null}

              <Row>
                <Button
                  title="إضافة العضو"
                  onPress={() => addMember.mutate()}
                  loading={addMember.isPending}
                  disabled={newUsername.trim().length < 3 || newPassword.length < 8 || addMember.isPending}
                />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowForm(false)} />
              </Row>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </StackScreen>
  )
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
  /* كبسولة دور — أرضية لمس 40px داخل بطاقة (44 كاملة تكسر صف الدور
   * عند الثلاثة أدوار على شاشة ضيقة؛ لمسة الإلغاء محفوظة بالحجم
   * الأصغر لكونها اختيار ضمن مجموعة مختارة أصلًا). */
  roleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET - 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* بئر الكوطة — أرضية warning العائلية (الكوطة تحذير لا تدمير:
   * الميزة تعمل والمقاعد نفدت) مع باب الترقية تحت النص. */
  quotaCard: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, alignItems: 'flex-start' },
})
