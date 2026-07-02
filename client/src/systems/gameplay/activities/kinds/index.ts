// Kind controller registry. To add a new activity family: implement a KindController and register
// it here (and extend ActivityDef + schema). The runtime looks controllers up by def.kind.

import type { ActivityKind } from "../types";
import type { KindController } from "../runtime/types";
import { raceController } from "./race";
import { rampageController } from "./rampage";
import { deliveryController } from "./delivery";

export const kindControllers: Record<ActivityKind, KindController> = {
  race: raceController,
  rampage: rampageController,
  delivery: deliveryController,
};
