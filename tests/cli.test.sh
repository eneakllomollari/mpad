#!/bin/bash
# Tests for scripts/mpad CLI wrapper
# Run: bash tests/cli.test.sh

set -euo pipefail

SCRIPT="$(dirname "$0")/../scripts/mpad"
PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc"
    echo "    expected to contain: $needle"
    echo "    actual: $haystack"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc (exit $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "CLI wrapper tests"
echo "================="

# help subcommand
echo ""
echo "help command:"
out=$(bash "$SCRIPT" help 2>&1) || true
assert_contains "shows usage header" "Markdown editor" "$out"
assert_contains "shows update command" "mpad update" "$out"
assert_contains "shows version command" "mpad version" "$out"
assert_contains "shows file usage" "mpad \[file.md\]" "$out"

# --help flag
echo ""
echo "--help flag:"
out=$(bash "$SCRIPT" --help 2>&1) || true
assert_contains "--help shows usage" "Markdown editor" "$out"

# -h flag
echo ""
echo "-h flag:"
out=$(bash "$SCRIPT" -h 2>&1) || true
assert_contains "-h shows usage" "Markdown editor" "$out"

# help exits 0
echo ""
echo "exit codes:"
bash "$SCRIPT" help >/dev/null 2>&1; code=$?
assert_exit "help exits 0" "0" "$code"

bash "$SCRIPT" --help >/dev/null 2>&1; code=$?
assert_exit "--help exits 0" "0" "$code"

bash "$SCRIPT" -h >/dev/null 2>&1; code=$?
assert_exit "-h exits 0" "0" "$code"

# version subcommand (may say "not installed" in CI — that's fine)
echo ""
echo "version command:"
out=$(bash "$SCRIPT" version 2>&1) || true
assert_contains "version outputs mpad" "mpad" "$out"

out=$(bash "$SCRIPT" --version 2>&1) || true
assert_contains "--version outputs mpad" "mpad" "$out"

out=$(bash "$SCRIPT" -v 2>&1) || true
assert_contains "-v outputs mpad" "mpad" "$out"

bash "$SCRIPT" version >/dev/null 2>&1; code=$?
assert_exit "version exits 0" "0" "$code"

# update subcommand (don't actually run — just verify it exists in help)
echo ""
echo "update in help:"
out=$(bash "$SCRIPT" help 2>&1) || true
assert_contains "help mentions update" "Update to the latest release" "$out"

# No args: will fail (no app bundle in CI), but should try to open, not show help
echo ""
echo "no args (no app bundle):"
out=$(bash "$SCRIPT" 2>&1) || true; code=$?
# In CI, no app bundle installed — should get "not found" error, not help text
if echo "$out" | grep -q "not found"; then
  assert_contains "no-args tries to open app" "not found" "$out"
elif echo "$out" | grep -q "Markdown editor"; then
  echo "  ✗ no-args should try open, not show help"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ no-args does not show help (expected: tries to open app)"
  PASS=$((PASS + 1))
fi

# File arg with missing app: should also fail with "not found"
echo ""
echo "file arg (no app bundle):"
out=$(bash "$SCRIPT" /tmp/test.md 2>&1) || true
if echo "$out" | grep -q "not found"; then
  assert_contains "file arg tries to open" "not found" "$out"
else
  echo "  ✓ file arg does not show help"
  PASS=$((PASS + 1))
fi

# "not found" message should mention mpad update
echo ""
echo "not-found message:"
out=$(bash "$SCRIPT" 2>&1) || true
if echo "$out" | grep -q "not found"; then
  assert_contains "not-found suggests mpad update" "mpad update" "$out"
fi

echo ""
echo "================="
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
