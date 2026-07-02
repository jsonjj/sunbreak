// ECS entity inspector — a DOM list of miniplex entities with a component viewer for the
// selected one. Snapshots at ~3Hz (writes via React state, not per-frame) and never touches the
// R3F tree. Selecting an entity mirrors the choice into the `dbg_selected` ECS tag so in-canvas
// code (e.g. an Outline effect) can highlight it too.

import { useEffect, useState } from "react";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { cheats } from "../cheats/cheats";
import { useDebugStore } from "../store/debugStore";
import { panelStyle, headerStyle, buttonStyle, inputStyle, C, MONO } from "./ui";

const VIEW_KEYS = new Set(["three", "rigidBody", "mixer", "interpolation"]);
const MAX_ROWS = 400;

function labelFor(e: ClientEntity): string {
  if (e.dbg_label) return e.dbg_label;
  if (e.isPlayer) return "player";
  if (e.isVehicle) return "vehicle";
  if (e.isPed) return "ped";
  if (e.isProp) return "prop";
  const first = Object.keys(e)[0];
  return first ?? "entity";
}

function serialize(e: ClientEntity): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(e)) {
    if (VIEW_KEYS.has(key)) {
      out[key] = "«view ref»";
      continue;
    }
    const v = (e as Record<string, unknown>)[key];
    if (typeof v === "function") continue;
    out[key] = v;
  }
  try {
    return JSON.stringify(out, null, 2);
  } catch {
    return "«unserializable»";
  }
}

function selectEntity(id: number | null): void {
  for (const prev of [...world.with("dbg_selected").entities]) {
    world.removeComponent(prev, "dbg_selected");
  }
  useDebugStore.getState().select(id);
  if (id != null) {
    const e = world.entity(id);
    if (e) world.addComponent(e, "dbg_selected", true);
  }
}

export function EntityInspector() {
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState("");
  const selected = useDebugStore((s) => s.selected);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => window.clearInterval(timer);
  }, []);

  const all = world.entities;
  const needle = filter.trim().toLowerCase();
  const rows = all
    .map((e) => ({ e, id: world.id(e) ?? -1, label: labelFor(e) }))
    .filter((r) => !needle || r.label.toLowerCase().includes(needle) || String(r.id).includes(needle))
    .slice(0, MAX_ROWS);

  const selEntity = selected != null ? world.entity(selected) : undefined;

  return (
    <div
      style={{
        ...panelStyle,
        top: 12,
        left: 12,
        width: 340,
        maxHeight: "78vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={headerStyle}>
        <span>ECS Inspector · {all.length}</span>
        <button style={buttonStyle} onClick={() => useDebugStore.getState().toggle("inspector")}>
          ✕
        </button>
      </div>

      <div style={{ padding: 8 }}>
        <input
          style={inputStyle}
          placeholder="filter by label or id…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
        />
      </div>

      <div style={{ overflowY: "auto", flex: "1 1 auto", padding: "0 6px" }}>
        {rows.map((r) => {
          const active = r.id === selected;
          return (
            <div
              key={r.id}
              onClick={() => selectEntity(active ? null : r.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "3px 8px",
                borderRadius: 5,
                cursor: "pointer",
                color: active ? "#fff" : C.text,
                background: active ? C.accent : "transparent",
              }}
            >
              <span style={{ color: active ? "#fff" : C.dim }}>#{r.id}</span>
              <span style={{ flex: 1, textAlign: "left", marginLeft: 8 }}>{r.label}</span>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 8, color: C.dim }}>no entities</div>}
      </div>

      {selEntity && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {selEntity.transform && (
              <button
                style={buttonStyle}
                onClick={() => selEntity.transform && cheats.teleportTo(selEntity.transform.position)}
              >
                tp player here
              </button>
            )}
            {selEntity.isPlayer && (
              <button style={buttonStyle} onClick={() => cheats.setGod()}>
                toggle god
              </button>
            )}
            {selEntity.dbg_spawned && (
              <button
                style={buttonStyle}
                onClick={() => {
                  world.remove(selEntity);
                  selectEntity(null);
                }}
              >
                delete
              </button>
            )}
          </div>
          <pre
            style={{
              margin: 0,
              maxHeight: 200,
              overflow: "auto",
              fontFamily: MONO,
              fontSize: 11,
              color: C.text,
              background: "rgba(0,0,0,0.35)",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {serialize(selEntity)}
          </pre>
        </div>
      )}
    </div>
  );
}
