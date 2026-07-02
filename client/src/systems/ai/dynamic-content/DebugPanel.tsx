// ─────────────────────────────────────────────────────────────────────────────
// DynamicContentDebugPanel — a self-contained dev overlay (NOT auto-mounted)
// ─────────────────────────────────────────────────────────────────────────────
// Lists loaded counts per type, live active-bark count, runtime status, and lets
// you sample the pools. Styled inline (no global CSS touched) with SUNBREAK's warm
// sunset accent over a low-chroma glass surface. The integrator mounts this in the
// debug-tools overlay (e.g. behind `?debug`); this subsystem never hand-mounts it.

import { useState, type CSSProperties, type ReactElement } from "react";
import {
  BRAND_LABELS,
  DISTRICTS,
  DISTRICT_LABELS,
  FACTION_LABELS,
  MOODS,
  STATIONS,
  STATION_GENRE,
  type District,
  type Mood,
  type Station,
} from "./canon";
import type { Bark, Mission, RadioAd } from "./contract/schemas";
import { authoredContent } from "./packs";
import { clearAll, writeBundle } from "./cache";
import { fetchContentPacks, fetchStatus } from "./content-client";
import { useContentStore, type BarkContext } from "./contentStore";
import { useContentStatus } from "./useDynamicContent";

const ACCENT = "linear-gradient(90deg, #ffb06a 0%, #ff6f91 100%)";

const dotStyle = (on: boolean): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background: on ? "#3ddc84" : "#6b7280",
  boxShadow: on ? "0 0 8px rgba(61,220,132,0.8)" : "none",
  flex: "0 0 auto",
});

const styles = {
  root: {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 40,
    width: 320,
    maxWidth: "calc(100vw - 32px)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#e8ecf2",
    background: "rgba(13, 16, 22, 0.74)",
    backdropFilter: "blur(14px) saturate(1.1)",
    WebkitBackdropFilter: "blur(14px) saturate(1.1)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 14,
    boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
    overflow: "hidden",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "11px 13px",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  title: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, letterSpacing: 0.2 },
  badge: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    padding: "2px 7px",
    borderRadius: 999,
    color: "#1a1205",
    backgroundImage: ACCENT,
  },
  body: { padding: 13, display: "grid", gap: 12 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  stat: {
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: "8px 10px",
  },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.62 },
  statValue: { fontSize: 18, fontWeight: 650, fontVariantNumeric: "tabular-nums" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  section: { display: "grid", gap: 7 },
  sectionTitle: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    opacity: 0.55,
    fontWeight: 700,
  },
  controls: { display: "flex", gap: 6, flexWrap: "wrap" },
  select: {
    flex: "1 1 auto",
    minWidth: 0,
    background: "rgba(255,255,255,0.05)",
    color: "#e8ecf2",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "5px 7px",
    fontSize: 12,
  },
  btn: {
    appearance: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8ecf2",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  sample: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: "9px 11px",
    minHeight: 34,
  },
  muted: { opacity: 0.6 },
  quote: { fontStyle: "italic" },
  speaker: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    opacity: 0.7,
    marginTop: 3,
  },
  value: { fontVariantNumeric: "tabular-nums", fontWeight: 650 },
  statusValue: { display: "flex", alignItems: "center", gap: 6 },
  option: { color: "#111" },
  btnPrimary: {
    border: "none",
    color: "#1a1205",
    backgroundImage: ACCENT,
    fontWeight: 700,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;

/** Map a preview mood to the world context that derives it (see deriveMood). */
function moodContext(mood: Mood): Partial<BarkContext> {
  switch (mood) {
    case "storm":
      return { weather: "storm", wanted: 0, timeOfDay: "day" };
    case "tense":
      return { weather: "clear", wanted: 3, timeOfDay: "day" };
    case "festive":
      return { weather: "clear", wanted: 0, timeOfDay: "night" };
    default:
      return { weather: "clear", wanted: 0, timeOfDay: "day" };
  }
}

export interface DebugPanelProps {
  defaultOpen?: boolean;
}

export function DynamicContentDebugPanel({ defaultOpen = true }: DebugPanelProps): ReactElement {
  const { ready, source, counts, activeBarks, runtimeEnabled, hasKey } = useContentStatus();
  const [open, setOpen] = useState(defaultOpen);
  const [district, setDistrict] = useState<District>("downtown");
  const [mood, setMood] = useState<Mood>("calm");
  const [station, setStation] = useState<Station>("wave_101");
  const [bark, setBark] = useState<Bark | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [ad, setAd] = useState<RadioAd | null>(null);
  const [busy, setBusy] = useState(false);

  const rollBark = () =>
    setBark(useContentStore.getState().getBark({ district, ...moodContext(mood) }));
  const rollMission = () => setMission(useContentStore.getState().getMission({ district }));
  const rollAd = () => setAd(useContentStore.getState().getRadioAd(station));

  async function refresh(): Promise<void> {
    setBusy(true);
    try {
      const [status, packs] = await Promise.all([fetchStatus(), fetchContentPacks()]);
      if (status) useContentStore.getState().setStatus(status);
      if (packs) {
        useContentStore.getState().mergeContent(packs, "server");
        const s = useContentStore.getState();
        writeBundle({
          barks: s.barks,
          radioAds: s.radioAds,
          missions: s.missions,
          sidequests: s.sidequests,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function clearCache(): void {
    clearAll();
    useContentStore.getState().setContent(authoredContent, "bundled");
    setBark(null);
    setMission(null);
    setAd(null);
  }

  return (
    <div style={styles.root}>
      <div style={styles.header} onClick={() => setOpen((o) => !o)}>
        <span style={styles.title}>
          <span style={dotStyle(ready)} />
          AI Dynamic Content
        </span>
        <span style={styles.badge}>{source}</span>
      </div>

      {open && (
        <div style={styles.body}>
          <div style={styles.grid}>
            <Stat label="Bark lines" value={counts.barks} />
            <Stat label="Radio ads" value={counts.radioAds} />
            <Stat label="Missions" value={counts.missions} />
            <Stat label="Side-quests" value={counts.sidequests} />
          </div>

          <div style={styles.row}>
            <span style={styles.muted}>Active barks</span>
            <span style={styles.value}>{activeBarks}</span>
          </div>

          <div style={styles.row}>
            <span style={styles.muted}>Runtime generation</span>
            <span style={styles.statusValue}>
              <span style={dotStyle(runtimeEnabled)} />
              {runtimeEnabled ? "on" : "off"} · key {hasKey ? "yes" : "no"}
            </span>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionTitle}>Preview a bark</span>
            <div style={styles.controls}>
              <select
                style={styles.select}
                value={district}
                onChange={(e) => setDistrict(e.target.value as District)}
              >
                {DISTRICTS.values.map((d) => (
                  <option key={d} value={d} style={styles.option}>
                    {DISTRICT_LABELS[d]}
                  </option>
                ))}
              </select>
              <select
                style={styles.select}
                value={mood}
                onChange={(e) => setMood(e.target.value as Mood)}
              >
                {MOODS.values.map((m) => (
                  <option key={m} value={m} style={styles.option}>
                    {m}
                  </option>
                ))}
              </select>
              <button style={styles.btnPrimary} onClick={rollBark}>
                Roll
              </button>
            </div>
            <div style={styles.sample}>
              {bark ? (
                <>
                  <div style={styles.quote}>&ldquo;{bark.text}&rdquo;</div>
                  <div style={styles.speaker}>— {bark.speaker}</div>
                </>
              ) : (
                <span style={styles.muted}>Roll to sample a line.</span>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionTitle}>Preview a contract</span>
            <button style={styles.btn} onClick={rollMission}>
              Roll mission in {DISTRICT_LABELS[district]}
            </button>
            <div style={styles.sample}>
              {mission ? (
                <>
                  <div style={{ fontWeight: 650 }}>{mission.title}</div>
                  <div style={styles.speaker}>
                    {mission.type.replace(/_/g, " ")} · {mission.giver.name} (
                    {FACTION_LABELS[mission.giver.faction]}) · ${mission.reward.cash}
                  </div>
                </>
              ) : (
                <span style={styles.muted}>Roll to sample a mission.</span>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionTitle}>Preview an ad</span>
            <div style={styles.controls}>
              <select
                style={styles.select}
                value={station}
                onChange={(e) => setStation(e.target.value as Station)}
              >
                {STATIONS.values.map((st) => (
                  <option key={st} value={st} style={styles.option}>
                    {st} ({STATION_GENRE[st]})
                  </option>
                ))}
              </select>
              <button style={styles.btn} onClick={rollAd}>
                Roll
              </button>
            </div>
            <div style={styles.sample}>
              {ad ? (
                <>
                  <div style={{ fontWeight: 650 }}>{BRAND_LABELS[ad.brand]}</div>
                  <div style={styles.quote}>{ad.tagline}</div>
                  <div style={styles.speaker}>{ad.lengthSeconds}s spot</div>
                </>
              ) : (
                <span style={styles.muted}>Roll to sample ad copy.</span>
              )}
            </div>
          </div>

          <div style={styles.controls}>
            <button style={{ ...styles.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={refresh}>
              {busy ? "Refreshing…" : "Refresh from server"}
            </button>
            <button style={styles.btn} onClick={clearCache}>
              Clear cache
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

export default DynamicContentDebugPanel;
