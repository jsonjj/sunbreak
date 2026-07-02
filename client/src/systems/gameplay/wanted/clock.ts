// One shared monotonic sim clock (seconds) so perception timestamps, FSM ticks, cooldown
// timers and spawn stagger all agree. `performance.now()` is monotonic and pause-agnostic,
// which is fine for v2; a v4 server would swap this for the authoritative room clock.
export const now = (): number => performance.now() / 1000;
