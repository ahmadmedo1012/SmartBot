/* v10-W4: autoprefixer dropped — @tailwindcss/postcss (v4) emits vendor
 * prefixes itself via lightningcss (verified: -webkit-user-select/-webkit-
 * backdrop-filter emitted with autoprefixer absent). */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}