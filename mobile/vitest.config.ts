import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  define: {
    // نفس دلالة Metro: false في الاختبارات = مسار الإنتاج
    // (ensure-rtl يختبر Updates.reloadAsync وليس DevSettings).
    __DEV__: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
