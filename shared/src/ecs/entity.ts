import type { SimComponents } from "./components";

/**
 * An entity is a partial bag of sim components. Client extends this with view components
 * (see `ClientEntity`). To add fields, AUGMENT `SimComponents` from your own subsystem file
 * (declaration merging) — never edit this type. See the augmentation contract in
 * `./components.ts`. Because this is `Partial<SimComponents>`, every augmented field flows in
 * here automatically.
 */
export type SimEntity = Partial<SimComponents>;
