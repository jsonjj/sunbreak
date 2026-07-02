// AI-NPC chat thread. Streams token-by-token via npcClient (server SSE or canned fallback),
// shows a typing indicator, and persists history in threadStore. Long threads scroll; the
// input sends on Enter.
import { useEffect, useRef, useState } from "react";
import { personaById } from "../personas";
import { streamNpc } from "../npcClient";
import { useThreads, nextMsgId, type ThreadMessage } from "../threadStore";
import { Avatar } from "../Avatar";
import { Icon } from "../../kit/Icon";
import { cx } from "../../kit/cx";
import s from "../phone.module.css";

const EMPTY: ThreadMessage[] = [];

export function Messages({ npcId }: { npcId: string }) {
  const persona = personaById(npcId);
  const messages = useThreads((st) => st.threads[npcId] ?? EMPTY);
  const add = useThreads((st) => st.add);
  const appendDelta = useThreads((st) => st.appendDelta);
  const finalize = useThreads((st) => st.finalize);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!persona) return <div className={s.appEmpty}>Unknown contact.</div>;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    add(npcId, { id: nextMsgId(), role: "user", content: text });
    const replyId = nextMsgId();
    add(npcId, { id: replyId, role: "assistant", content: "", pending: true });
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    const history = (useThreads.getState().threads[npcId] ?? [])
      .filter((m) => m.id !== replyId)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      for await (const delta of streamNpc(npcId, history, ac.signal)) {
        appendDelta(npcId, replyId, delta);
      }
    } catch {
      appendDelta(npcId, replyId, "…(signal dropped)");
    } finally {
      finalize(npcId, replyId);
      setBusy(false);
    }
  };

  return (
    <div className={s.chat}>
      <div className={s.chatScroll} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={s.chatIntro}>
            <Avatar persona={persona} size={56} />
            <div className={s.chatIntroName}>{persona.name}</div>
            <div className={s.chatIntroRole}>{persona.role}</div>
            <p className={s.chatIntroBlurb}>{persona.blurb}</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.role === "user";
          const typing = m.pending && m.content.length === 0;
          return (
            <div key={m.id} className={cx(s.bubbleRow, mine ? s.mine : s.theirs)}>
              {!mine && <Avatar persona={persona} size={26} />}
              <div className={cx(s.bubble, mine ? s.bubbleMine : s.bubbleTheirs)}>
                {typing ? (
                  <span className={s.typing} aria-label="typing">
                    <i /> <i /> <i />
                  </span>
                ) : (
                  m.content
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className={s.composerInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${persona.name}…`}
          aria-label={`Message ${persona.name}`}
          maxLength={280}
        />
        <button
          className={s.composerSend}
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label="Send"
        >
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
