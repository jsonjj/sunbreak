import type { SimComponents } from "./components";

/** An entity is a partial bag of sim components. Client extends this with view components. */
export type SimEntity = Partial<SimComponents>;
