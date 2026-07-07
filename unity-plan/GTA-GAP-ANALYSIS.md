# SUNBREAK vs GTA V / GTA VI — Prioritized Gameplay Gap Analysis

> **Scope:** How the *SUNBREAK* Unity build ("Santa Vista") falls short of the GTA
> experience — **excluding budget and AAA art fidelity** (better models/textures/faces are
> explicitly out of scope; that is the known end-stage lever). This doc targets **achievable,
> free/indie-stack gaps** in gameplay, systems, world interactivity, AI, and UX, plus creative
> additions.
>
> **Method:** Read the current Unity C# (`Assets/SUNBREAK/Scripts/**`, incl. `World/Geography.cs`),
> the GTA research dossiers (`gta-dossier/research/gta5.md`, `gta6.md`), the Unity migration plan
> (`sunbreak/unity-plan/00-UNITY-MAC-PLAN.md`), and web-verified specific GTA mechanics (cited inline).
>
> **This is a read-only planning artifact.** No `Assets/` were touched; nothing was built.
>
> **Effort legend** (solo dev, leveraging the existing clean, data-driven codebase; the agent can
> author all C#/editor automation but cannot run the Editor — see migration plan §3):
> **S** ≈ 0.5–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks · **XL** ≈ 3+ weeks.

---

## 0. Where SUNBREAK stands today (verified inventory)

**Already implemented (and genuinely solid):**

- **World:** runtime-generated island, 7 districts, roads (64 m grid), ~1,400 buildings, 7 landmarks,
  water (marina + glades + sea), day-night cycle, POI map blips. (`CityGenerator`, `Geography`, `DayNightSystem`)
- **On-foot:** walk/run/crouch/jump, third-person orbit + **aim/ADS** + **first-person** toggle, Mixamo
  humanoid. (`PlayerController`, `PlayerCameraController`)
- **Combat:** 8-slot weapon wheel, hitscan/pellet/projectile/melee(fists), recoil, reload, visible
  weapons, ragdolls, car explosions. (`PlayerCombat`, `WeaponData`, `CarHealth`, `Ragdoll`)
- **Vehicles:** 5 **cars** (sedan/coupe/sports/SUV/police) on a tuned arcade raycast model; enter/exit
  any car; car radio; engine audio; headlights; damage→smoke→fire→wreck. (`ArcadeCarController`, `VehicleConfig`, `CarHealth`)
- **Peds/traffic:** pooled peds (wander/idle/flee/fight FSM, fear from threats), pooled kinematic
  traffic on the grid. (`Ped`, `PedManager`, `TrafficManager`, `TrafficCar`)
- **Wanted/police:** contact-driven 5-star wanted, cooldown/search (last-known-position), foot cops +
  cop cars (chase, cut off, ram, fire, deploy crew), per-star escalation. (`WantedSystem`, `Cop`, `CopCar`)
- **Systems:** 5-mission linear story, cash+bank economy, gun store / dealership / ATM, cash+weapon
  pickups, save/load (3 slots), minimap + full map + **A\* GPS route**, HUD, pause menu, main menu.

**The honest headline:** SUNBREAK already has the *skeleton* of a GTA sandbox. The gaps below are
mostly about **depth, consequence, and a living/interactive world** — not missing an engine.

---

## 1. Priority summary

| # | Item | Category | Effort |
|---|------|----------|--------|
| **P0.1** | Wasted/Busted flow + death & arrest consequences | Wanted/UX | **S** |
| **P0.2** | Health & armor economy (regen + pickups + heal services) | Combat/Economy | **S–M** |
| **P0.3** | Mission robustness (checkpoints, retry, fail/abort, intro/outro) | Missions | **M** |
| **P0.4** | Activate the label-only world services (hospital/respray/safehouse/fuel) | World interactivity | **M** |
| **P0.5** | Settings/Options menu + pause polish (sensitivity, volume, FOV, quit-to-desktop) | UX/Accessibility | **S–M** |
| **P0.6** | Onboarding / first-run tutorial | Tutorial | **S** |
| **P1.1** | Vehicle breadth — boats + bikes (+ optional heli), using the island | Vehicles | **L** |
| **P1.2** | Wanted/police depth — helicopter, roadblocks, spike strips, SWAT tier, escape tool | Police | **M–L** |
| **P1.3** | Ped & traffic AI depth — witnesses call police, react to gun/driving, carjackable traffic, lights | AI | **M–L** |
| **P1.4** | Vehicle systems — garages, persistent/owned vehicles, customization, fuel | Vehicles | **L** |
| **P1.5** | Side content & activities — repeatable jobs, races, rampages, collectibles | World/Missions | **M–L** |
| **P1.6** | Economy & progression — make rep matter, property income, more shops | Economy | **M** |
| **P1.7** | Radio & audio depth — multiple stations, station select, ambient world audio | Audio | **M** |
| **P1.8** | Combat feel — melee weapons, takedowns, cover, soft-lock, hit feedback | Combat | **M–L** |
| **P2.1** | Weather system + gameplay effects (rain/storm, grip/visibility) | Weather | **M** |
| **P2.2** | Phone / meta menu (jobs, request vehicle, photo mode, social parody) | UX | **M–L** |
| **P2.3** | Character systems — wardrobe customization + Cami/Mac protagonist switching | Character | **M–L** |
| **P2.4** | Ambient wildlife & city life (birds, dogs, marina fish, crowds) | World | **S–M** |
| **P2.5** | Stealth systems (crouch stealth, detection, silencers, hide) | Stealth | **M** |
| **P2.6** | Day-night *gameplay* effects (shops close, night crime, density shifts) | Simulation | **S–M** |
| **P2.7** | 100% completion, collectible mystery, easter eggs | Meta | **S–M** |
| **P2.8** | Random dynamic street events | World | **M** |
| **P2.9** | Minimap/GPS/HUD polish (blip icons, street names, mission radii) | UX | **S–M** |
| **P2.10** | Deepened accessibility (remap, colorblind, subtitles, aim-assist toggle) | Accessibility | **M** |

---

# P0 — Core-loop completeness (do first)

These are the gaps that make SUNBREAK feel *unfinished as a GTA-like*, and every one is cheap
relative to impact.

## P0.1 — Wasted / Busted flow + consequences

- **What GTA does:** Losing all health = **"Wasted"** → respawn at the nearest hospital minus a fee
  (5% of cash, capped at $5,000) but you **keep your weapons**. Getting caught by police = **"Busted"**
  → arrested, wanted cleared, and you **lose weapons/armor**. ([GTA V Game Help](https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/9dfeb637-1cb0-46c8-b7d7-0c58cf990494/en-GB/index.html); ["What is wasted in GTA?"](https://www.vintageisthenewold.com/faq/what-is-wasted-in-gta))
- **SUNBREAK has:** On death, `WorldBounds.OnPlayerDied()` silently teleports the player to spawn,
  **full-heals**, and clears wanted. There is **no death screen, no cost, and no arrest state at all** —
  cops only ever shoot to kill; you can never be "busted."
- **The gap:** Death is consequence-free and unannounced, so risk/tension collapses. There is no
  surrender/arrest path — a signature GTA beat is missing.
- **Achievable improvement:** Add a `WastedBusted` state machine: fade-to-black "WASTED"/"BUSTED"
  card (uGUI, like the existing toast), deduct a capped cash fee, respawn at the **nearest hospital
  POI** (coords already exist in `IslandSceneBuilder.BuildPointsOfInterest`), and clear wanted.
  Add "Busted" when cops are adjacent at low health and the player is stationary/unarmed (they already
  "deploy crew" — add an arrest check in `CopCar`/`Cop`). Optional: drop the current weapon on Busted.
- **Effort: S.**

## P0.2 — Health & armor economy

- **What GTA does:** Health regenerates to a threshold (~50%); full heal via medkits/food/drink; a
  separate **body-armor** bar absorbs damage; snacks carried from stores. (`gta5.md` §8.1)
- **SUNBREAK has:** A single `PlayerState.health` pool with `Heal()` that **nothing ever calls except
  respawn**. No regen, no medkits/food, no armor. Once hurt, your only "heal" is to die.
- **The gap:** Combat has no sustain loop — encounters trend toward an unwinnable death spiral, which
  makes the whole crime loop feel broken.
- **Achievable improvement:** (a) Regenerate health to ~40–50% when out of combat for a few seconds
  (add to `PlayerState.Update`). (b) Add `HealthPickup`/`ArmorPickup` (clone `CashPickup` — trivial)
  scattered by `IslandSceneBuilder`, plus vending-machine/food interactables (reuse `Interactable`).
  (c) Add an `armor` field to `PlayerState` consumed before health in `Damage()`, sold at a shop.
- **Effort: S–M.**

## P0.3 — Mission robustness (checkpoints, retry, fail, framing)

- **What GTA does:** ~69 story missions with **checkpoints, retry-on-fail, explicit fail conditions**,
  intro/outro beats, and **Gold/medal replay scoring**; heists are multi-stage with approach choice
  and crew selection. (`gta5.md` §7.4)
- **SUNBREAK has:** 5 linear missions (`MissionCatalog`) with 6 objective kinds. But `MissionSystem.Load`
  **abandons any in-progress mission** and there is **no fail state, no checkpoint, no retry, no abort,
  no scoring** — dying mid-mission just silently resets it with no feedback.
- **The gap:** Missions feel fragile and unframed; failure is invisible; there's no reason or way to replay.
- **Achievable improvement:** Add to `MissionDef`/`MissionSystem`: per-stage **checkpoints**
  (restore `_stageIndex` + re-run `onEnter`), **explicit fail** (e.g. protected NPC dies, timer
  expires, escort vehicle destroyed) with a "MISSION FAILED — Retry / Abort" panel, an **abort**
  option, and a mission **intro card + outro summary** (reuse `GameHUD.Post`). Add a lightweight
  medal (time/accuracy/no-death) to enable replay. This unlocks everything in P1.5.
- **Effort: M.**

## P0.4 — Activate the label-only world services (biggest "living world" quick win)

- **What GTA does:** The map is dense with **usable** functional buildings — hospitals (respawn),
  Los Santos Customs (repair/respray/**lose wanted**/mod), safehouses (save/change outfit), fuel/convenience
  stores, Ammu-Nation, clothing, barbers, etc. ([Los Santos Customs](https://gta.fandom.com/wiki/Los_Santos_Customs); `gta5.md` §8.5–8.6)
- **SUNBREAK has:** Exactly **one** enterable/functional building — the gun store (`EnterableShop`).
  The POI list already places blips/labels for **Hospital, SVPD HQ, Fuel, Safehouse, Stadium, Mall,
  Pier** — but they are **cosmetic labels with no building, interior, or interaction** behind them.
- **The gap:** The world advertises services it doesn't deliver — the single most obvious "it's a
  demo" tell. Yet the `EnterableShop` template + `Interactable`/`Shop` system already exist to fix it.
- **Achievable improvement:** Make the existing POIs *do something*, mostly by reusing existing systems:
  - **Hospital** → heal-for-fee interactable + Wasted respawn point.
  - **Fuel / convenience** → cheap heal/repair + snack/armor buy (reuse `ShopMenu`).
  - **Respray / "Verano Customs"** → repair car + **lose wanted when out of police sight** (mirrors
    Pay 'n' Spray / LS Customs) — closes the wanted-escape loop (see P1.2). ([Pay 'n' Spray](https://gta.wiki/w/Pay_%27n%27_Spray))
  - **Safehouse** → save point + (later) wardrobe + garage access (see P1.4/P2.3).
  - Add 3–5 more `EnterableShop` interiors (clothing, barber stub, bar) using the same template.
- **Effort: M** (template + shop menu already exist; this is mostly wiring + a few interiors).

## P0.5 — Settings / Options menu + pause polish

- **What GTA does:** Full options — audio sliders, mouse/controller sensitivity + invert, brightness,
  FOV/camera, subtitles, key remap, plus **Quit to Desktop**. (Standard PC baseline.)
- **SUNBREAK has:** `PauseMenu` = Resume / Save (F1–F3) / **Quit to Main Menu** / static controls list.
  `MainMenu` = New/Load/Quit. There is **no settings screen at all** — no volume, no sensitivity, no FOV,
  no invert-Y, no quit-to-desktop from pause, no restart mission. `GameAudio` exposes `Music`/`Sfx`
  buses but nothing lets the player change them.
- **The gap:** Basic PC-game expectations are unmet; this reads as unfinished and is an accessibility floor.
- **Achievable improvement:** Add an **Options** panel (Pause + Main Menu) writing to `PlayerPrefs`:
  master/music/SFX volume (wire to `GameAudio`), mouse sensitivity + invert-Y (wire to
  `PlayerController.mouseSensitivity`/`PlayerCameraController`), FOV, brightness/gamma, and
  **Quit to Desktop** (`Application.Quit`). Add "Restart Mission" to pause when a mission is active.
- **Effort: S–M.**

## P0.6 — Onboarding / first-run tutorial

- **What GTA does:** Opening missions teach movement, driving, shooting, wanted, phone, shops via
  guided prompts; contextual hints surface mechanics gradually.
- **SUNBREAK has:** A single one-line control string (`Controls.OneLine`) at the top of the HUD and
  the pause list. No guided first steps, no contextual "press F to enter", no explanation of the
  weapon wheel, map, or wanted system.
- **The gap:** New players are dropped in with a wall of keybinds and no scaffolding.
- **Achievable improvement:** A lightweight scripted **first-run tutorial** reusing the existing
  mission/objective/prompt systems (`MissionSystem` + `GameHUD.Post` + `PlayerInteractor.Prompt`):
  "walk here → sprint → enter this car → drive to marker → open the map → buy a weapon." Add
  contextual just-in-time hints (first time near a car, first wanted star, etc.). Persist a
  "tutorial done" flag in save.
- **Effort: S.**

---

# P1 — Major depth (clear, high-value GTA gaps)

## P1.1 — Vehicle breadth: boats + bikes (+ optional helicopter)

- **What GTA does:** Cars, **motorcycles, bicycles, boats, jet skis, planes, helicopters**; GTA V
  rebuilt RAGE draw distance specifically to reintroduce fixed-wing aircraft. GTA VI trailers show
  boats, jet skis, planes/helis, bikes. (`gta5.md` §4.1; `gta6.md` §10)
- **SUNBREAK has:** **Cars only** (all five presets are cars) — on an **island with a modeled marina,
  glades, sea, and an airfield with a control tower + customs hangar that are currently decorative**.
  The migration plan even notes web `boat.ts`/`flight.ts` configs exist to port.
- **The gap:** The single biggest "world says more than it delivers" gap after P0.4: sea and airfield
  are unused. No two-wheelers, no air, no water traversal.
- **Achievable improvement (in value order):**
  - **Boats** — highest ROI given the island/marina. Port the web `boat.ts` buoyancy model the same
    way `ArcadeCarController` ported `presets.ts` (Rigidbody + buoyancy/keel-drag forces vs water
    plane; `Geography.IsWater` already exists). Add a boat spawn at the marina/pier.
  - **Motorbike** — reuse `ArcadeCarController` with a 2-wheel config + lean; adds fast street traversal.
  - **Helicopter (optional)** — port web `flight.ts` (Rigidbody `AddForce`/`AddTorque`); the airfield
    and `Geography.FLIGHT_CEILING` are already defined. Highest effort, high wow-factor.
  - Use free CC0 kits (Kenney/Quaternius) for meshes per the migration plan §2.
- **Effort: L** (Boats **M** alone; bikes **S–M**; heli **M–L**).

## P1.2 — Wanted/police depth: air, roadblocks, spikes, tiers, and an escape tool

- **What GTA does:** Escalation adds **roadblocks and spike strips at ~3★, a Police Maverick
  helicopter, NOOSE/SWAT TRU units at 4★, and military at 5★** (near Fort Zancudo); police search
  your **last-known position** and you can **lose wanted by breaking sight / using LS Customs**.
  ([GTA Wiki: Wanted Level in GTA V](https://gta.fandom.com/wiki/Wanted_Level_in_GTA_V))
- **SUNBREAK has:** A genuinely good contact-driven 5-star system with cooldown/search/LKP and
  per-star escalation — but escalation only scales **count/weapon/accuracy/health**. **No helicopter,
  no roadblocks, no spike strips, no SWAT/agency unit tier, and no active way to shed wanted** other
  than waiting out the cooldown or dying.
- **The gap:** High-star chases lack the set-piece variety and "pull out the stops" feel; and the
  loop is asymmetric (you can gain heat with no proactive tool to lose it).
- **Achievable improvement (extend `WantedSystem.Dispatch`):**
  - **Helicopter at 3★+:** a kinematic chopper that orbits/spotlights the player and drops the LKP
    marker (can reuse the P1.1 heli or a cheap flying spotlight).
  - **Roadblocks at 3★+:** spawn 2–3 cop cars + barriers across the road grid ahead of the player's
    heading (the grid math already exists in `TrafficCar`/`RoadGraph`).
  - **Spike strips:** a trigger volume that pops tires (reduce grip / force `ResetUpright`).
  - **SWAT/agency tier at 4–5★:** a distinct archetype in `CopEscalation` (heavier armor/health,
    smarter flanking) rather than just a bigger rifle.
  - **Escape tool:** the respray/LS-Customs from P0.4 clears wanted when out of sight; add a
    "hide in safehouse/garage" clear.
  - **UX:** draw cop **search cones / last-known-position** on the minimap (data already in `WantedSystem.Lkp`/`Searching`).
- **Effort: M–L.**

## P1.3 — Pedestrian & traffic AI depth

- **What GTA does:** Peds run FSMs that flee/fight, and a brave witness will **run to a phone and
  REPORT_CRIME**, which is *why the police come* — this transforms background peds into active
  simulation participants; peds have per-archetype **ambient dialogue pools**, react to a **drawn/aimed
  gun and reckless driving**, and civilians **drive and can be pulled from their cars**.
  ([GTA 3 AI breakdown](https://medium.com/@filtercutter/gta-3-ai-from-two-decades-ago-b3e1c7bd71d4); [GTA V ped dialogue](https://www.gamedeveloper.com/design/breaking-down-gta-v-s-pedestrian-dialogue-system-an-analysis-with-speculative-examples); GTA VI: persistent daily routines — `gta6.md` §8.2)
- **SUNBREAK has:** A solid ped FSM (wander/idle/flee/fight, fear from `ThreatBus`) but: **civilians
  never call police** (wanted is *contact-only* — you must physically hit someone), peds **don't react
  to a drawn/aimed gun or to reckless driving**, **traffic drivers are crude capsule+sphere dummies
  (not real peds), so traffic cars can't be carjacked with anyone inside**, there are **no traffic
  lights/stops**, **no groups/social ambient behavior**, and **no ambient dialogue/voice barks**.
- **The gap:** The city reacts to violence you personally commit but otherwise ignores you; it never
  feels like it's watching you. Traffic is scenery you can't meaningfully interact with beyond driving.
- **Achievable improvement:**
  - **Witness → wanted:** when a fearful ped sees a crime, have it flee to a "phone" state and, on
    arrival, call `WantedSystem` to raise heat (this makes non-contact crimes — brandishing near
    people, running them over — matter, closing a core GTA loop). Add line-of-sight gating.
  - **React to gun/driving:** peds panic when the player aims/fires nearby or drives at them
    (extend `ThreatBus` with a "brandish"/"vehicle-threat" signal; `PlayerCombat` already knows aim state).
  - **Carjackable traffic:** spawn real pooled `Ped` drivers in traffic cars so the player can pull
    them out (a jack animation + eject), and let scared drivers speed off.
  - **Traffic lights/stops** at grid intersections; **ambient barks** (a small VO/text pool per archetype).
  - **Groups:** occasionally spawn 2–3 peds walking together.
- **Effort: M–L** (witness-call + gun/driving reactions alone are **M** and very high impact).

## P1.4 — Vehicle systems: garages, ownership, customization, fuel

- **What GTA does:** Owned/persistent vehicles stored in **garages**, deep **customization** (paint,
  wheels, performance, armor) at LS Customs, and (in Online) fuel/repair economics. (`gta5.md` §8.5; [LS Customs](https://gta.fandom.com/wiki/Los_Santos_Customs))
- **SUNBREAK has:** The dealership `ShopMenu` just **spawns a car in front of you** — it isn't owned,
  saved, stored, or customizable. No garage, no persistence across sessions, no mods, no fuel,
  and damage is color-swap + destruction only (no deformation).
- **The gap:** Buying a car has no lasting meaning; there's no vehicle collection/progression.
- **Achievable improvement:** Add a `Garage` (safehouse-linked) storing owned vehicle records in
  `SaveData`; a "retrieve vehicle" spawn; a **customization** menu at the respray shop (color from
  the existing tint system, wheel swaps from CC0 kits, top-speed/engine tiers editing `VehicleConfig`
  clones); an optional **fuel** stat that drains and is refilled at fuel POIs. Deformation-lite
  (swap to a dented mesh / hide panels at damage thresholds) if cheap.
- **Effort: L.**

## P1.5 — Side content & repeatable activities

- **What GTA does:** ~58 Strangers & Freaks, ~60 random events, races, and dozens of activities
  (taxi, hunting, golf, base-jumping, etc.), plus collectibles. (`gta5.md` §8.6–8.7)
- **SUNBREAK has:** The 5 story missions and passive cash/weapon pickups — **nothing repeatable**,
  no side jobs, no races, no collectibles, no free-roam objectives once the story is done.
- **The gap:** After ~15 minutes of story there's no reason to stay in the sandbox.
- **Achievable improvement (all reuse the P0.3 mission framework + existing systems):**
  - **Repeatable jobs:** taxi/delivery (goto chains), **vigilante/bounty** (spawn+eliminate a target,
    reuse `MissionEnemy`), **rampage** (survive/eliminate waves), courier runs.
  - **Races / time-trials / checkpoint runs** on the road grid (reuse GPS `NavRoute` + waypoint beams).
  - **Stunt jumps** (trigger volumes granting cash, reuse `CashPickup`).
  - **Collectibles** scattered across districts with a counter (reuse `Blip`/pickup).
  - Surface these as map icons the player can start anytime.
- **Effort: M–L** (each activity is small once the framework exists).

## P1.6 — Economy & progression that matters

- **What GTA does:** Property/business ownership with **passive income**, dual **stock markets** tied
  to story/assassinations, and skills that improve with use. (`gta5.md` §8.4–8.5)
- **SUNBREAK has:** Cash + bank + 3 shops. Crucially, **rep (`MissionSystem.TotalRep`) is tracked and
  saved but does literally nothing** — no unlocks, levels, or gates. No property income, no stock
  market, no skills, and reserve ammo is infinite (no restock loop).
- **The gap:** Money is only spent on guns/cars; there's no long-term progression or wealth engine.
- **Achievable improvement:** (a) **Make rep matter** — gate weapon/vehicle/activity unlocks and stat
  perks behind rep tiers (data already flows in). (b) **Ownable properties/businesses** that pay
  passive income to `bank` over time (safehouse, the strip on the Neon Mile, etc.). (c) A simple
  **skill** system (shooting/driving/stamina improving with use, GTA-style) feeding `PlayerController`/
  `PlayerCombat` tuning. (d) Ammo as a purchasable resource for an Ammu-Nation loop.
- **Effort: M.**

## P1.7 — Radio & audio depth

- **What GTA does:** ~15+ **radio stations** across genres with DJs, ads, and **talk radio**, plus a
  dynamic original **score** that adapts to missions/free-roam. (`gta5.md` §10)
- **SUNBREAK has:** One car radio with a **single synth station + whatever CC0 mp3s** are dropped in
  `StreamingAssets/Radio`; you can only toggle/skip (no station select). No mission/score music, no
  DJ/ads/news, no station variety, and radio exists **only in cars**.
- **The gap:** Audio identity is thin; the world lacks the aural texture that sells GTA's "place."
- **Achievable improvement:** Group CC0 tracks (Pixabay/Kevin MacLeod per migration plan §2) into
  **multiple genre stations** with a **station-select** UI (extend `CarRadio` + HUD), add short
  station-ID/ad/news stingers, add a lightweight **dynamic music layer** for combat/chases/missions
  (swap `GameAudio` music bed by threat state), and richer **ambient world audio** (crowd murmur,
  distant sirens when wanted, seagulls at the coast).
- **Effort: M.**

## P1.8 — Combat & game feel: melee, takedowns, cover, feedback

- **What GTA does:** Melee weapons + brawling combos, a **cover system**, refined lock-break auto-aim,
  and weighty hit reactions (Euphoria). (`gta5.md` §3.4, §8.1)
- **SUNBREAK has:** Fists-only melee (no melee *weapons* for the player; NPCs get bats), **no cover
  system**, **no lock-on/soft-target**, no stealth/takedowns, and limited feedback (tracer/impact/muzzle
  VFX + ragdoll, but no hit-stop, no camera shake, no directional damage indicator).
- **The gap:** Gunplay is functional but "floaty"; there's no tactical positioning or melee identity.
- **Achievable improvement:** (a) **Melee weapons** (bat/knife) via the existing `WeaponData` melee
  path + `WeaponModelLibrary`. (b) A **cover** system (snap to nearby cover colliders, peek/blind-fire)
  — start simple. (c) **Soft-lock/aim-assist** toggle nudging aim to the nearest `IDamageable`.
  (d) **Feedback**: brief hit-stop, camera shake on explosions/heavy hits, a directional damage
  vignette, and hitmarkers. (e) Optional stealth **takedown** from behind (feeds P2.5).
- **Effort: M–L** (feedback polish is **S** and disproportionately improves feel).

---

# P2 — Nice-to-haves & creative additions

## P2.1 — Weather system + gameplay effects
- **GTA:** Dynamic weather; GTA VI leans into **storms that change physics/gameplay** (Florida setting → hurricanes, flooding). (`gta6.md` §8.2, §10)
- **SUNBREAK:** Day-night only — fog color shifts, but **no rain/storms/wind/puddles** and weather never affects play.
- **Improvement:** A weather state machine (clear→overcast→rain→storm) driving skybox/particles/fog
  + **gameplay effects**: reduced tire grip in rain (tune `ArcadeCarController.arcade`), lower visibility,
  wetness look, lightning. Signature "Leonida" hurricane event. **Effort: M.**

## P2.2 — Phone / meta menu
- **GTA:** In-game phone = contacts, missions, camera, internet; GTA VI adds a **social-media feed** parody. (`gta6.md` §8.2, §10)
- **SUNBREAK:** No phone; no photo mode; no way to summon services/jobs.
- **Improvement:** A phone overlay to **call contacts** (start jobs, request a vehicle, call for
  respray/heal), a **photo/selfie mode** (reuse the map camera → PNG), and a satirical **social feed**
  reacting to player chaos. **Effort: M–L.**

## P2.3 — Character systems: customization + protagonist switching
- **GTA:** Character appearance/wardrobe customization; GTA V's signature **real-time switching between
  3 protagonists**; GTA VI switches between Jason & Lucia. (`gta5.md` §2, §7.1; `gta6.md` §4.3)
- **SUNBREAK:** Single fixed character; no wardrobe/appearance options. Notably, **Cami and Mac already
  exist as mission givers** — the fiction for a dual lead is already there.
- **Improvement:** (a) **Wardrobe/appearance** customization via the modular character/UMA path the
  migration plan recommends (§4), bought at a clothing shop (P0.4). (b) **Protagonist switching**
  between Cami & Mac (swap the player avatar + loadout + saved position) — a strong differentiator that
  reuses existing characters. **Effort: M–L.**

## P2.4 — Ambient wildlife & city life
- **GTA:** RDR2-style wildlife; GTA VI trailers show gators, flamingos, dolphins. (`gta6.md` §10)
- **SUNBREAK:** No animals; peds are the only life.
- **Improvement:** Cheap ambient fauna — seagulls/pigeons (flocking billboards), stray dogs, fish/
  dolphins in the marina, palms already exist. Pure atmosphere; reuse pooling. **Effort: S–M.**

## P2.5 — Stealth systems
- **GTA:** Crouch-stealth, detection, silenced weapons, sneak takedowns. (`gta5.md` §8.4)
- **SUNBREAK:** Crouch exists but is **cosmetic** — no stealth/detection, no silencers, no hiding.
- **Improvement:** A detection model (enemy vision cones + noise; crouch/dark reduce detection),
  **suppressor** weapon variants (lower `ThreatBus` gunshot radius), stealth **takedowns** (P1.8),
  and hiding spots. Pairs naturally with mission variety. **Effort: M.**

## P2.6 — Day-night *gameplay* effects
- **GTA:** Time affects traffic/ped density, some content, ambience.
- **SUNBREAK:** `DayNightSystem` is purely visual — nothing about play changes with the clock.
- **Improvement:** Shops **close at night** (gate `Shop.Available` by `DayNightSystem.Hour`), **ped/
  traffic density shifts** by time (tune `PedManager`/`TrafficManager` caps), higher **night crime**/
  wanted responsiveness, nightlife hotspots. Cheap, adds believability. **Effort: S–M.**

## P2.7 — 100% completion, collectible mystery, easter eggs
- **GTA:** Collectibles (spaceship parts, letter scraps), the Chiliad Mystery, UFOs, a 100% tracker + reward. (`gta5.md` §8.7, §15.2)
- **SUNBREAK:** No completion tracking, collectibles, or secrets.
- **Improvement:** A **100% checklist** (missions + activities + collectibles), a small island
  **mystery** with a payoff, and a couple of hidden easter eggs. Cheap replay/discovery hooks. **Effort: S–M.**

## P2.8 — Random dynamic street events
- **GTA:** ~60 roadside **random events** (muggings, breakdowns, hitchhikers) that make free-roam feel alive. (`gta5.md` §7.4)
- **SUNBREAK:** None — free-roam is inert between missions.
- **Improvement:** A `RandomEventManager` that occasionally spawns nearby encounters (a mugging you can
  intervene in, a stalled driver, a police stop) reusing `Ped`/`MissionEnemy`/`CashPickup`. **Effort: M.**

## P2.9 — Minimap / GPS / HUD polish
- **GTA:** Distinct blip **icons**, street names, mission-area radius shading, GPS that zooms with speed.
- **SUNBREAK:** Solid foundation (RenderTexture minimap, heading arrow, colored **dots**, A\* GPS route,
  click-to-waypoint) but **blips are undifferentiated dots**, there are **no street names**, no
  mission-radius circles, no north indicator/legend, and no minimap zoom-out at speed.
- **Improvement:** Icon sprites per `BlipKind`, minimap **zoom-out while driving fast**, mission-area
  radius rings, a north tick + legend, and blip clustering. All UI-only (`GameHUD`/`MapScreen`). **Effort: S–M.**

## P2.10 — Deepened accessibility
- **GTA / modern baseline:** Key/controller **remapping**, subtitles, colorblind modes, aim-assist and
  difficulty toggles.
- **SUNBREAK:** Inputs are **hard-coded in each script** (e.g., `PlayerController`, `PlayerCombat` build
  `InputAction`s in code) → **no remap**; no subtitles for mission dialogue, no colorblind/aim-assist options.
- **Improvement:** Migrate to a shared **Input Actions asset** with a rebinding UI (the migration plan
  §4 already recommends the Input System asset), add subtitle/caption toggles for `GameHUD` toasts,
  colorblind-safe blip palettes, and an aim-assist/difficulty slider. **Effort: M** (mostly the input refactor).

---

## 3. Recommended sequencing (biggest bang-for-buck first)

1. **Quick-win bundle (≈1–2 weeks total):** P0.1 Wasted/Busted, P0.2 health/armor, P0.5 settings,
   P0.6 tutorial, plus P1.8's *feedback* sub-item and P2.9 HUD polish. These are all **S** and each
   removes an obvious "unfinished" tell.
2. **World-comes-alive bundle:** P0.4 activate services → P1.3 ped/traffic reactions (witnesses call
   police) → P1.2 police depth. Together these make Santa Vista feel *watched* and reactive.
3. **Content bundle:** P0.3 mission robustness → P1.5 activities → P1.6 progression. Gives players a
   reason to keep playing.
4. **Traversal bundle:** P1.1 boats/bikes (use the marina + airfield) → P1.4 garages/customization.
5. **Flavor bundle (creative):** P2.1 weather, P2.3 Cami/Mac switching, P2.2 phone, P2.4 wildlife —
   the differentiators that give SUNBREAK its own identity.

**North star:** none of the above requires better *art* — they're **systems, consequence, reactivity,
and content**, all achievable on the free/indie Unity 6.3 + URP stack described in the migration plan.
The fastest path to "this feels like a real game, not a demo" is **P0 in full**, then the
**world-comes-alive bundle**.

---

## 4. Sources

**Local research (in this workspace / adjacent):**
- `mcat-speedrun/gta-dossier/research/gta5.md` — GTA V systems (wanted, weapon wheel, economy/stock,
  activities, collectibles, radio/score, map, missions/heists).
- `mcat-speedrun/gta-dossier/research/gta6.md` — GTA VI expectations (NPC daily routines, procedural
  interiors, dynamic weather, in-game phone/social network, vehicles/transport, character switching).
- `sunbreak/unity-plan/00-UNITY-MAC-PLAN.md` — Unity 6.3/URP stack, free-asset sources, migration map
  (ports `boat.ts`/`flight.ts`/`presets.ts`), and the honest free-scope quality ceiling.
- `sunbreak-unity/Assets/SUNBREAK/Scripts/**` — the current implementation (read for the inventory above).

**Web-verified GTA mechanics (cited inline):**
- GTA Wiki — [Wanted Level in GTA V](https://gta.fandom.com/wiki/Wanted_Level_in_GTA_V) (roadblocks 3★, spike strips, Police Maverick heli, NOOSE/SWAT 4★, military 5★, last-known-position search).
- GTA Wiki — [Los Santos Customs](https://gta.fandom.com/wiki/Los_Santos_Customs) & [Pay 'n' Spray](https://gta.wiki/w/Pay_%27n%27_Spray) (repair/respray/**lose wanted out of sight**, customization).
- [GTA V Game Help (official manual)](https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/9dfeb637-1cb0-46c8-b7d7-0c58cf990494/en-GB/index.html) & ["What is wasted in GTA?"](https://www.vintageisthenewold.com/faq/what-is-wasted-in-gta) (Wasted = 5% cash up to $5,000, keep weapons; Busted = arrest, lose weapons; hospital respawn).
- [GTA 3 AI breakdown (Medium)](https://medium.com/@filtercutter/gta-3-ai-from-two-decades-ago-b3e1c7bd71d4) & [GTA V pedestrian dialogue (Game Developer)](https://www.gamedeveloper.com/design/breaking-down-gta-v-s-pedestrian-dialogue-system-an-analysis-with-speculative-examples) (ped FSM wander/flee/attack, witness runs to phone to REPORT_CRIME, per-archetype ambient dialogue pools, reactions to gun draw/reckless driving).

*Compiled read-only on 2026-07-04. GTA facts reflect the cited sources as of that date.*
