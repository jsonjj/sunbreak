// Aggregated raw activity content. Kept as plain typed data (authoring is compile-checked) and
// re-validated at load by parseActivityDefs (zod) — the data-driven authoring seam.

import { races } from "./races";
import { rampages } from "./rampages";
import { deliveries } from "./deliveries";

/** All authored activities, as raw defs (validated in the manager before use). */
export const rawActivityDefs: readonly unknown[] = [...races, ...rampages, ...deliveries];
