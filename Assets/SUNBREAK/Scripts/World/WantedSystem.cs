using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;

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

        // ── Ported tuning ─────────────────────────────────────────────────────
        const float ContactDebounceS = 2.5f;
        const float HitCivilian = 1.5f, HitPolice = 4f, KillCivilian = 4f, KillPolice = 8f, NewVictimBonus = 1f;
        static readonly float[] StarThresholds = { 0, 1, 3, 6, 10, 16 };
        static readonly Dictionary<int, float> CooldownS = new() { { 1, 20 }, { 2, 30 }, { 3, 45 }, { 4, 60 }, { 5, 80 } };
        const float ResponseTimeS = 6f, ReinforceStaggerS = 1.6f, LosLostGrace = 2f, CloseContact = 14f;
        const float CopRetreatR = 150f, SpawnRing = 46f, CarSpawnRing = 70f;

        public struct CopTier { public int count; public string weapon; public float accuracy; public float health; }
        static readonly Dictionary<int, CopTier> CopEscalation = new()
        {
            { 0, new CopTier { count = 0, weapon = "pistol_9mm", accuracy = 0f, health = 100 } },
            { 1, new CopTier { count = 2, weapon = "pistol_9mm", accuracy = 0.32f, health = 100 } },
            { 2, new CopTier { count = 3, weapon = "pistol_9mm", accuracy = 0.42f, health = 110 } },
            { 3, new CopTier { count = 4, weapon = "smg_vector", accuracy = 0.5f, health = 120 } },
            { 4, new CopTier { count = 6, weapon = "rifle_carbine", accuracy = 0.56f, health = 140 } },
            { 5, new CopTier { count = 8, weapon = "rifle_carbine", accuracy = 0.64f, health = 170 } },
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

        readonly Dictionary<int, float> _lastHitAt = new();
        readonly HashSet<int> _distinct = new();
        readonly List<Cop> _cops = new();
        readonly List<CopCar> _cars = new();

        float _dispatchAcc, _cooldownTimer, _wantedSince, _lastFootSpawn, _lastCarSpawn;
        int _prevStars;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        // ── Crime intake (called by Health when the player hits/kills a person) ─
        public void ReportPlayerContact(int victimId, Faction faction, bool lethal, Vector3 pos)
        {
            bool cop = faction == Faction.Police;
            float t = Time.time;
            // Per-victim debounce (a kill always counts, even inside the window).
            if (!lethal && t - (_lastHitAt.TryGetValue(victimId, out var last) ? last : -9999f) < ContactDebounceS) return;
            _lastHitAt[victimId] = t;

            bool isNew = _distinct.Add(victimId);
            float heat = lethal ? (cop ? KillPolice : KillCivilian) : (cop ? HitPolice : HitCivilian);
            if (isNew) heat += NewVictimBonus;

            int severityFloor = cop ? (lethal ? 4 : 3) : (lethal ? 2 : 1);
            int floor = Mathf.Max(MinStarsForDistinct(_distinct.Count), severityFloor);
            AddHeat(heat, floor);
            Lkp = pos;
        }

        static int MinStarsForDistinct(int n) => n >= 8 ? 5 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0;

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
            Stars = 0; Heat = 0; Searching = false;
            _lastHitAt.Clear(); _distinct.Clear();
            foreach (var c in _cops) if (c != null) c.Despawn();
            _cops.Clear();
            foreach (var c in _cars) if (c != null) Destroy(c.gameObject);
            _cars.Clear();
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
                return;
            }

            Cooldown(dt);
            Dispatch(dt);
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
        }

        public Cop SpawnFootCop(Vector3 pos, CopTier tier, int star)
        {
            var cop = crowd.SpawnCop(pos, tier.weapon, tier.accuracy, tier.health, star);
            if (cop != null) _cops.Add(cop);
            return cop;
        }

        CopCar SpawnCopCar(Vector3 pos)
        {
            if (city == null) return null;
            var go = city.BuildCarVisual(pos, 0f, new Color(0.15f, 0.2f, 0.32f), out var wheels, out _);
            if (go == null) return null;
            go.name = "CopCar";
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
