// PBR barrel. `loadPbrSet` is the spec-facing name for the synchronous placeholder builder;
// `upgradeToRealMaps` performs the async CC0 swap.
export { buildPlaceholderMaps, upgradeToRealMaps } from "./loadPbrSet";
export { buildPlaceholderMaps as loadPbrSet } from "./loadPbrSet";
export { materialDefs, resolveDef, DEFAULT_DEF_ID } from "./materialDefs";
export type { MaterialDefId } from "./materialDefs";
