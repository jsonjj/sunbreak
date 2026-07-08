# SUNBREAK — Full Project Handoff & Context

> **Purpose of this file:** everything a new agent needs to be fully caught up on this
> project. Read it top to bottom before doing anything. It covers the vision, the full
> history, the tech stack, the exact build/verify workflow, the current feature set, the
> git/backup setup, known issues, user preferences, operational gotchas, and how to
> continue. When in doubt, **ask the user** — don't guess.

_Last updated: 2026-07-07. Current git HEAD: `2a85a48` on branch `unity`._

---

## 1. TL;DR

**SUNBREAK** is an original, **free, locally-runnable GTA-style open-world game**, built in
**Unity** and running on the user's **Apple-Silicon Mac**. It is NOT affiliated with GTA —
it's an original take (city "Santa Vista / Verano," dual leads "Cami & Mac").

- **Single-player is feature-complete** (open-world city, driving/flying/boating, on-foot
  combat, a reactive crime/police loop, a 5-mission story, economy, save/load, weather,
  day-night, audio — full detail in §7).
- **Two big things remain, and BOTH are GATED on the user's explicit go-ahead:**
  1. **Multiplayer** (not started).
  2. **Better models / AAA art upgrade** (deliberately deferred to the end).
- The art style today is **cohesive stylized-realism** (free CC0 kits + Mixamo characters),
  not photoreal — that's expected; photoreal is the gated end-stage upgrade.

---

## 2. History / how we got here (important for context)

1. **GTA research + planning.** The project began with deep research into GTA 5/6 and an
   ambitious multi-agent plan.
2. **Web prototype (superseded).** A full single-player GTA-like was first built as a
   **web app** (TypeScript + React-Three-Fiber + Rapier + miniplex ECS + Zustand) in a
   sibling folder: **`/Users/jonat/Desktop/sunbreak`** (git branch `main`, GitHub
   `jsonjj/sunbreak`). It's complete and playable in a browser but was capped by
   web/browser fidelity.
3. **Pivot to Unity for higher quality.** The user wanted AAA quality, so we moved to a
   real engine. After a verified research pass we chose **Unity** (best fit for
   Apple-Silicon Mac + free + the user's "minimal hands-on" preference). The web build is
   now a **design blueprint** — the Unity game re-implements its systems.
4. **Unity rebuild, slice by slice** (all in this repo, `/Users/jonat/Desktop/sunbreak-unity`):
   Slice 0 skeleton + headless pipeline → Slice 1 look-lock → Slice 2 full island city →
   Slice 3 crime loop (peds/traffic/combat/wanted/police) → Slice 4 missions/economy/
   shops/save/day-night/audio → visual fix (white-materials) → content (weapon models,
   character variety, SWAT, cop chase, enterable gun shop) → traversal (boats + helicopter
   + plane + airport + marina) → "world comes alive" (witnesses call cops, carjacking,
   police heli/roadblocks/SWAT) → completeness (mission checkpoints/retry, side activities,
   combat feel, tutorial, rep perks) → SP finishing (weather, day-night gameplay effects,
   full save-persistence, audio/radio depth, wildlife) → wanted rework + enterable
   interiors + melee combo → tweaks (respawn wipes wanted, personal car, minimap icons) →
   car durability → wanted false-trigger bugfix.

The GTA feature gap analysis that drove much of the Unity content work is saved at
**`unity-plan/GTA-GAP-ANALYSIS.md`**, and the Unity setup/migration plan at
**`unity-plan/00-UNITY-MAC-PLAN.md`**. Read both.

---

## 3. Environment & tech stack

- **OS/Hardware:** macOS on **Apple Silicon (M4)**. Rosetta 2 is installed (Unity needs it).
- **Engine:** **Unity 6.3 LTS — `6000.3.11f1`**. Editor at
  `/Applications/Unity/Hub/Editor/6000.3.11f1/Unity.app/Contents/MacOS/Unity`.
- **Render pipeline:** **URP** (NOT HDRP — HDRP is unreliable on Mac/Metal). URP + good
  lighting/post + cohesive assets is the intended look.
- **License:** Unity **Personal (free)**. IMPORTANT: Personal allows **one editor instance
  per project** → the **Editor must be CLOSED** when running headless builds/tests.
- **Key packages:** URP, Input System, Cinemachine, AI Navigation (NavMesh), ProBuilder,
  Recorder, Test Framework, TMP/UGUI. Physics = built-in **PhysX**.
- **Cost rule:** free + local only. The only paid element ever contemplated is the user's
  own OpenAI key for optional AI-NPC dialogue (server-proxied, budget-capped) — **not yet
  implemented**, and not needed for anything current.

---

## 4. Repo, git & backups (READ CAREFULLY)

- **Workspace / project root:** `/Users/jonat/Desktop/sunbreak-unity`
- **Remotes:**
  - `origin` → a **local bare** repo at `~/.sunbreak-unity-origin.git` (on-disk backup).
  - `github` → **`https://github.com/jsonjj/sunbreak.git`** (offsite backup).
- **Branch layout:** the Unity game lives on the **`unity` branch** of the `jsonjj/sunbreak`
  GitHub repo. (The old **web build** is on that repo's `main` branch — don't touch it.)
- **How to push (use HTTP/1.1 to avoid broken-pipe disconnects that happen with HTTP/2):**
  ```bash
  git -c http.version=HTTP/1.1 push github main:unity
  ```
- **What's gitignored on purpose (do NOT commit):** `Library/`, `Builds/`, `BuildLogs/`,
  and the **Mixamo FBX + extracted textures** (`Assets/SUNBREAK/Art/Characters/Mixamo/*.fbx`
  and its `Textures/`). The Mixamo files are large **and** can't be redistributed (Adobe
  terms). They live **locally only**; on a fresh clone you'd re-download the character +
  animations from Mixamo and drop them back in that folder. The project imports/wires them
  automatically; procedural fallbacks exist if a clip is missing.
- Everything else (all C#, scenes, project settings, the CC0 kit assets, planning docs) IS
  committed and pushed. As of this writing the working tree is clean and
  `local HEAD == github/unity == 2a85a48`.

---

## 5. Build & verification workflow (FOLLOW THIS EXACTLY)

The agent cannot open the Unity Editor GUI or "see" the game live. All building/testing is
**headless via the terminal**, and correctness is verified by log-scanning + real rendered
screenshots.

- **`tools/unity.sh`** wraps Unity batchmode. Commands: `compile`, `island` (regen scene),
  `build` (StandaloneOSX `.app`), `smoke`, `capture`, `run`, `all`.
- **The Editor MUST be closed** before any `tools/unity.sh` run (one-instance license). If a
  run errors with "another Unity instance is running," gracefully quit the editor + clear
  the lockfiles, then retry.
- **2-pass smoke test — every build must PASS it before it's "done":**
  - **Pass 1 (headless):** launches the built player `-batchmode -nographics` and scans the
    Player.log for `corrupted`, `Position out of bounds`, `Failed to load`, missing
    materials, `Shader ... not found`, missing `AnimatorController`/Avatar, `NullReference`,
    exceptions, crashes.
  - **Pass 2 (graphics):** actually **renders the build with Metal** and captures a real
    screenshot (this is how "white models / mis-placed objects" get caught — the exact class
    of bug that log-scanning alone missed early on).
  - Player.log lives at `~/Library/Logs/DefaultCompany/sunbreak-unity/Player.log`.
- **Render screenshots** (from the real build) are how visual issues are verified. NOTE: the
  windowed render pass is **intermittently display-throttled** on this machine
  (`WaitForEndOfFrame` blocks when the window is occluded) — when that happens, rely on the
  headless log-scan pass + batchmode self-checks, and retry the capture later.
- **To play the game:** `open /Users/jonat/Desktop/sunbreak-unity/Builds/SUNBREAK.app`
  (standalone player; unaffected by the editor one-instance rule).
- **Self-checks:** many systems have headless assertions (e.g. `SUNBREAK_WANTEDCLEAR`,
  `SUNBREAK_CARDUR`, `SUNBREAK_WALKTEST`, save round-trip) printed to the build log — add
  more of these for anything that can't be seen in a screenshot.

**Working style that has worked well:** implement in focused **slices**, keep each build
green + smoke-passing, commit in coherent chunks, and push to `github/unity` after each
slice. Don't stack many un-verified changes.

---

## 6. Assets

- **Characters/NPCs:** Mixamo Humanoid rigs — civilians `Ch01/02/06/08/23/31/33/39` +
  `Prisoner`, and **`Ch15` is the SWAT model used for police**. Materials were extracted to
  real URP Lit `.mat` files (the FBX-embedded materials rendered white in builds — fixed).
  The 9 civilians are distributed across the crowd; wardrobe tints are desaturated (a
  saturated-green tint once made NPCs look green — fixed).
- **Animations (Mixamo, in the same folder):** idle/walk/run/sprint/jump/crouch; combat
  (Shooting/Gunplay, Reload/Reloading, Rifle Idle/Run, Pistol Idle/Run, Death, Hit
  Reactions); melee (`Punching` + `Punching (1)` alternating, `Mma Kick`, `Drop Kick`,
  `Baseball Idle`, `Baseball Hit`); vehicle (`Entering Car`/`Exiting Car`).
- **Environment/props/vehicles/weapons:** **Kenney CC0** kits (city, cars, Blaster Kit for
  weapons, nature), **Poly Haven** HDRI sky (CC0), **ambientCG** PBR textures (CC0). Radio =
  CC0 tracks + synthesized stations/ambient. Attributions in `Assets/SUNBREAK/Art/ATTRIBUTION.md`.
- **Vehicle physics** ported from the web build: cars (`ArcadeCarController` ← `presets.ts`),
  boats (`BoatController` ← `boat.ts`), aircraft heli+plane (`AircraftController` ←
  `flight.ts`). Boat/aircraft/heli currently use **procedural stylized** meshes (swapping in
  CC0 kit meshes is an easy follow-up).

---

## 7. Current feature set (what SUNBREAK is right now)

- **World:** procedurally generated **coastal island** with 7 districts + landmarks, roads,
  sidewalks, water (sea/marina/marsh), a **day-night cycle**, and **dynamic weather**
  (clear↔rain↔storm) with gameplay effects (wet-road grip loss, reduced visibility). Single
  source of truth = **`Assets/SUNBREAK/Scripts/World/Geography.cs`**. No hard walls — falling
  off the world respawns you.
- **Traversal:** drivable **cars, boats, a helicopter, and a plane**; a real **airport
  (runway/apron/helipad)** and **marina dock**. Shared `IDrivable` enter/exit on **F**;
  chase cam trails aircraft/boats. A **personal owned car** spawns by the player (free to
  drive, no wanted; tagged "Your Car" on the map).
- **On-foot:** walk/run/sprint/crouch/jump; third-person, aim/ADS (RMB), first-person (V);
  combat with **visible weapon models**, firing/reload animations, hit-feedback (camera
  shake, vignette, hitmarkers), **aim-assist**; **melee** with fists (punch→punch→kick→
  dropkick combo), **bat**, and **machete**.
- **Crime & police:** **contact/witness-driven wanted** (rises only from real crimes —
  shooting/hitting/killing people, carjacking, attacking cops; NOT from walking/aiming/
  driving). Police escalate **gradually**: 1★ cops try to **arrest/cuff** you (surrender or
  get Busted), only turning lethal if you **resist**; higher stars add a **pursuit
  helicopter, roadblocks, and a SWAT tier**. **Wasted/Busted** flow; **health + armor**;
  respawn **clears wanted to 0** and all deployed units.
- **NPCs/traffic:** varied textured pedestrians (wander/flee/fight; tough types swing melee),
  witnesses who report crimes, **carjackable** traffic (pull the driver out), seagulls over
  the bay.
- **Vehicles are durable:** ~800 HP, weapon-dependent damage (small arms chip — dozens of
  rounds; explosives wreck fast — RPG one-shots); normal crashes don't destroy them;
  smoke→fire→explode stages near death. (Note: boats/aircraft/cop-heli share this HP.)
- **Missions/content:** a **5-mission Cami & Mac story** with intro/outro, **checkpoints,
  retry, and fail** states; repeatable **side activities** (taxi/delivery, street races,
  bounty, rampage) + **hidden collectibles**; rewards pay cash + **rep** (rep tiers grant a
  max-health perk).
- **Economy & services:** single wallet + bank; **walk-in interiors** for the gun store,
  hospital (heal), respray/Verano Customs (repair + lose wanted out of sight), safehouse
  (save), fuel/convenience, and dealership (showroom); ATM. Buying weapons/cars grants
  usable items.
- **Systems/UX:** full **save/load** (economy, stats, inventory, missions, position, time,
  weather, activities, collectibles, tutorial, rep — all persist); **settings** menu
  (volume, sensitivity, invert-Y, FOV, brightness) + **quit-to-desktop**; one-overlay-at-a-
  time with Esc priority; **first-run tutorial**; **minimap + full map** with A* GPS routing,
  set-waypoint, and per-POI icons/labels; radio stations + dynamic/ambient audio.

---

## 8. Architecture / key files (under `Assets/SUNBREAK/Scripts/`)

- `World/Geography.cs` — the map single-source-of-truth (districts, landmarks, water, bounds,
  spawn, `FLIGHT_CEILING`, `WATER_LEVEL`, `IsWater`, `groundKindAt`, etc.).
- `World/` — `WantedSystem`, `Cop`, `CrowdFactory`, `CopHeli`, `Roadblock`, `CarHealth`,
  `PersonalCar`, `ServiceBuilding`, `EnterableShop`, `BuildShot` (screenshot capture),
  `CityGenerator`/`TraversalSites` (procedural build), day-night, weather, wildlife.
- `Combat/` — `PlayerCombat`, `WeaponData`, `WeaponModelLibrary`, `WeaponVisuals`,
  `MeleeAnimator`, catalog + damage + VFX.
- `Vehicles/` — `ArcadeCarController`, `BoatController`, `AircraftController`,
  `VehicleInteraction`, `TrafficCar`, `IDrivable`.
- `UI/` — `GameHUD`, `PauseMenu`/settings, `MapScreen`, `ShopMenu`, `MissionCard`,
  overlay coordinator.
- Missions/economy/save/audio systems + `Editor/` (scene generators, `BuildTools`,
  `HumanoidAnimatorSetup`), and **`tools/unity.sh`**.

---

## 9. Known issues / play-test tuning (not blockers)

- Flight/boat **feel** (torque, takeoff distance, turn rates) needs interactive tuning.
- Cop-chase **balance** (crew sizes/accuracy per star), car-destruction thresholds, melee
  combo damage — all want a hands-on pass.
- **Minimap icons** are small letter-glyphs; could be upgraded to true icon sprites / a legend.
- **Interior signage text renders mirrored** (cosmetic; easy fix pending).
- **Cop helicopter shares the 800 HP** car value → tanky to bullets (RPG still drops it);
  give it a lower dedicated HP if it feels spongy.
- Aircraft/boat **meshes are procedural** placeholders; CC0 kit meshes would look better.
- Radio/ambient are mostly **synthesized**; dropping real CC0 tracks into
  `Assets/StreamingAssets/Radio` enriches stations automatically.
- **Melee anims** verify on the player in first/third person; a machete-specific slash would
  differentiate it from the bat (currently shares the baseball swing per user request).

---

## 10. Gated next steps & user preferences

- **GATED — do NOT start without the user's explicit "go":**
  1. **Multiplayer** — a large netcode effort (the web design referenced Colyseus; in Unity
     the pragmatic choices are Netcode for GameObjects or Mirror). The user wants **SP fully
     done → multiplayer → then the model upgrade**.
  2. **Better models / AAA art upgrade** — deferred to the very end. Honest ceiling: free
     assets on Mac/URP cap at cohesive **stylized-realism**, not photoreal; genuine
     photoreal would want an **asset budget** and ideally a Windows+GPU box. The user
     accepted "models good enough for now, upgrade at the end."
- **User preferences to respect:**
  - **Art direction:** realistic-*leaning* but **cohesive** — explicitly "not a weird
    Roblox-looking version." Cohesion > raw fidelity.
  - **Keep them in the loop, ask questions, and gate the big/consequential steps.** They
    play-test frequently and send specific feedback; iterate on that.
  - **Honesty:** the agent cannot generate 3D models/animations — those come from asset
    libraries (Mixamo, CC0 kits) or the user. Be upfront about that.

---

## 11. Operational gotchas (things that have bitten us)

- **Cursor billing:** background agents have intermittently failed with an **"unpaid
  invoice"** error. If a run dies with that, it's an **account/billing** issue (the team
  must pay the invoice — verify it shows *Paid*, payment actually processed, no banner) —
  not a code problem. Don't loop on retries; wait until it's genuinely cleared.
- **Pushes:** use `git -c http.version=HTTP/1.1 push github main:unity` (HTTP/2 causes
  broken-pipe / sideband disconnects on this network).
- **Workspace occasionally detaches** ("workspace changed to none"). Re-root to
  `/Users/jonat/Desktop/sunbreak-unity` (in Cursor, the cursor-app-control
  `move_agent_to_cloned_root` tool was used for this).
- **Repo size:** keep large binaries gitignored (a 4K HDRI + 2K textures once bloated
  `.git`; downsized to 2K/1K and history was cleaned). The Mixamo FBX are ~hundreds of MB —
  keep them ignored.
- **Never** commit the Mixamo FBX (license + size) or `Library/`/`Builds/`.

---

## 12. How to continue (for the next agent)

1. Read this file + `unity-plan/GTA-GAP-ANALYSIS.md` + `unity-plan/00-UNITY-MAC-PLAN.md`.
2. Work in focused slices; keep the Editor closed for builds; **every build must pass the
   2-pass smoke** (log-scan + real render) before you call it done.
3. Commit in coherent chunks; push to **`github/unity`** with the HTTP/1.1 command.
4. Verify visual changes with **render screenshots**; add headless self-checks for anything
   a screenshot can't show.
5. **Do not start multiplayer or the better-models upgrade without the user's explicit
   go-ahead.** For tuning/bugfixes/SP content, proceed and keep the user informed.
6. If anything here is unclear or you hit an account/billing/tooling wall, **stop and ask
   the user** rather than guessing.
