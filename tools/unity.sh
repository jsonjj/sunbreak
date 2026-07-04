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

# LAUNCH SMOKE TEST: a green compile/build is NOT enough — actually run the built player
# headlessly for a few seconds and FAIL if the fresh log shows a crash/corruption/exception.
# Catches "level0 corrupted" / "Position out of bounds" / NullRef that only appear at launch.
_smoke() {
  local appbin="$PROJECT/Builds/SUNBREAK.app/Contents/MacOS/sunbreak-unity"
  local slog="$LOGDIR/smoke.log"
  local secs="${SMOKE_SECONDS:-12}"
  if [ ! -x "$appbin" ]; then
    echo "[smoke] FAIL: no built binary at $appbin (build first)"; return 1
  fi
  rm -f "$slog"
  echo "[smoke] launching headless player for ${secs}s ..."
  "$appbin" -batchmode -nographics -logFile "$slog" >/dev/null 2>&1 &
  local pid=$! early=0 i=0
  while [ "$i" -lt "$secs" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then early=1; break; fi
    sleep 1; i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null; fi

  local pat='is corrupted|Position out of bounds|Fatal error|Unhandled [Ee]xception|NullReferenceException|Crash!|SIGSEGV|SIGABRT|Segmentation fault'
  local hits; hits=$(grep -nE "$pat" "$slog" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "[smoke] FAIL: crash/error signatures in $slog:"; echo "$hits" | head -n 20; return 1
  fi
  if [ "$early" -eq 1 ]; then
    echo "[smoke] FAIL: player exited early (likely a launch crash). Tail of $slog:"; tail -n 30 "$slog"; return 1
  fi
  echo "[smoke] PASS: player launched + ran ${secs}s clean (no crash/corruption/exception)."
  return 0
}

cmd="${1:-help}"
case "$cmd" in
  compile) _run compile "SUNBREAK.BuildTools.CompileCheck.Run" ;;
  greybox) _run greybox "SUNBREAK.EditorTools.GreyboxSceneBuilder.Build" ;;
  hero)    _run hero    "SUNBREAK.EditorTools.World.HeroStreetBuilder.Build" ;;
  island)  _run island  "SUNBREAK.EditorTools.World.IslandSceneBuilder.Build" ;;
  menu)    _run menu    "SUNBREAK.EditorTools.MainMenuSceneBuilder.Build" ;;
  build)   _run build   "SUNBREAK.BuildTools.BuildMacOS.Build" ;;
  smoke)   _smoke ;;
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
    _run island  "SUNBREAK.EditorTools.World.IslandSceneBuilder.Build" && \
    _run menu    "SUNBREAK.EditorTools.MainMenuSceneBuilder.Build" && \
    _run build   "SUNBREAK.BuildTools.BuildMacOS.Build" && \
    _smoke && \
    _run capture "SUNBREAK.BuildTools.CaptureScreenshot.Capture"
    ;;
  *)
    cat <<'EOF'
SUNBREAK Unity headless wrapper
Usage: ./tools/unity.sh <command>
  compile   Force a headless compile check (SUNBREAK.BuildTools.CompileCheck.Run)
  greybox   (Re)generate the greybox scene (SUNBREAK.EditorTools.GreyboxSceneBuilder.Build)
  hero      (Re)generate the Slice 1 hero street (SUNBREAK.EditorTools.World.HeroStreetBuilder.Build)
  island    (Re)generate the Slice 2 full island scene (SUNBREAK.EditorTools.World.IslandSceneBuilder.Build)
  menu      (Re)generate the MainMenu scene + pin build order [MainMenu, Island]
  build     Build Builds/SUNBREAK.app (StandaloneOSX)
  smoke     Launch the built player headless + FAIL on crash/corruption/exception in the log
  capture   Render screenshots to BuildLogs/shots/
  run       Open the built .app
  all       compile -> island -> menu -> build -> smoke -> capture
Env overrides: UNITY=<editor binary>  PROJECT=<project path>  SMOKE_SECONDS=<n>
Note: every build must PASS 'smoke' — a green compile/build alone does NOT prove it launches.
EOF
    ;;
esac
