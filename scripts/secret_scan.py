#!/usr/bin/env python3
"""secret_scan.py — v15-E9 (D11-G3): بوابة مسح الأسرار قبل الدفع/في CI.

الأصل التصميمي: gstack lib/redact-engine.ts (القدرة G3 من تقرير v15-D11) —
المبادئ المنقولة حرفياً:

  1. **التطبيع قبل المطابقة** — NFKC (حرفاً بحرف) + تجريد محارف zero-width
     + فك HTML entities الرقمية، حتى يفشل التمويه بـ Unicode-confusable
     (نص كامل العرض ｇｈｐ＿ · محارف مخفية بين حروف التوكن). خريطة إزاحات
     تعيد كل إيجاد إلى سطر/عمود النص **الأصلي** لا المطبع.
  2. **سلامة ReDoS** — أنماط خطية (بلا backtracking كارثي) + سقف حجم مدخل
     **يفشل مغلقاً**: ملف ضخم جداً = إيجاد BLOCK واحد، لا تجاوز للمسح.
  3. **قمع الـ placeholders على المدى المطابق فقط** (لا على السطر كله) —
     `postgres://USER:PASSWORD@host` في التوثيق مشروع؛ `user:hunter2@` ليس كذلك.
     قائمة الكلمات مقيّدة (exact token، حساسة للحالة — قاعدة gstack:
     كلمة مرور صغيرة `password` في هذا الموضع = سر حقيقي يجب أن يحجب).

الأنماط المفروضة (فئة D6-H1 — حادثة fb_dashboard/.env التاريخية blob
2e6a618a عبر ~100 التزام):

  - db.url_with_password : postgres/mysql/mongodb/redis/amqp URL بكلمة مرور
                           مضمّنة (DATABASE_URL وأخواتها — نمط الحادثة نفسه)
  - github.pat           : ghp_ (توكن وصول GitHub)
  - sentry.user_token    : sntryu_ (توكن مستخدم Sentry)
  - pem.private_key      : -----BEGIN … PRIVATE KEY----- (أي لهجة)

الخروج: 0 = نظيف · 1 = إيجاد واحد على الأقل (أو فشل مغلق لملف ضخم).

الأوضاع:
  (الافتراضي)  مسح كل ملفات الشجرة العاملة (tracked + untracked غير المهمَلة)
  --staged     فقط أسطر diff المضافة مقابل HEAD (بوابة ما-قبل-الدفع المحلية)
  --history    فحص أصناف حادثة D6-H1: هل أُضيف ملف `.env*` في أي التزام في
               التاريخ كله؟ (أداة إثبات المالك بعد purge — انظر
               docs/deployment.md «إجراءات المالك الإلزامية بعد v15»)

  الاستخدام: python scripts/secret_scan.py [--staged | --history] [--verbose]
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ── السقف المُفشِل مُغلقاً (مبدأ gstack: المدخل الضخم لا يُتجاوز بل يُحجب) ──
MAX_FILE_BYTES = 2 * 1024 * 1024    # حجم النافذة: المسح مقطّع بهذه الدفعات
HARD_FILE_CAP = 64 * 1024 * 1024    # فوق هذا: فشل مغلق (إيجاد بذاته)
# تداخل بين النوافذ: يمنع فقد تطابق مقسوم على حد نافذة (محارف تطبيع
# متعددة البايت أو zero-width على الحد بالضبط) — يُزال الازدواج بالمفتاح
_WINDOW_OVERLAP = 4096

# محارف zero-width (تجرد قبل التطبيع — NFKC لا يفككها)
_ZW = set("\u200b\u200c\u200d\u200e\u200f\u2060\u2061\u2062\u2063\u2064\ufeff")

# كيانات HTML رقمية: &#65; &#x41;
_ENTITY_RE = re.compile(r"&#(?:(x[0-9a-fA-F]+)|([0-9]+));")

# ── عناصر قمع الـ placeholders (منقول من gstack مع تعليقاته) ──────────────
# كلمات ممر التوثيق — مطابقة EXACT حساسة للحالة (الحاصرة الكبيرة هي العرف
# التوثيقي؛ `password` صغيرة في موضع كلمة المرور = سر حقيقي (سيء) يجب حجبه)
_URL_PW_PLACEHOLDER_WORDS = {
    "PASSWORD", "PASS", "PASSWD", "YOUR_PASSWORD", "DB_PASSWORD",
    "MY_PASSWORD", "CHANGEME", "CHANGE_ME", "PLACEHOLDER", "REDACTED",
    "EXAMPLE",
}
# قوالب interpolation كاملة القوس — كود قالب لا سر
_INTERP_RE = re.compile(r"^(\$\{.+\}|\$[A-Z_][A-Z0-9_]*)$")
# أشكال هيكلية — مطبقة على كلمة المرور كمدى كامل
_PW_STRUCTURAL = (
    re.compile(r"^<[^>]*>$"),   # <REDACTED>, <كلمة مرور>
    re.compile(r"^\*+$"),       # قناع نجوم
    re.compile(r"^x{4,}$", re.I),  # قناع إكسات
    re.compile(r"^\.{3,}$"),
    re.compile(r"^your[-_]", re.I),
    re.compile(r"^test[-_]", re.I),
)


@dataclass(frozen=True)
class Pattern:
    id: str
    description: str
    regex: re.Pattern


def _url_password_is_placeholder(span: str) -> bool:
    """كلمة مرور URL مضمّنة: هل هي placeholder توثيقي؟ (exact-token، لا شكل)

    عرف التوثيق في المستودع: الأحرف الكبيرة (postgres://USER:PASSWORD@host)
    — الكلمة الصغيرة `password` في هذا الموضع = سر حقيقي (سيء) يجب حجبه
    (قاعدة gstack الحرفية: exact-token case-sensitive)."""
    m = re.search(r"://[^:\s/@]+:([^@\s/]+)@", span)
    pw = m.group(1) if m else ""
    if pw == "":
        return True
    if _INTERP_RE.match(pw):
        return True
    if pw in _URL_PW_PLACEHOLDER_WORDS:
        return True
    return any(rx.search(pw) for rx in _PW_STRUCTURAL)


PATTERNS = [
    Pattern(
        id="db.url_with_password",
        description="Database URL with embedded password (D6-H1 incident class)",
        regex=re.compile(
            r"\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://"
            r"[^:\s/@\"']+:[^@\s/\"']+@[^\s/\"']+)"
        ),
        # القمع عبر _url_password_is_placeholder (validate)
    ),
    Pattern(
        id="github.pat",
        description="GitHub personal access token (ghp_…)",
        regex=re.compile(r"\bghp_[A-Za-z0-9]{36}\b"),
    ),
    Pattern(
        id="sentry.user_token",
        description="Sentry user auth token (sntryu_…)",
        regex=re.compile(r"\bsntryu_[A-Za-z0-9_-]{16,}\b"),
    ),
    Pattern(
        id="pem.private_key",
        description="PEM private key block header",
        regex=re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    ),
]

# أنماط ذات مدقق خاص (URL: كلمة مرور placeholder = توثيق مشروع)
_VALIDATORS = {"db.url_with_password": _url_password_is_placeholder}


# ── التطبيع مع خريطة إزاحات إلى النص الأصلي (مبدأ gstack-redact) ──────────
def normalize(text: str) -> tuple[str, list[int]]:
    """NFKC حرفاً بحرف + تجريد zero-width + فك كيانات رقمية.

    يعيد (النص المطبع، إزاحات) حيث إزاحات[i] = مؤشر النص الأصلي الذي أنتج
    المحرف المطبع رقم i — خطي دائماً، وخطوط النص الأصلي تبقى صالحة للإبلاغ.
    """
    out: list[str] = []
    offsets: list[int] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "&" and text.startswith("&#", i):
            m = _ENTITY_RE.match(text, i)
            if m:
                try:
                    cp = int(m.group(1)[1:], 16) if m.group(1) else int(m.group(2))
                    if 0 < cp <= 0x10FFFF:
                        expanded = chr(cp)
                        for c in expanded:
                            if c not in _ZW:
                                out.append(c)
                                offsets.append(i)
                        i = m.end()
                        continue
                except (ValueError, OverflowError):
                    pass  # كيان معطوب — عامَل '&' كنص
        if ch in _ZW:
            i += 1
            continue
        for c in unicodedata.normalize("NFKC", ch):
            if c in _ZW:
                continue
            out.append(c)
            offsets.append(i)
        i += 1
    return "".join(out), offsets


def _line_col(offsets: list[int], norm_pos: int, original: str) -> tuple[int, int]:
    """سطر/عمود (1-based) في النص الأصلي لموضع مطبع."""
    orig = offsets[min(norm_pos, len(offsets) - 1)] if offsets else 0
    line = original.count("\n", 0, orig) + 1
    last_nl = original.rfind("\n", 0, orig)
    col = orig - (last_nl + 1) + 1
    return line, col


def _mask(span: str) -> str:
    """معاينة مقنعة: أول 4 محارف + طول فقط (لا يطبع السر)."""
    return f"{span[:4]}…({len(span)} chars)"


@dataclass
class Finding:
    path: str
    line: int
    col: int
    pattern_id: str
    description: str
    preview: str


def scan_text(path: str, text: str, findings: list[Finding],
              lines_before: int = 0, dedup: set | None = None) -> None:
    """مسح نص واحد (نافذة) — التطبيع ثم الأنماط ثم القمع ثم الإبلاغ.

    ``lines_before``: عدد الأسطر الكاملة قبل بداية هذه النافذة في الملف
    الأصلي (مسح مقطّع للملفات الكبيرة). ``dedup``: مفتاح ازدواج بين
    النوافذ المتداخلة (path, pattern, preview, line)."""
    norm, offsets = normalize(text)
    for pat in PATTERNS:
        for m in pat.regex.finditer(norm):
            span = m.group(0)
            validator = _VALIDATORS.get(pat.id)
            if validator and validator(span):
                continue  # placeholder توثيقي — مشروع
            line, col = _line_col(offsets, m.start(), text)
            line += lines_before
            if dedup is not None:
                key = (path, pat.id, _mask(span), line)
                if key in dedup:
                    continue
                dedup.add(key)
            findings.append(Finding(path, line, col, pat.id, pat.description, _mask(span)))


# ── جرد الملفات ────────────────────────────────────────────────────────────
_SKIP_DIRS = {
    ".git", ".venv", "venv", "node_modules", ".next", "__pycache__",
    ".pytest_cache", ".playwright-mcp", "e2e_artifacts", ".ruff_cache",
    ".mypy_cache", "static", "uploads",
}
_TEXT_SUFFIX_BLACKLIST = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf",
    ".zip", ".gz", ".tgz", ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp4", ".webm", ".mp3", ".wasm", ".db", ".sqlite", ".sqlite3",
    ".pyc", ".class", ".jar", ".node",
}


def _iter_worktree_files() -> list[Path]:
    """كل ملفات الشجرة (tracked + untracked بلا المهمَلة) — عبر git إن توفر."""
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files", "--cached", "--others",
             "--exclude-standard"],
            capture_output=True, text=True, check=True,
        ).stdout
        files = []
        for rel in out.splitlines():
            p = REPO_ROOT / rel
            if p.is_file():
                files.append(p)
        return files
    except (subprocess.CalledProcessError, FileNotFoundError):
        # لا git — تنازل آمن: os.walk مع نفس الاستثناءات
        files = []
        for dirpath, dirnames, filenames in REPO_ROOT.walk():
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
            for fn in filenames:
                files.append(Path(dirpath) / fn)
        return files


def scan_worktree(verbose: bool) -> list[Finding]:
    findings: list[Finding] = []
    for p in sorted(_iter_worktree_files()):
        rel = str(p.relative_to(REPO_ROOT))
        if p.suffix.lower() in _TEXT_SUFFIX_BLACKLIST:
            continue
        if any(part in _SKIP_DIRS for part in p.parts):
            continue
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if size > HARD_FILE_CAP:
            # فشل مغلق: ملف نصي ضخم جداً (فوق السقف الصلب) = إيجاد بذاته
            findings.append(Finding(rel, 0, 0, "scanner.input_too_large",
                                    f"file exceeds hard scan cap ({size} > {HARD_FILE_CAP}B) — fail-closed",
                                    ""))
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, OSError):
            continue  # ثنائي/غير مقروء — خارج نطاق مسح نصي
        _scan_windowed(rel, text, findings)
        if verbose:
            print(f"  scanned {rel} ({size}B)")
    return findings


def _scan_windowed(path: str, text: str, findings: list[Finding]) -> None:
    """مسح مقطّع: ملفات أكبر من نافذة واحدة تُمسح بدفعات متداخلة.

    سقف gstack «يفشل مغلقاً» يحرس السقف الصلب (HARD_FILE_CAP)؛ ما دونه
    نُمسح كاملاً بلا ثقوب — أدلة HAR الملتزمة (م ~12MB) يجب أن تخضع
    للمسح لا أن تُستثنى: حركة HTTP المسجلة أول مكان يتسرب فيه توكن/كوكي.
    """
    n = len(text)
    if n <= MAX_FILE_BYTES:
        scan_text(path, text, findings)
        return
    dedup: set = set()
    start = 0
    while start < n:
        window = text[start:start + MAX_FILE_BYTES]
        lines_before = text.count("\n", 0, start)
        scan_text(path, window, findings, lines_before=lines_before, dedup=dedup)
        if start + MAX_FILE_BYTES >= n:
            break
        start += MAX_FILE_BYTES - _WINDOW_OVERLAP


def scan_staged(verbose: bool) -> list[Finding]:
    """الأسطر المضافة فقط في diff الم pending (HEAD + منطقة staging + الشجرة).

    بوابة ما-قبل-الدفع: تصطاد السر الجديد لحظة إضافته لا لاحقاً.
    """
    findings: list[Finding] = []
    try:
        diff = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "diff", "--no-color", "-U0", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"secret_scan: cannot read git diff ({exc}) — fail-closed", file=sys.stderr)
        return [Finding("<git-diff>", 0, 0, "scanner.git_error", str(exc), "")]

    current_file = None
    line_no = 0
    for raw in diff.splitlines():
        if raw.startswith("+++ b/"):
            current_file = raw[6:] or "(root)"
            continue
        if raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            line_no = int(m.group(1)) if m else 0
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            # سطر مضاف (بلا سياق متجاور) — افحصه بمفرده بأرقام أسطر diff
            line_text = raw[1:]
            pre: list[Finding] = []
            scan_text(current_file or "(unknown)", line_text, pre)
            for f in pre:
                findings.append(Finding(f.path, line_no, f.col,
                                        f.pattern_id, f.description, f.preview))
            line_no += 1
    return findings


def scan_history() -> list[Finding]:
    """فحص أصناف D6-H1: أي التزام أضاف ملف `.env*` قط (كل المراجع).

    لا يمنع ماضياً وقع (الpurge بروتوكول المالك — docs/deployment.md)، بل
    يمنع تكرار الفئة مستقبلاً ويمنح المالك أداة إثبات نظافة التاريخ بعد
    git filter-repo: خروج نظيف = لا blob أسرار متبقٍ في التاريخ.
    """
    findings: list[Finding] = []
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "log", "--all", "--diff-filter=A",
             "--format=%H", "--name-only", "--",
             ".env", ".env.*", "*.env", "*.env.local"],
            capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"secret_scan: cannot read git history ({exc}) — fail-closed", file=sys.stderr)
        return [Finding("<git-history>", 0, 0, "scanner.git_error", str(exc), "")]
    added = {ln.strip() for ln in out.splitlines() if ln.strip() and not re.fullmatch(r"[0-9a-f]{40}", ln.strip())}
    # القوالب التوثيقية صنف مشروع بالتصميم (محتواها يخضع لمسح الأنماط في
    # وضع الشجرة) — الممنوع تاريخياً: ملفات الأسرار الفعلية .env*
    _LEGIT_TEMPLATES = (".env.example", ".env.sample", ".env.template", "env.example")
    added = {p for p in added if Path(p).name not in _LEGIT_TEMPLATES}
    for rel in sorted(added):
        findings.append(Finding(rel, 0, 0, "history.env_file_added",
                                "file added to git history (D6-H1 class — see deployment.md owner protocol)",
                                ""))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartBot secret scan gate (v15-E9 / D11-G3)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true",
                      help="scan added diff lines vs HEAD (pre-push gate)")
    mode.add_argument("--history", action="store_true",
                      help="fail if any .env* file was EVER added to git history (D6-H1 proof)")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    print("── secret-scan (v15-E9 · NFKC + zero-width + entity-decode normalization) ──")
    if args.history:
        findings = scan_history()
        scope = "git history: .env* ever added"
    elif args.staged:
        findings = scan_staged(args.verbose)
        scope = "diff vs HEAD (added lines)"
    else:
        findings = scan_worktree(args.verbose)
        scope = "working tree"

    print(f"   scope: {scope}")
    if not findings:
        print("✅ secret-scan: no findings — clean")
        return 0

    print(f"❌ secret-scan: {len(findings)} finding(s):")
    for f in findings:
        preview = f" preview={f.preview}" if f.preview else ""
        print(f"   {f.path}:{f.line}:{f.col}  [{f.pattern_id}] {f.description}{preview}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
