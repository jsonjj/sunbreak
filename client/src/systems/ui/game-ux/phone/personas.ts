// Client-side contact registry for the phone. IP-safe original cast per the character bible /
// game-ux canon (no Rockstar terms). The server owns real persona system-prompts (v3); this is
// the display + canned-fallback layer so the phone works with no backend / no OpenAI key.
export interface Persona {
  id: string;
  name: string;
  role: string;
  blurb: string;
  initials: string;
  color: string; // avatar accent (references a token or literal)
  /** story/character gate: locked contacts show but can't open a thread yet. */
  locked?: boolean;
  /** offline canned replies (rotated) when there's no server/key. */
  canned: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "cami",
    name: "Cami",
    role: "Field Medic",
    blurb: "Keeps you breathing. Bills you later.",
    initials: "CA",
    color: "var(--ux-accent-rose)",
    canned: [
      "You still bleeding? Pin a location, I'll roll the van.",
      "Stay off the strip 'til the HEAT cools. I've got a kit ready.",
      "Checkout's paid. Don't make me stitch you twice tonight.",
    ],
  },
  {
    id: "mac",
    name: "Mac",
    role: "Partner",
    blurb: "Your other half on the job.",
    initials: "MC",
    color: "var(--ux-accent-2)",
    canned: [
      "Say when and I'm rolling. Same split as last time?",
      "Cops flooded the docks. We hit the back route.",
      "Grab the car. I'll grab the noise.",
    ],
  },
  {
    id: "tomas",
    name: "Tomás",
    role: "Fixer",
    blurb: "Every Score starts with a call to Tomás.",
    initials: "TO",
    color: "var(--ux-accent)",
    canned: [
      "Got a Score with your name on it. Clean pay, tight window.",
      "Meet the marker on your map. Don't be late, don't be loud.",
      "Money's good if you're quiet. Louder pays worse.",
    ],
  },
  {
    id: "sparks",
    name: "Sparks",
    role: "Wrench & Wires",
    blurb: "Cars, doors, cameras — all persuadable.",
    initials: "SP",
    color: "var(--ux-accent-indigo)",
    canned: [
      "Drop the plate number, I'll ghost it in ten.",
      "That garage door? Already open in my head.",
      "Bring the car in warm, I'll make it sing.",
    ],
  },
  {
    id: "yaya",
    name: "Yaya",
    role: "Street Oracle",
    blurb: "Knows who's up, who's out, who's talking.",
    initials: "YA",
    color: "var(--ux-cash)",
    canned: [
      "Word is the north crew's short-handed. Opening for you.",
      "Somebody's asking about you. Keep your head low.",
      "Tip's free this once: check the pier at sundown.",
    ],
  },
  {
    id: "priya",
    name: "Priya",
    role: "Launderer",
    blurb: "Turns dirty into spendable — for a cut.",
    initials: "PR",
    color: "var(--ux-info)",
    canned: [
      "Dirty stacks? Run 'em through me, ten points off the top.",
      "Keep it under the ceiling and nobody sniffs it.",
      "Clean cash back by morning. As always.",
    ],
  },
  {
    id: "blayze",
    name: "Blayze",
    role: "Crew Lead",
    blurb: "Runs the strip's loudest faction.",
    initials: "BL",
    color: "var(--ux-heat-4)",
    locked: true,
    canned: ["Earn your rep first. Then we talk."],
  },
  {
    id: "kessler",
    name: "Det. Kessler",
    role: "Task Force",
    blurb: "You don't want this number saved.",
    initials: "KE",
    color: "var(--ux-heat-5)",
    locked: true,
    canned: ["We're watching. Smile."],
  },
];

export const personaById = (id: string): Persona | undefined =>
  PERSONAS.find((p) => p.id === id);

export function cannedReply(npcId: string, turn: number): string {
  const p = personaById(npcId);
  if (!p || p.canned.length === 0) return "…";
  return p.canned[turn % p.canned.length] ?? "…";
}
