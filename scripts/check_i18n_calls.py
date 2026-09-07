#!/usr/bin/env python3
"""v6 §A gate — every user-visible number/date MUST go through src/lib/format.ts.

Rationale: before v6 the codebase mixed FOUR formatting styles:
  count.toLocaleString()        -> per-visitor-browser format (StatsSection defect)
  x.toLocaleString("ar-LY")     -> Western digits + dot grouping
  x.toLocaleString("ar-EG")     -> Arabic-Indic digits ٠١٢٣
  new Date(x).toLocaleDateString("ar-LY") -> "6‏/9‏/2026" with invisible RTL marks
One seam (format.ts), one convention. This gate makes regression impossible.

Comment lines are ignored (docs may quote the forbidden API names).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "fb_dashboard" / "frontend" / "src"
FORMAT_SEAM = "lib/format.ts"
FORBIDDEN = re.compile(r"\.toLocale(String|DateString|TimeString)\s*\(")


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)  # block comments
    src = re.sub(r"//[^\n]*", "", src)  # line comments
    return src


def main() -> int:
    violations: list[tuple[str, int, str]] = []
    files = sorted(ROOT.rglob("*.ts")) + sorted(ROOT.rglob("*.tsx"))
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        if rel == FORMAT_SEAM:
            continue  # the seam itself is allowed to call the platform APIs
        code = strip_comments(f.read_text(encoding="utf-8"))
        for i, line in enumerate(code.splitlines(), 1):
            if FORBIDDEN.search(line):
                violations.append((rel, i, line.strip()[:100]))
    if violations:
        print("FAIL i18n gate — direct locale calls outside src/lib/format.ts:")
        for rel, i, line in violations:
            print(f"  {rel}:{i}  {line}")
        print("\nFix: import { formatNumber, formatDate, formatDateOnly, formatMonth } from '@/lib/format'")
        return 1
    print(f"PASS i18n gate — 0 direct locale calls outside the format.ts seam "
          f"({len(files)} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
