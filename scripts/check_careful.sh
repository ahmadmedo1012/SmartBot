#!/usr/bin/env bash
# scripts/check_careful.sh — v16-E7 (D7-G2): فحص أمر واحد ضد أنماط
# «الأبواب الأحادية» (gstack careful-mode مكيفاً لـ SmartBot) — للوكلاء
# والبشر قبل التنفيذ. الدفع القسري/حذف main يعالجه .githooks/pre-push
# (يعمل ذاتياً عند الدفع)؛ هذا الملف لأنماط shell/الترحيل/SQL.
#
# الاستخدام:
#   bash scripts/check_careful.sh "rm -rf /var/data"
#   echo "alembic downgrade base" | bash scripts/check_careful.sh
# الخروج: 0 = آمن · 1 = نمط خطر (مع شرح عربي/إنجليزي) · 2 = استدعاء فارغ
#
# الأنماط المرفوضة (خطة v16 §1-E7-م4 — كلها باب واحد الاتجاه):
#   1. git filter-repo          — إعادة كتابة التاريخ: بروتوكول المالك
#                                  حصراً (dec-git-history-secrets)
#   2. alembic downgrade        — هدم حالة المخطط المطبقة في الإنتاج
#                                  (عقيدة الترحيل للأمام فقط — v13)
#   3. DROP TABLE/DATABASE أو   — فقد بيانات؛ يُستثنى ما يستهدف صراحةً
#      TRUNCATE                   /tmp أو ملف اختبار
#   4. rm قسري عودي (r+f) خارج — حذف جذر المستودع = مساحة عمل الوكلاء
#      جذر المستودع               كلها
# ملاحظة استدلالية: الأهداف النسبية لـ rm تُفترض داخل المستودع (الاستدعاء
# من جذره)؛ الأهداف المطلقة أو ~/‎$HOME خارج REPO_ROOT هي المرصودة.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CMD="${*:-}"
if [[ -z "$CMD" && ! -t 0 ]]; then
  CMD="$(cat)"
fi
if [[ -z "$CMD" ]]; then
  echo 'usage: bash scripts/check_careful.sh "<command string>"  (or pipe it via stdin)' >&2
  exit 2
fi

deny() {  # $1 = اسم النمط، $2 = الشرح
  cat >&2 <<MSG
❌ [careful] مرفوض — باب أحادي: $1
❌ [careful] DENIED — one-way door: $1
   $2
   إن كان مقصوداً فعلاً: وثّق القرار في docs/decisions-ledger.md أولاً ثم
   نفّذه يدوياً — هذا الفحص لا يُتجاوز ذاتياً من وكيل.
   If truly intended: document it in the decisions ledger first, then run it yourself.
MSG
  exit 1
}

# فحص مقطع واحد يبدأ بـ rm: أعلام عودية+قسرية ثم أهداف مطلقة خارج المستودع.
# يضبط RM_DANGER عند أول هدف خارجي (globbing معطل أثناء التقسيم).
RM_DANGER=""
_check_rm_segment() {
  local seg="$1" tok
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim بداية
  seg="${seg%"${seg##*[![:space:]]}"}"   # trim نهاية
  [[ "$seg" == sudo*rm\ * || "$seg" == rm\ * ]] || return 0
  seg="${seg#sudo }"
  local -a toks=()
  set -f
  for tok in $seg; do
    toks+=("$tok")
  done
  set +f
  local has_r=0 has_f=0 end_opts=0 i
  for ((i = 1; i < ${#toks[@]}; i++)); do
    tok="${toks[i]}"
    if [[ $end_opts -eq 0 && "$tok" == -- ]]; then
      end_opts=1
      continue
    fi
    if [[ $end_opts -eq 0 && "$tok" == -* ]]; then
      if [[ "$tok" == --* ]]; then
        [[ "$tok" == --recursive || "$tok" == --recursive=* ]] && has_r=1
        [[ "$tok" == --force || "$tok" == --force=* ]] && has_f=1
      else
        [[ "$tok" == *[rR]* ]] && has_r=1
        [[ "$tok" == *[fF]* ]] && has_f=1
      fi
      continue
    fi
    # هدف: قشر طبقة اقتباس واحدة ثم صناعة القرار المسارية
    if [[ $has_r -eq 1 && $has_f -eq 1 ]]; then
      local tpath="$tok"
      tpath="${tpath#\"}"; tpath="${tpath%\"}"
      tpath="${tpath#\'}"; tpath="${tpath%\'}"
      [[ "$tpath" == '~'* ]] && tpath="${tpath/#\~/$HOME}"
      if [[ "$tpath" == /* || "$tpath" == '$HOME'* || "$tpath" == '${HOME}'* ]]; then
        if [[ "$tpath" != "$REPO_ROOT" && "$tpath" != "$REPO_ROOT"/* ]]; then
          RM_DANGER="$tpath"
          return 0
        fi
      fi
    fi
  done
  return 0
}

# 1) إعادة كتابة تاريخ git — بروتوكول المالك حصراً (dec-git-history-secrets)
if printf '%s' "$CMD" | grep -Eqi 'filter-repo'; then
  deny "git filter-repo" \
    "History rewrite breaks every clone and the deploy trail; owner-protocol only (dec-git-history-secrets)."
fi

# 2) هدم الترحيلات (عقيدة الترحيل للأمام فقط — v13)
if printf '%s' "$CMD" | grep -Eqi 'alembic[[:space:]].*downgrade'; then
  deny "alembic downgrade" \
    "Rolling back migrations destroys schema state applied across production rounds; forward-only."
fi

# 3) فقد البيانات SQL — يُستثنى ما يستهدف صراحةً /tmp أو ملف اختبار
if printf '%s' "$CMD" | grep -Eqi 'DROP[[:space:]]+(TABLE|DATABASE)|TRUNCATE'; then
  if ! printf '%s' "$CMD" | grep -Eqi '/tmp|test'; then
    deny "DROP TABLE/DATABASE · TRUNCATE" \
      "Data loss on a non-test database; only /tmp targets or test fixtures are exempt."
  fi
fi

# 4) rm قسري عودي خارج جذر المستودع — تحليل لكل مقطع أمر (؛ | && ||)
if printf '%s' "$CMD" | grep -Eq '(^|[;&|][[:space:]]*)rm[[:space:]]'; then
  while IFS= read -r _seg; do
    _check_rm_segment "$_seg"
    [[ -n "$RM_DANGER" ]] && break
  done < <(printf '%s\n' "$CMD" | tr ';|' '\n\n' | sed 's/&&/\n/g')
fi
if [[ -n "$RM_DANGER" ]]; then
  deny "rm -rf خارج المستودع / outside the repo: $RM_DANGER" \
    "Recursive force-delete aimed outside $REPO_ROOT — that path is not this workspace's to destroy."
fi

exit 0
