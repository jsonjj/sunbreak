// Diegetic phone: slide-up frame (status bar, home grid, back), focus-trapped, driven by the
// store (open/app). GTA-style "live" phone — it does NOT pause the world. Routes to Contacts /
// Messages / Maps / Wallet; parody apps are shown as locked placeholders (later content).
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useUxStore } from "../state/uiStore";
import { FocusScope } from "../kit/FocusScope";
import { Icon, type IconName } from "../kit/Icon";
import { cx } from "../kit/cx";
import { personaById } from "./personas";
import { Contacts } from "./apps/Contacts";
import { Messages } from "./apps/Messages";
import { Maps } from "./apps/Maps";
import { Wallet } from "./apps/Wallet";
import s from "./phone.module.css";

interface AppDef {
  id: string;
  label: string;
  icon: IconName;
  accent: string;
  locked?: boolean;
}

const APPS: AppDef[] = [
  { id: "contacts", label: "Contacts", icon: "phone", accent: "var(--ux-accent)" },
  { id: "messages", label: "Messages", icon: "message", accent: "var(--ux-accent-rose)" },
  { id: "maps", label: "Maps", icon: "map", accent: "var(--ux-info)" },
  { id: "wallet", label: "Wallet", icon: "wallet", accent: "var(--ux-cash)" },
  { id: "squawk", label: "Squawk", icon: "signal", accent: "var(--ux-accent-2)", locked: true },
  { id: "loop", label: "Loop", icon: "target", accent: "var(--ux-accent-indigo)", locked: true },
  { id: "bagchain", label: "BagChain", icon: "cash", accent: "var(--ux-heat-3)", locked: true },
  { id: "prism", label: "Prism", icon: "search", accent: "var(--ux-heat-5)", locked: true },
];

export function Phone() {
  const open = useUxStore((st) => st.phone.open);
  const app = useUxStore((st) => st.phone.app);
  const setPhoneApp = useUxStore((st) => st.setPhoneApp);
  const closePhone = useUxStore((st) => st.closePhone);
  const reduce = useReducedMotion();

  const [activeContact, setActiveContact] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const goBack = () => {
    if (app === "messages") setPhoneApp("contacts");
    else if (app) setPhoneApp(null);
    else closePhone();
  };

  const openApp = (def: AppDef) => {
    if (def.locked) return;
    if (def.id === "messages") setPhoneApp("contacts");
    else setPhoneApp(def.id);
  };

  const title =
    app === "messages" && activeContact
      ? (personaById(activeContact)?.name ?? "Messages")
      : app
        ? (APPS.find((a) => a.id === app)?.label ?? "")
        : "SUN-LINK";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`${s.phoneWrap} ux-interactive`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <motion.div
            initial={{ y: reduce ? 0 : "110%", opacity: reduce ? 0 : 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: reduce ? 0 : "110%", opacity: reduce ? 0 : 1 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={s.phoneShadow}
          >
            <FocusScope onEscape={closePhone} className={s.phone}>
              {/* status bar */}
              <div className={s.statusBar}>
                <span className={s.carrier}>SUN-LINK</span>
                <span className={s.clock}>{time}</span>
                <span className={s.statusIcons}>
                  <Icon name="signal" size={13} />
                  <Icon name="battery" size={13} />
                </span>
              </div>

              {/* header */}
              <div className={s.header}>
                <button className={s.headerBtn} onClick={goBack} aria-label="Back">
                  <Icon name={app ? "back" : "close"} size={18} />
                </button>
                <span className={s.headerTitle}>{title}</span>
                <button className={s.headerBtn} onClick={closePhone} aria-label="Close phone">
                  <Icon name="close" size={18} />
                </button>
              </div>

              {/* body */}
              <div className={s.body}>
                {app == null && (
                  <div className={s.home}>
                    <div className={s.homeGreeting}>
                      <span className={s.homeTime}>{time}</span>
                      <span className={s.homeDate}>
                        {now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className={s.grid}>
                      {APPS.map((a) => (
                        <button
                          key={a.id}
                          className={cx(s.appTile, a.locked && s.appLocked)}
                          onClick={() => openApp(a)}
                          disabled={a.locked}
                          aria-label={a.label}
                        >
                          <span className={s.appIcon} style={{ background: a.accent }}>
                            <Icon name={a.locked ? "shield" : a.icon} size={20} />
                          </span>
                          <span className={s.appLabel}>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {app === "contacts" && (
                  <Contacts
                    onOpen={(id) => {
                      setActiveContact(id);
                      setPhoneApp("messages");
                    }}
                  />
                )}
                {app === "messages" &&
                  (activeContact ? (
                    <Messages npcId={activeContact} />
                  ) : (
                    <Contacts
                      onOpen={(id) => {
                        setActiveContact(id);
                        setPhoneApp("messages");
                      }}
                    />
                  ))}
                {app === "maps" && <Maps />}
                {app === "wallet" && <Wallet />}
              </div>

              <div className={s.homeBar} aria-hidden />
            </FocusScope>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
