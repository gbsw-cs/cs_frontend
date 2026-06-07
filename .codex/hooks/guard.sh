#!/usr/bin/env bash
set -euo pipefail

MARKER="Codex Harness secret guard"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  printf '%s\n' "guard: not inside a Git repository; skipping." >&2
  exit 0
fi

tmp_file="$(mktemp "${TMPDIR:-/tmp}/codex-guard.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

git -C "$repo_root" diff --cached --no-ext-diff --unified=0 --diff-filter=ACMR \
  | awk '/^\+\+\+/{next} /^\+/{sub(/^\+/, ""); print}' > "$tmp_file"

if [[ ! -s "$tmp_file" ]]; then
  exit 0
fi

if awk '
  BEGIN { IGNORECASE = 1; found = 0 }
  {
    line = $0
    lower = tolower(line)
    placeholder = lower ~ /(example|sample|placeholder|dummy|test[-_ ]?(key|token|secret)|change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(key|token|secret)|process\.env|import\.meta\.env)/

    strong = line ~ /-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----/ ||
             line ~ /AKIA[0-9A-Z]{16}/ ||
             line ~ /gh[pousr]_[A-Za-z0-9_]{30,}/ ||
             line ~ /github_pat_[A-Za-z0-9_]{20,}/ ||
             line ~ /sk-[A-Za-z0-9_-]{20,}/ ||
             line ~ /xox[baprs]-[A-Za-z0-9-]{20,}/

    assigned = lower ~ /(api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password)[[:space:]]*[:=][[:space:]]*["'\'' ]*[a-z0-9+\/_=.-]{12,}/

    if (strong || (assigned && !placeholder)) {
      printf "  staged line %d: %s\n", NR, substr(line, 1, 160) > "/dev/stderr"
      found = 1
    }
  }
  END { exit found ? 1 : 0 }
' "$tmp_file"; then
  :
else
  printf '\n%s\n' "Commit blocked: likely hardcoded secret found in staged added lines." >&2
  printf '%s\n' "Move the value to a secret store or environment variable, then stage the safe change." >&2
  printf '%s\n' "If this is a false positive, replace it with an explicit placeholder and retry." >&2
  exit 1
fi

local_hook="$repo_root/.git/hooks/pre-commit.local"
if [[ -x "$local_hook" ]]; then
  "$local_hook" "$@"
fi

exit 0
