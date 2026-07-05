using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Player;
using SUNBREAK.UI;
using SUNBREAK.Vehicles;
using UnityEngine.InputSystem;

namespace SUNBREAK.World
{
    /// <summary>
    /// Contact-driven wanted level + police dispatch — a faithful port of the web build's
    /// wanted/{tuning,crimeSystem,store,cooldown,dispatch,footCops}. Wanted rises ONLY on player
    /// CONTACT with a person (hit/kill), scales with DISTINCT victims, debounces re-hits on the
    /// same victim (2.5s, kills always count), weighs kills &gt; hits and cops &gt; civilians. Stars
    /// decay one tier at a time after the tier's uncontested cooldown with no cop holding contact.
    /// Police escalate per star (count + weapon + accuracy + health). Resets to 0 on respawn.
    /// </summary>
    public sealed class WantedSystem : MonoBehaviour
    {
        public static WantedSystem Instance { get; private set; }

        // ── Wanted tuning (rebalanced for a GRADUAL climb) ─────────────────────
        // Per-crime heat is lower + the star thresholds higher than the old port, so a single minor
        // crime is 1★ and it takes real, repeated escalation to climb. Only killing a cop reaches 3★
        // in a single act (via the severity floor).
        const float ContactDebounceS = 2.5f;
        const float HitCivilian = 1f, HitPolice = 2.5f, KillCivilian = 3f, KillPolice = 6f, NewVictimBonus = 0.5f;
        static readonly float[] StarThresholds = { 0, 2, 6, 12, 22, 36 };
        static readonly Dictionary<int, float> CooldownS = new() { { 1, 20 }, { 2, 30 }, { 3, 45 }, { 4, 60 }, { 5, 80 } };
        const float ResponseTimeS = 6f, ReinforceStaggerS = 1.6f, LosLostGrace = 2f, CloseContact = 14f;
        const float CopRetreatR = 150f, SpawnRing = 46f, CarSpawnRing = 70f;

        // Police behaviour per tier: 1★ APPREHEND (no guns, try to cuff), 2★ FORCEFUL (guns drawn,
        // fire only if the player resists), 3★+ LETHAL (shoot on sight + heli/roadblocks), 4–5★ SWAT.
        public enum Posture { Apprehend, Forceful, Lethal }

        public struct CopTier { public int count; public string weapon; public float accuracy; public float health; }
        static readonly Dictionary<int, CopTier> CopEscalation = new()
        {
            { 0, new CopTier { count = 0, weapon = "pistol_9mm", accuracy = 0f, health = 100 } },
            { 1, new CopTier { count = 2, weapon = "pistol_9mm", accuracy = 0.30f, health = 100 } },
            { 2, new CopTier { count = 3, weapon = "pistol_9mm", accuracy = 0.40f, health = 110 } },
            { 3, new CopTier { count = 4, weapon = "smg_vector", accuracy = 0.5f, health = 120 } },
            { 4, new CopTier { count = 6, weapon = "rifle_carbine", accuracy = 0.62f, health = 175 } }, // SWAT
            { 5, new CopTier { count = 8, weapon = "rifle_carbine", accuracy = 0.72f, health = 220 } }, // SWAT
        };
        // Cop CARS per star (TIER_BUDGETS.cruisers), capped for a Mac hero budget.
        static readonly int[] CarBudget = { 0, 1, 2, 3, 4, 5 };

        [Header("Wiring (set by IslandSceneBuilder)")]
        public Transform player;
        public PlayerState playerState;
        public CrowdFactory crowd;
        public CityGenerator city;

        // ── Live state ────────────────────────────────────────────────────────
        public int Stars { get; private set; }
        public float Heat { get; private set; }
        public bool Searching { get; private set; }
        public Vector3 Lkp { get; private set; }
        public int CopCount => _cops.Count;

        /// <summary>Sticky (for the current wanted session) once the player attacks/flees/fires while
        /// wanted. Bumps the posture up so cops draw + fire instead of trying to cuff.</summary>
        bool _resisting;
        public bool Resisting => _resisting;

        /// <summary>Current police posture from the star level + whether the player is resisting.</summary>
        public Posture CurrentPosture
        {
            get
            {
                if (Stars >= 3) return Posture.Lethal;
                if (Stars == 2) return _resisting ? Posture.Lethal : Posture.Forceful;
                if (Stars == 1) return _resisting ? Posture.Forceful : Posture.Apprehend;
                return Posture.Apprehend;
            }
        }

        /// <summary>Whether officers are allowed to open fire (vs. approach to cuff non-lethally).</summary>
        public bool CopsMayShoot
        {
            get { var p = CurrentPosture; return p == Posture.Lethal || (p == Posture.Forceful && _resisting); }
        }

        /// <summary>Flag the player as resisting arrest (attacking a cop, fleeing, or firing a gun).
        /// Only meaningful while already wanted; escalates the posture toward lethal.</summary>
        public void ReportResist() { if (Stars > 0) _resisting = true; }

        /// <summary>True while any pursuing officer has eyes on the player — the respray/customs shop
        /// only clears wanted when this is false (mirrors Pay 'n' Spray "out of sight").</summary>
        public bool PoliceHaveSight
        {
            get
            {
                if (Stars == 0) return false;
                Vector3 pp = player ? player.position : Vector3.zero;
                foreach (var c in _cops)
                {
                    if (c == null || c.Removed) continue;
                    if (c.HasLos && Time.time - c.LastSeen < 2f) return true;
                    if ((c.transform.position - pp).sqrMagnitude <= 22f * 22f) return true;
                }
                foreach (var v in _cars)
                    if (v != null && (v.transform.position - pp).sqrMagnitude <= 45f * 45f) return true;
                return false;
            }
        }

        readonly Dictionary<int, float> _lastHitAt = new();
        readonly HashSet<int> _distinct = new();
        readonly List<Cop> _cops = new();
        readonly List<CopCar> _cars = new();
        readonly List<Roadblock> _roadblocks = new();
        CopHeli _heli;

        float _dispatchAcc, _cooldownTimer, _wantedSince, _lastFootSpawn, _lastCarSpawn, _lastBlockT, _lastHeliT;
        int _prevStars;

        // Arrest / surrender.
        InputAction _surrender;
        float _standStill;
        VehicleInteraction _veh;

        void Awake()
        {
            Instance = this;
            _surrender = new InputAction("Surrender", InputActionType.Button, "<Keyboard>/b");
        }
        void OnEnable() { _surrender?.Enable(); }
        void OnDisable() { _surrender?.Disable(); }
        void OnDestroy() { if (Instance == this) Instance = null; }

        // ── Crime intake (called by Health when the player hits/kills a person) ─
        public void ReportPlayerContact(int victimId, Faction faction, bool lethal, Vector3 pos)
        {
            bool cop = faction == Faction.Police;
            bool wasWanted = Stars > 0;
            float t = Time.time;
            // Per-victim debounce (a kill always counts, even inside the window).
            if (!lethal && t - (_lastHitAt.TryGetValue(victimId, out var last) ? last : -9999f) < ContactDebounceS) return;
            _lastHitAt[victimId] = t;

            bool isNew = _distinct.Add(victimId);
            float heat = lethal ? (cop ? KillPolice : KillCivilian) : (cop ? HitPolice : HitCivilian);
            if (isNew) heat += NewVictimBonus;

            // Softer severity floors: a single minor crime = 1★; only a cop KILL jumps to 3★.
            int severityFloor = cop ? (lethal ? 3 : 1) : 1;
            int floor = Mathf.Max(MinStarsForDistinct(_distinct.Count), severityFloor);
            AddHeat(heat, floor);
            Lkp = pos;

            // Attacking a cop, or continuing to attack anyone once already wanted, is resisting arrest.
            if (cop || wasWanted) _resisting = true;
        }

        /// <summary>A witness who SAW a crime (but wasn't the victim) phones it in — raises heat by
        /// severity; many witnesses stack. Reuses the same heat model as direct contact.</summary>
        public void ReportWitness(float severity, Vector3 pos)
        {
            if (severity <= 0f) return;
            int floor = severity >= 2.5f ? 3 : severity >= 1.2f ? 2 : 1;
            AddHeat(severity, floor);
            Lkp = pos;
        }

        /// <summary>Air unit relays the player's live position to keep ground units + LKP fresh.</summary>
        public void RelayPosition(Vector3 pos) { Lkp = pos; }

        static int MinStarsForDistinct(int n) => n >= 16 ? 5 : n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;

        static int StarForHeat(float heat)
        {
            int s = 0;
            for (int i = 1; i < StarThresholds.Length; i++) if (heat >= StarThresholds[i]) s = i;
            return s;
        }
        static float HeatFloorForStars(int s) => StarThresholds[Mathf.Clamp(s, 0, 5)];

        void AddHeat(float delta, int minStars)
        {
            Heat = Mathf.Max(0f, Heat + delta);
            if (minStars > 0) Heat = Mathf.Max(Heat, HeatFloorForStars(minStars));
            Stars = Mathf.Clamp(Mathf.Max(StarForHeat(Heat), Mathf.Max(minStars, Stars)), 0, 5);
            Searching = false;
        }

        /// <summary>Force a wanted tier (mission scripting: setWanted). 0 clears.</summary>
        public void ForceStars(int stars)
        {
            stars = Mathf.Clamp(stars, 0, 5);
            if (stars == 0) { Clear(); return; }
            Heat = Mathf.Max(Heat, HeatFloorForStars(stars));
            Stars = Mathf.Max(Stars, stars);
            Searching = false;
        }

        /// <summary>Full reset — called on respawn/death (wanted resets to 0).</summary>
        public void Clear()
        {
            Stars = 0; Heat = 0; Searching = false; _resisting = false; _standStill = 0f;
            GameHUD.SetAlert(null);
            _lastHitAt.Clear(); _distinct.Clear();
            foreach (var c in _cops) if (c != null) c.Despawn();
            _cops.Clear();
            foreach (var c in _cars) if (c != null) Destroy(c.gameObject);
            _cars.Clear();
            foreach (var r in _roadblocks) if (r != null) Destroy(r.gameObject);
            _roadblocks.Clear();
            if (_heli != null) { Destroy(_heli.gameObject); _heli = null; }
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _cops.RemoveAll(c => c == null || c.Removed);
            _cars.RemoveAll(c => c == null);

            if (Stars == 0 && _prevStars > 0) { _lastHitAt.Clear(); _distinct.Clear(); }
            if (Stars > 0 && _prevStars == 0) { _wantedSince = Time.time; _lastFootSpawn = 0; _lastCarSpawn = 0; }
            _prevStars = Stars;

            if (Stars == 0)
            {
                if (_cops.Count > 0 || _cars.Count > 0) Clear();
                GameHUD.SetAlert(null);
                return;
            }

            Cooldown(dt);
            Dispatch(dt);
            UpdateArrest(dt);
        }

        /// <summary>The arrest-first loop: while a non-lethal officer is closing in, prompt the player
        /// to surrender. Standing still (or pressing B) hands you in (BUSTED); fleeing or driving off
        /// counts as resisting and flips the posture toward force.</summary>
        void UpdateArrest(float dt)
        {
            if (player == null) { GameHUD.SetAlert(null); return; }
            if (_veh == null) _veh = FindFirstObjectByType<VehicleInteraction>();

            // Nearest officer that currently has eyes on the player.
            Cop near = null; float best = 17f * 17f;
            Vector3 pp = player.position;
            foreach (var c in _cops)
            {
                if (c == null || c.Removed || !c.HasLos) continue;
                float d = (c.transform.position - pp).sqrMagnitude;
                if (d < best) { best = d; near = c; }
            }

            if (near == null) { GameHUD.SetAlert(null); _standStill = 0f; return; }

            if (CopsMayShoot) { GameHUD.SetAlert("WANTED  —  lose the police"); _standStill = 0f; return; }

            // Non-lethal posture: they want to cuff you.
            bool driving = _veh != null && _veh.CurrentCar != null;
            float kmh = driving ? Mathf.Abs(_veh.CurrentCar.SpeedKmh) : 0f;
            var pc = player.GetComponent<PlayerController>();
            float footSpeed = !driving && pc != null ? pc.PlanarSpeed : 0f;

            if (kmh > 15f || footSpeed > 6f) { _resisting = true; _standStill = 0f; GameHUD.SetAlert("RESISTING  —  police drawing weapons"); return; }
            if (driving) { _standStill = 0f; GameHUD.SetAlert("Police want to arrest you  —  get out & surrender"); return; }

            GameHUD.SetAlert("Police closing in  —  STAND STILL or press  B  to surrender");
            if (footSpeed < 0.7f) _standStill += dt; else _standStill = 0f;
            if (_standStill > 1.6f || (_surrender != null && _surrender.WasPressedThisFrame()))
                WastedBusted.Instance?.Bust();
        }

        void Cooldown(float dt)
        {
            bool contested = false;
            Vector3 pp = player ? player.position : Vector3.zero;
            foreach (var c in _cops)
            {
                if (c == null || c.Removed) continue;
                if (c.HasLos && Time.time - c.LastSeen < LosLostGrace) { contested = true; break; }
                if (player && (c.transform.position - pp).sqrMagnitude <= CloseContact * CloseContact) { contested = true; break; }
            }
            if (contested) { Searching = false; _cooldownTimer = CooldownS[Stars]; return; }

            if (!Searching) { Searching = true; _cooldownTimer = CooldownS.TryGetValue(Stars, out var cd) ? cd : 30f; }
            _cooldownTimer -= dt;
            if (_cooldownTimer <= 0f)
            {
                Stars = Mathf.Max(0, Stars - 1);
                Heat = HeatFloorForStars(Stars);
                _cooldownTimer = Stars > 0 && CooldownS.TryGetValue(Stars, out var cd) ? cd : 0f;
                if (Stars == 0) Clear();
            }
        }

        void Dispatch(float dt)
        {
            _dispatchAcc += dt;
            if (_dispatchAcc < 1f / 3f) return;
            _dispatchAcc = 0f;
            if (player == null || crowd == null) return;
            if (Time.time - _wantedSince < ResponseTimeS) return; // district response time

            var tier = CopEscalation[Mathf.Clamp(Stars, 0, 5)];
            Vector3 pp = player.position;

            // Cars trickle in + drive up (they drop a cop on arrival).
            int wantCars = CarBudget[Mathf.Clamp(Stars, 0, 5)];
            if (_cars.Count < wantCars && Time.time - _lastCarSpawn >= ReinforceStaggerS)
            {
                var car = SpawnCopCar(RingPos(pp, CarSpawnRing));
                if (car != null) { _cars.Add(car); _lastCarSpawn = Time.time; }
            }
            else if (_cars.Count > wantCars) { var v = _cars[_cars.Count - 1]; _cars.RemoveAt(_cars.Count - 1); if (v) Destroy(v.gameObject); }

            // Foot cops trickle up to the escalation count.
            if (_cops.Count < tier.count && Time.time - _lastFootSpawn >= ReinforceStaggerS)
            {
                SpawnFootCop(RingPos(pp, SpawnRing), tier, Stars);
                _lastFootSpawn = Time.time;
            }
            else if (_cops.Count > tier.count)
            {
                Cop far = null; float fd = -1;
                foreach (var c in _cops) { if (c == null) continue; float d = (c.transform.position - pp).sqrMagnitude; if (d > fd) { fd = d; far = c; } }
                if (far != null) { far.Despawn(); _cops.Remove(far); }
            }

            // Air support (3★+): one police chopper orbits, spotlights, relays the LKP, and fires.
            if (Stars >= 3 && _heli == null && Time.time - _lastHeliT > 8f) { _heli = CopHeli.Spawn(pp); _lastHeliT = Time.time; }
            else if (Stars < 3 && _heli != null) { Destroy(_heli.gameObject); _heli = null; }

            // Roadblocks (3★+): drop one (or two at 4★+) across a road ahead of the player periodically.
            _roadblocks.RemoveAll(r => r == null);
            int wantBlocks = Stars >= 4 ? 2 : 1;
            if (Stars >= 3 && _roadblocks.Count < wantBlocks && Time.time - _lastBlockT > 12f)
            {
                var block = TrySpawnRoadblock(pp);
                if (block != null) { _roadblocks.Add(block); _lastBlockT = Time.time; }
            }
        }

        public Cop SpawnFootCop(Vector3 pos, CopTier tier, int star)
        {
            // 4–5★ escalates to SWAT: the Ch15 model gets a dark tactical look + the tougher stats.
            var cop = crowd.SpawnCop(pos, tier.weapon, tier.accuracy, tier.health, star, star >= 4);
            if (cop != null) _cops.Add(cop);
            return cop;
        }

        Roadblock TrySpawnRoadblock(Vector3 pp)
        {
            if (city == null || player == null) return null;
            Vector3 dir = player.forward; dir.y = 0f;
            if (dir.sqrMagnitude < 0.1f) dir = Vector3.forward;
            dir.Normalize();
            float spacing = city.roadSpacing;
            Vector3 ahead = pp + dir * 62f;
            // Snap onto the nearest road grid line perpendicular to travel, on land.
            if (Mathf.Abs(dir.x) >= Mathf.Abs(dir.z)) ahead.x = Mathf.Round(ahead.x / spacing) * spacing;
            else ahead.z = Mathf.Round(ahead.z / spacing) * spacing;
            if (Geography.IsWaterPadded(ahead.x, ahead.z, 6f) || Geography.DistrictAt(ahead.x, ahead.z) == null) return null;
            return Roadblock.Spawn(city, ahead, dir);
        }

        CopCar SpawnCopCar(Vector3 pos)
        {
            if (city == null) return null;
            var go = city.BuildCarVisual(pos, 0f, new Color(0.15f, 0.2f, 0.32f), out var wheels, out _);
            if (go == null) return null;
            go.name = "CopCar";
            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true; rb.useGravity = false;
            var box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0.7f, 0f); box.size = new Vector3(1.8f, 1.3f, 4.2f);
            var car = go.AddComponent<CopCar>();
            car.Init(this, player, wheels);
            return car;
        }

        Vector3 RingPos(Vector3 c, float r)
        {
            float a = Random.value * Mathf.PI * 2f;
            return new Vector3(c.x + Mathf.Cos(a) * r, c.y, c.z + Mathf.Sin(a) * r);
        }

        public CopTier TierFor(int star) => CopEscalation[Mathf.Clamp(star, 0, 5)];
    }
}
