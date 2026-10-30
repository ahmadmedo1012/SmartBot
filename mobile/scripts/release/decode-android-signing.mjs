/**
 * Smart-Order Mobile — حقن توقيع Android للإصدار (GitHub Actions).
 *
 * يفك keystore من ANDROID_KEYSTORE_B64 (سر المستودع) ثم يرقّع
 * android/app/build.gradle المولَّد من `expo prebuild` بإضافة
 * signingConfigs.release — نفس درع الصدق العائلي: كل خطوة تتحقق من
 * مرساها وتفشل بصوت عالٍ بدل بناء APK غير موقّع بصمت.
 *
 * بلا أسرار (تشغيلة أولى قبل التهيئة): يتخطى الحقن ويترك gradle يبني
 * APK غير موقّع — خطوة التجميع تسمّيه صراحة «غير موقّع».
 *
 * الأسرار المطلوبة (التهيئة الأولى — انظر mobile/README.md):
 *   ANDROID_KEYSTORE_B64     base64 لملف .jks (keytool -genkeypair)
 *   ANDROID_KEY_ALIAS        اسم المفتاح
 *   ANDROID_KEYSTORE_PASSWORD  كلمة مخزن المفاتيح
 *   ANDROID_KEY_PASSWORD     كلمة المفتاح
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const KEYSTORE_PATH = 'android/app/release.keystore'
const PROPS_PATH = 'android/keystore.properties'
const GRADLE_PATH = 'android/app/build.gradle'

const b64 = process.env.ANDROID_KEYSTORE_B64
const alias = process.env.ANDROID_KEY_ALIAS
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD
const keyPassword = process.env.ANDROID_KEY_PASSWORD

if (!b64 || !alias || !storePassword || !keyPassword) {
  console.log('⚠️  signing secrets absent — building UNSIGNED release APK (configure repo secrets to sign)')
  process.exit(0)
}

// 1) فك الـkeystore
execSync(`printf '%s' "${b64}" | base64 -d > ${KEYSTORE_PATH}`)

// 2) خصائص التوقيع
writeFileSync(
  PROPS_PATH,
  `storeFile=release.keystore\nstorePassword=${storePassword}\nkeyAlias=${alias}\nkeyPassword=${keyPassword}\n`,
)

// 3) رقعة build.gradle — مرسيات صريحة
let gradle = readFileSync(GRADLE_PATH, 'utf8')

if (!gradle.includes('signingConfigs')) {
  const anchor = 'android {'
  if (!gradle.includes(anchor)) fail('anchor "android {" not found in build.gradle')
  gradle = gradle.replace(
    anchor,
    `def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {`,
  )
  const scAnchor = /signingConfigs\s*\{/
  if (!scAnchor.test(gradle)) fail('anchor "signingConfigs {" not found in build.gradle')
  gradle = gradle.replace(scAnchor, `signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`)
}

// 4) توجيه buildType.release إلى التوقيع
const releaseSigning = /release\s*\{([\s\S]*?)signingConfig signingConfigs\.debug/
if (releaseSigning.test(gradle)) {
  gradle = gradle.replace(releaseSigning, (m) =>
    m.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release'),
  )
} else if (!gradle.includes('signingConfig signingConfigs.release')) {
  fail('release buildType signingConfig anchor not found — prebuild template changed')
}

writeFileSync(GRADLE_PATH, gradle)

// 5) تحقق نهائي صريح
const finalGradle = readFileSync(GRADLE_PATH, 'utf8')
if (!finalGradle.includes('signingConfig signingConfigs.release') || !existsSync(KEYSTORE_PATH)) {
  fail('verification failed — signing not wired')
}

console.log('✓ release signing wired: keystore + properties + build.gradle patched')

function fail(msg) {
  console.error(`❌ decode-android-signing: ${msg}`)
  process.exit(1)
}
