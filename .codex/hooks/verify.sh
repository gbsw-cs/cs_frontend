#!/usr/bin/env bash
set -euo pipefail

MARKER="Codex Harness verification hook"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  printf '%s\n' "verify: not inside a Git repository; skipping." >&2
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "verify: Node.js is required but was not found in PATH." >&2
  exit 1
fi

run_project() {
  local relative_dir="$1"
  local project_dir="$repo_root/$relative_dir"

  if [[ ! -f "$project_dir/package.json" ]]; then
    printf '%s\n' "verify: $relative_dir/package.json not found; skipping."
    return 0
  fi

  cd "$project_dir"

  local runner
  if [[ -f pnpm-lock.yaml ]]; then
    runner=(pnpm run)
  elif [[ -f yarn.lock ]]; then
    runner=(yarn run)
  elif [[ -f bun.lockb || -f bun.lock ]]; then
    runner=(bun run)
  else
    runner=(npm run)
  fi

  if ! command -v "${runner[0]}" >/dev/null 2>&1; then
    printf 'verify: required package manager "%s" was not found in PATH for %s.\n' "${runner[0]}" "$relative_dir" >&2
    exit 1
  fi

  has_script() {
    node -e 'const p=require("./package.json"); process.exit(p.scripts?.[process.argv[1]] ? 0 : 1)' "$1"
  }

  local ran=0
  for script_name in lint test build; do
    if has_script "$script_name"; then
      printf '\n==> [%s] Running %s\n' "$relative_dir" "$script_name"
      CI=1 "${runner[@]}" "$script_name"
      ran=1
    else
      printf '%s\n' "verify: [$relative_dir] skipping missing script '$script_name'."
    fi
  done

  if [[ "$ran" -eq 0 ]]; then
    printf '%s\n' "verify: [$relative_dir] no lint, test, or build scripts were defined."
  fi
}

run_project anjava
run_project anjava-extend

local_hook="$repo_root/.git/hooks/pre-push.local"
if [[ -x "$local_hook" ]]; then
  "$local_hook" "$@"
fi

exit 0
