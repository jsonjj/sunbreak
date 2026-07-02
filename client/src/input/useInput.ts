import { input } from "./InputManager";

/** Non-reactive accessor for useFrame consumers. Read `input.snapshot` or live getters. */
export function useInput() {
  return input;
}
