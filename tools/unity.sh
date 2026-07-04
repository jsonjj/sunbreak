#!/usr/bin/env bash
# SUNBREAK — headless Unity wrapper. Each subcommand is one batchmode invocation whose
# result is readable from BuildLogs/*.log. Personal-license batchmode requires the Unity
# Editor GUI to be CLOSED for this project (only one instance may open a project).
set -uo pipefail

UNITY="${UNITY:-/Applications/Unity/Hub/Editor/6000.3.11f1/Unity.app/Contents/MacOS/Unity}"
PROJECT="${PROJECT:-/Users/jonat/Desktop/sunbreak-unity}"
LOGDIR="$PROJECT/BuildLogs"
mkdir -p "$LOGDIR/shots"

_run() {
  local name="$1"; local method="$2"
  local log="$LOGDIR/${name}.log"
  echo "[unity.sh] running '$name' (method=$method)"
  echo "[unity.sh] log: $log"
  "$UNITY" -batchmode -quit -projectPath "$PROJECT" -logFile "$log" -executeMethod "$method"
  local code=$?
  if grep -q "error CS" "$log" 2>/dev/null; then
    echo "[unity.sh] FAIL: compiler errors in $log:"
    grep -n "error CS" "$log" | head -n 40
    return 1
  fi
  if [ "$code" -ne 0 ]; then
    echo "[unity.sh] FAIL: '$name' exited $code. Tail of log:"
    tail -n 40 "$log"
    return "$code"
  fi
  echo "[unity.sh] OK: '$name' (exit 0)"
  return 0
}

cmd="${1:-help}"
case "$cmd" in
  compile) _run compile "SUNBREAK.BuildTools.CompileCheck.Run" ;;
  greybox) _run greybox "SUNBREAK.EditorTools.GreyboxSceneBuilder.Build" ;;
  build)   _run build   "SUNBREAK.BuildTools.BuildMacOS.Build" ;;
  capture) _run capture "SUNBREAK.BuildTools.CaptureScreenshot.Capture" ;;
  run)
    APP="$PROJECT/Builds/SUNBREAK.app"
    if [ ! -d "$APP" ]; then
      echo "[unity.sh] No build at $APP — run './tools/unity.sh build' first."
      exit 1
    fi
    echo "[unity.sh] launching $APP"
    open "$APP"
    ;;
  all)
    _run compile "SUNBREAK.BuildTools.CompileCheck.Run" && \
    _run greybox "SUNBREAK.EditorTools.GreyboxSceneBuilder.Build" && \
    _run build   "SUNBREAK.BuildTools.BuildMacOS.Build" && \
    _run capture "SUNBREAK.BuildTools.CaptureScreenshot.Capture"
    ;;
  *)
    cat <<'EOF'
SUNBREAK Unity headless wrapper
Usage: ./tools/unity.sh <command>
  compile   Force a headless compile check (SUNBREAK.BuildTools.CompileCheck.Run)
  greybox   (Re)generate the greybox scene (SUNBREAK.EditorTools.GreyboxSceneBuilder.Build)
  build     Build Builds/SUNBREAK.app (StandaloneOSX)
  capture   Render screenshots to BuildLogs/shots/
  run       Open the built .app
  all       compile -> greybox -> build -> capture
Env overrides: UNITY=<editor binary>  PROJECT=<project path>
EOF
    ;;
esac
