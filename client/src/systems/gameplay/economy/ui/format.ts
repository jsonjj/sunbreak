// Tiny display helpers for the economy UI.

/** "$1,250" — rounded, grouped, no cents (game currency is whole units). */
export const money = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

/** Compact form for tight HUD chips: "$1.3k", "$2.4M". */
export const moneyShort = (n: number): string => {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${v}`;
};
