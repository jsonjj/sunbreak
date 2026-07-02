// Dev console — a DOM overlay (sibling of the canvas) with command history, Tab autocomplete and
// scrollback. Toggled with the backtick key. Key events are stopped from propagating so typing
// never leaks into the game's input manager, and pointer lock is released while it is open.

import { useEffect, useRef, useState } from "react";
import { useDebugStore } from "../store/debugStore";
import { execute, commandNames } from "../console/commands";
import { panelStyle, headerStyle, inputStyle, buttonStyle, C, MONO } from "./ui";

const INTRO = "SUNBREAK debug console — type 'help' and press Enter.";

export function DevConsole() {
  const open = useDebugStore((s) => s.console);
  const [lines, setLines] = useState<string[]>([INTRO]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const hIndex = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  if (!open) return null;

  const submit = () => {
    const line = value.trim();
    setValue("");
    if (!line) return;
    history.current.push(line);
    hIndex.current = history.current.length;
    if (line === "clear") {
      setLines([]);
      return;
    }
    const out = execute(line);
    setLines((prev) => [...prev, `› ${line}`, ...(out ? out.split("\n") : [])]);
  };

  return (
    <div
      style={{
        ...panelStyle,
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        width: "min(760px, 92vw)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={headerStyle}>
        <span>Console · ` to toggle</span>
        <button style={buttonStyle} onClick={() => useDebugStore.getState().set({ console: false })}>
          ✕
        </button>
      </div>

      <div
        ref={logRef}
        style={{
          height: 220,
          overflowY: "auto",
          padding: "8px 10px",
          fontFamily: MONO,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith("›") ? C.accent : C.text }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ padding: 8, borderTop: `1px solid ${C.border}` }}>
        <input
          ref={inputRef}
          style={inputStyle}
          placeholder="command…  (help)"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              submit();
            } else if (e.key === "Escape" || e.code === "Backquote") {
              e.preventDefault();
              useDebugStore.getState().set({ console: false });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (history.current.length) {
                hIndex.current = Math.max(0, hIndex.current - 1);
                setValue(history.current[hIndex.current] ?? "");
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (hIndex.current < history.current.length - 1) {
                hIndex.current += 1;
                setValue(history.current[hIndex.current] ?? "");
              } else {
                hIndex.current = history.current.length;
                setValue("");
              }
            } else if (e.key === "Tab") {
              e.preventDefault();
              const parts = value.split(/\s+/);
              if (parts.length <= 1) {
                const prefix = parts[0] ?? "";
                const match = commandNames().find((n) => n.startsWith(prefix));
                if (match) setValue(match + " ");
              }
            }
          }}
        />
      </div>
    </div>
  );
}
