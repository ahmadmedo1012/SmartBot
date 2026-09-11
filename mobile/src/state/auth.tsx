/**
 * SmartBot Mobile — حالة المصادقة.
 *
 * التوكن JWT في expo-secure-store (Keychain/Keystore — لا AsyncStorage
 * للتوكن أبدًا). الدخول عبر POST /api/auth/token (المصمم للموبايل:
 * يعيد التوكن في الجسم بدل الكوكيز). 401 من أي شاشة → خروج مركزي.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { apiFetch, getAuthToken, setAuthToken, setUnauthorizedHandler, ApiError } from '@/services/api'
import { queryClient } from '@/lib/query-client'
import type { AuthTokenResponse, User } from '@/types/api'

const TOKEN_KEY = 'smartbot.jwt'
const USER_KEY = 'smartbot.user'

export interface AuthState {
  user: User | null
  token: string | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<User>
  register: (username: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** بعد إكمال onboarding — تحديث الحالة محليًا */
  markOnboarded: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function persistSession(token: string, user: User) {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
}

async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
  await SecureStore.deleteItemAsync(USER_KEY)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    status: 'loading',
  })

  // استعادة الجلسة عند الإقلاع (Session persistence)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY)
        const userRaw = await SecureStore.getItemAsync(USER_KEY)
        if (token && userRaw) {
          setAuthToken(token)
          const user = JSON.parse(userRaw) as User
          if (mounted) setState({ user, token, status: 'authenticated' })
          // تحقق خفيف من صلاحية الجلسة (401 → خروج فوري)
          try {
            const fresh = await apiFetch<{ user: User }>('/api/me')
            if (mounted) setState({ user: fresh.user, token, status: 'authenticated' })
          } catch {
            // انقطاع شبكة عند الإقلاع: نبقى داخلًا بالجلسة المخزنة (توكن 24h)
          }
          return
        }
      } catch {
        /* SecureStore غير متاح — جلسة فارغة */
      }
      if (mounted) setState({ user: null, token: null, status: 'unauthenticated' })
    })()
    return () => {
      mounted = false
    }
  }, [])

  const logout = useCallback(async () => {
    // M-07 (v25): إبطال jti على الخادم أولاً — بينما التوكن ما زال مضبوطًا
    // في حامل الطلبات — ثم يُمسح محليًا. الترتيب القديم كان يمسح التوكن
    // قبل الاستدعاء فيذهب POST /api/logout بلا Bearer → لا إبطال →
    // التوكن يبقى صالحاً ≤24 ساعة.
    if (getAuthToken()) {
      try {
        await apiFetch('/api/logout', { method: 'POST', skipAuthRedirect: true, timeoutMs: 8000 })
      } catch {
        /* انقطاع الشبكة لا يمنع الخروج المحلي — انتهاء التوكن 24h كحد أقصى */
      }
    }
    // M-08: تنقية ذاكرة React Query كاملة — حتى لا يرى مستخدم ثانٍ على
    // نفس الجهاز وميض بيانات المستأجر السابق بعد الخروج.
    queryClient.clear()
    setAuthToken(null)
    await clearSession().catch(() => undefined)
    setState({ user: null, token: null, status: 'unauthenticated' })
  }, [])

  // 401 المركزي من أي شاشة → خروج (بدون حلقات — إزالة ازدواج داخل api.ts)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // M-08: انتهاء الجلسة = ذاكرة استعلام فارغة (نفس منطق الخروج اليدوي)
      queryClient.clear()
      setAuthToken(null)
      clearSession().catch(() => undefined)
      setState({ user: null, token: null, status: 'unauthenticated' })
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<AuthTokenResponse>('/api/auth/token', {
      method: 'POST',
      body: { username, password },
      skipAuthRedirect: true,
      anonymous: true,
    })
    setAuthToken(data.token)
    await persistSession(data.token, data.user)
    setState({ user: data.user, token: data.token, status: 'authenticated' })
    return data.user
  }, [])

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await apiFetch<{ user: User }>('/api/register', {
        method: 'POST',
        body: { username, email, password, name: username },
        skipAuthRedirect: true,
        anonymous: true,
      })
      // التسجيل لا يعيد توكنًا — دخول فوري بعد الإنشاء (نفس رحلة الويب)
      return login(username, password)
    },
    [login],
  )

  const markOnboarded = useCallback(() => {
    setState((s) =>
      s.user ? { ...s, user: { ...s.user, onboardingCompleted: true } } : s,
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, markOnboarded }),
    [state, login, register, logout, markOnboarded],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { ApiError }
