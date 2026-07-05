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
  local glog="$LOGDIR/smoke_gfx.log"
  local secs="${SMOKE_SECONDS:-14}"
  if [ ! -x "$appbin" ]; then
    echo "[smoke] FAIL: no built binary at $appbin (build first)"; return 1
  fi

  # ── Pass 1: headless launch — crash / asset-load / animator / avatar / null scan ──
  rm -f "$slog"
  echo "[smoke] pass 1: headless launch ${secs}s ..."
  "$appbin" -batchmode -nographics -logFile "$slog" >/dev/null 2>&1 &
  local pid=$! early=0 i=0
  while [ "$i" -lt "$secs" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then early=1; break; fi
    sleep 1; i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null; fi

  local crash='is corrupted|Position out of bounds|Fatal error|Unhandled [Ee]xception|NullReferenceException|MissingReferenceException|Crash!|SIGSEGV|SIGABRT|Segmentation fault|does not have an AnimatorController|is not a valid .*[Aa]vatar|not a valid human|The referenced script .* is missing'
  local hits; hits=$(grep -nE "$crash" "$slog" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "[smoke] FAIL: crash/asset/anim signatures in $slog:"; echo "$hits" | head -n 20; return 1
  fi
  if [ "$early" -eq 1 ]; then
    echo "[smoke] FAIL: player exited early (likely a launch crash). Tail of $slog:"; tail -n 30 "$slog"; return 1
  fi

  # ── Pass 2: WITH graphics — renders a real build screenshot + scans for render/shader/material
  # errors that -nographics can't surface (this is what let the white-character bug slip through). ──
  rm -f "$glog"
  # persistentDataPath uses the (uncustomized) URP-template bundle id; also check DefaultCompany.
  local pd1="$HOME/Library/Application Support/com.Unity-Technologies.com.unity.template.urp-blank"
  local pd2="$HOME/Library/Application Support/DefaultCompany/sunbreak-unity"
  rm -f "$pd1"/build_*.png "$pd2"/build_*.png
  echo "[smoke] pass 2: graphics render + build screenshot ..."
  # NOT -batchmode so a real GPU/window renders (batchmode players use a null device → no shot).
  "$appbin" -logFile "$glog" -sunbreakshot >/dev/null 2>&1 &
  local gpid=$! j=0
  while [ "$j" -lt 60 ]; do
    if ! kill -0 "$gpid" 2>/dev/null; then break; fi
    sleep 1; j=$((j + 1))
  done
  if kill -0 "$gpid" 2>/dev/null; then kill "$gpid" 2>/dev/null; sleep 1; kill -9 "$gpid" 2>/dev/null; fi
  mkdir -p "$LOGDIR/shots"
  local got=0 f pd
  for pd in "$pd1" "$pd2"; do
    for f in build_shot.png build_shot2.png build_shot3.png build_boat.png build_heli.png build_plane.png build_service.png build_pause.png build_settings.png build_chase.png; do
      if [ -f "$pd/$f" ]; then cp "$pd/$f" "$LOGDIR/shots/$f"; got=1; fi
    done
  done
  if [ "$got" -eq 1 ]; then
    echo "[smoke] build screenshots -> $LOGDIR/shots/build_shot*.png (inspect grip + textured chars)"
  else
    echo "[smoke] note: no build screenshot produced (no display / headless GPU) — render scan from log only"
  fi
  # High-confidence render/asset failures (exclude benign mono/gfx-device noise).
  local render='Shader .* (not found|not supported)|couldn.t open shader|[Ff]ailed to load .*(texture|material|shader|asset)|MissingReferenceException|NullReferenceException|Material .* is null'
  local rhits; rhits=$(grep -nE "$render" "$glog" 2>/dev/null | grep -viE 'Fallback handler|Mono config|Gfx' )
  if [ -n "$rhits" ]; then
    echo "[smoke] FAIL: render/asset signatures in $glog:"; echo "$rhits" | head -n 20; return 1
  fi

  echo "[smoke] PASS: launched clean + no crash/asset/anim/render signatures (pass 1 headless + pass 2 graphics)."
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
