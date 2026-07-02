import { World } from "miniplex";
import createReactAPI from "miniplex-react";
import type { ClientEntity } from "./clientEntity";

/** The single client-side ECS world. Systems mutate components imperatively every frame;
 *  React only ever handles entity mount/unmount (via <ECS.Entities>). */
export const world = new World<ClientEntity>();

/** React bindings for reactive add/remove rendering (used by rendering subsystems). */
export const ECS = createReactAPI(world);
