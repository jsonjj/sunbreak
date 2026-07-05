using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.UI;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.Missions
{
    /// <summary>
    /// The canon Santa Vista story driver. Runs the linear m01–m05 chain (Cami &amp; Mac) faithfully:
    /// a giver marker for the next available mission, per-stage onEnter/onComplete effects (dialogue,
    /// setWanted, spawn vehicle/enemies/props), objective tracking (interact/goto/enter-vehicle/
    /// eliminate/collect/survive), a waypoint, and rewards (cash + rep + weapon) into the wallet.
    /// </summary>
    [DefaultExecutionOrder(50)]
    public sealed class MissionSystem : MonoBehaviour
    {
        public static MissionSystem Instance { get; private set; }

        List<MissionDef> _defs;
        readonly HashSet<string> _completed = new();

        MissionDef _active;
        int _stageIndex;
        bool _built;
        bool _failing;
        float _stageStart;
        PlayerState _state;

        // objective progress
        float _surviveUntil;
        int _collected;
        readonly List<MissionEnemy> _enemies = new();
        readonly List<Transform> _props = new();
        readonly Dictionary<string, ArcadeCarController> _vehicles = new();

        VehicleInteraction _vehicle;
        PlayerCombat _combat;
        GameObject _giverGo, _giverBeacon, _waypoint;
        MissionGiver _giver;
        MissionDef _shownGiver;

        public int TotalRep { get; private set; }
        /// <summary>Award reputation (side activities / collectibles) + refresh rep perks.</summary>
        public void AddRep(int rep) { if (rep <= 0) return; TotalRep += rep; ApplyRepPerks(); }
        public bool HasActive => _active != null;
        public string ActiveTitle => _active?.title;
        public string ObjectiveText { get; private set; }
        public bool HasWaypoint { get; private set; }
        public Vector3 WaypointPos { get; private set; }

        /// <summary>The next startable mission (prereqs met, not active/complete), or null.</summary>
        public MissionDef AvailableMission => _active != null ? null : NextAvailable();

        void Awake() { Instance = this; }
        void OnDestroy()
        {
            if (_state != null) _state.Died -= OnPlayerDied;
            if (Instance == this) Instance = null;
        }

        void EnsureBuilt()
        {
            if (_built) return;
            var player = GameRefs.Player;
            if (player == null) return;
            _built = true;
            _defs = MissionCatalog.Build();
            _vehicle = player.GetComponent<VehicleInteraction>();
            _combat = player.GetComponent<PlayerCombat>();
            _state = GameRefs.PlayerState;
            if (_state != null) _state.Died += OnPlayerDied; // Wasted mid-mission → fail (not silent reset)
            BuildGiver();
        }

        // Rep perk hook — recomputed whenever rep changes (see MakeRepMatter in ApplyRepPerks).
        void OnPlayerDied() { if (_active != null && !_failing) Fail("You were wasted", 2.8f); }

        // ── Giver marker (one at a time, at the current available mission) ────────
        void BuildGiver()
        {
            _giverGo = new GameObject("MissionGiver");
            _giver = _giverGo.AddComponent<MissionGiver>();
            _giver.system = this; _giver.range = 4.5f;
            _giverBeacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.Destroy(_giverBeacon.GetComponent<Collider>());
            _giverBeacon.transform.SetParent(_giverGo.transform, false);
            _giverBeacon.transform.localScale = new Vector3(0.5f, 7f, 0.5f);
            _giverBeacon.transform.localPosition = new Vector3(0f, 7f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.82f, 0.28f) };
            var r = _giverBeacon.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(_giverGo, BlipKind.Mission, new Color(1f, 0.82f, 0.28f), "Mission");
            _giverGo.SetActive(false);
        }

        void UpdateGiver()
        {
            var avail = AvailableMission;
            if (avail != _shownGiver)
            {
                _shownGiver = avail;
                if (avail != null) _giverGo.transform.position = Ground(avail.startPos);
            }
            bool show = avail != null && _active == null;
            if (_giverGo.activeSelf != show) _giverGo.SetActive(show);
        }

        MissionDef NextAvailable()
        {
            if (_defs == null) return null;
            foreach (var d in _defs)
            {
                if (_completed.Contains(d.id)) continue;
                if (PrereqMet(d)) return d; // linear chain → first uncompleted with prereq met
            }
            return null;
        }

        bool PrereqMet(MissionDef d)
        {
            // linear: a mission is available if it's the first one, or the mission whose next==d.id is done
            foreach (var m in _defs) if (m.next == d.id) return _completed.Contains(m.id);
            return true; // no predecessor → the opener (m01)
        }

        public void StartAvailable()
        {
            var d = AvailableMission;
            if (d == null) return;
            _active = d; _stageIndex = -1; _failing = false;
            MissionCard.Intro(d.title, $"Lead: {d.giver}");
            AdvanceStage();
        }

        // ── Stage flow ───────────────────────────────────────────────────────────
        void AdvanceStage()
        {
            _stageIndex++;
            if (_active == null) return;
            if (_stageIndex >= _active.stages.Count) { Complete(); return; }

            var stage = _active.stages[_stageIndex];
            _collected = 0;
            _stageStart = Time.time;
            foreach (var fx in stage.onEnter) RunFx(fx);
            var o = stage.objective;
            if (o != null && o.kind == ObjectiveKind.Survive) _surviveUntil = Time.time + o.seconds;
            SetWaypointForObjective();
        }

        void CompleteStage()
        {
            var stage = _active.stages[_stageIndex];
            foreach (var fx in stage.onComplete) RunFx(fx);
            ClearStageSpawns();
            AdvanceStage();
        }

        void Complete()
        {
            var d = _active;
            var st = GameRefs.PlayerState;
            if (st != null && d.rewardCash > 0) st.AddCash(d.rewardCash);
            if (d.rewardRep > 0) TotalRep += d.rewardRep;
            if (!string.IsNullOrEmpty(d.rewardWeapon)) _combat?.Pickup(d.rewardWeapon);
            _completed.Add(d.id);
            if (d.rewardRep > 0) ApplyRepPerks();
            MissionCard.Complete("Mission Passed",
                $"{d.title}   ·   +${d.rewardCash:n0}" + (d.rewardRep > 0 ? $"   ·   +{d.rewardRep} REP" : ""));
            _active = null; _stageIndex = -1; _failing = false;
            ObjectiveText = null;
            ClearWaypoint();
            ClearStageSpawns();
            UpdateGiver();
        }

        void RunFx(MissionFx fx)
        {
            switch (fx.kind)
            {
                case FxKind.Dialogue:
                    GameHUD.Post(fx.speaker, fx.line);
                    break;
                case FxKind.SetWanted:
                    WantedSystem.Instance?.ForceStars(fx.stars);
                    break;
                case FxKind.SpawnVehicle:
                    SpawnMissionVehicle(fx);
                    break;
                case FxKind.SpawnEnemies:
                    for (int i = 0; i < fx.count; i++)
                    {
                        Vector3 p = fx.pos + new Vector3(Random.Range(-fx.radius, fx.radius), 0f, Random.Range(-fx.radius, fx.radius));
                        var e = MissionEnemy.Spawn(Ground(p), fx.weapon);
                        if (e != null) _enemies.Add(e);
                    }
                    break;
                case FxKind.SpawnProp:
                    _props.Add(SpawnProp(Ground(fx.pos)));
                    break;
            }
        }

        void SpawnMissionVehicle(MissionFx fx)
        {
            var city = FindFirstObjectByType<CityGenerator>();
            if (city == null) return;
            var car = city.SpawnCar(new Vector3(fx.pos.x, 0f, fx.pos.z), fx.heading, null);
            if (car != null) _vehicles[fx.reference] = car;
        }

        Transform SpawnProp(Vector3 pos)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "MissionCash";
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.position = pos + Vector3.up * 0.8f;
            go.transform.localScale = new Vector3(0.5f, 0.3f, 0.9f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.29f, 0.88f, 0.66f) };
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        // ── Per-frame objective evaluation ───────────────────────────────────────
        void Update()
        {
            EnsureBuilt();
            if (_giverGo != null) UpdateGiver();
            if (_active == null || _failing) return;

            var stage = _active.stages[_stageIndex];
            // Fail conditions: stage time limit, or a required escort vehicle destroyed.
            if (stage.objective != null && stage.objective.timeLimit > 0f && Time.time - _stageStart > stage.objective.timeLimit)
            { Fail("Out of time", 0.4f); return; }
            if (!string.IsNullOrEmpty(stage.escortRef))
            {
                bool lost = !_vehicles.TryGetValue(stage.escortRef, out var esc) || esc == null
                            || (esc.TryGetComponent<CarHealth>(out var ch) && ch.IsDead);
                if (lost) { Fail("The vehicle was destroyed", 0.4f); return; }
            }

            var o = stage.objective;
            if (o == null) { CompleteStage(); return; }

            bool done = false;
            switch (o.kind)
            {
                case ObjectiveKind.Interact:
                case ObjectiveKind.Goto:
                    done = Near(o.pos, o.radius);
                    ObjectiveText = o.label;
                    break;
                case ObjectiveKind.EnterVehicle:
                    done = _vehicle != null && _vehicle.IsDriving &&
                           (!_vehicles.TryGetValue(o.reference, out var car) || car == null || _vehicle.CurrentCar == car);
                    ObjectiveText = o.label;
                    break;
                case ObjectiveKind.Eliminate:
                    int alive = 0;
                    foreach (var e in _enemies) if (e != null && !e.Dead) alive++;
                    done = _enemies.Count > 0 && alive == 0;
                    ObjectiveText = $"{o.label}  ({_enemies.Count - alive}/{_enemies.Count})";
                    break;
                case ObjectiveKind.Collect:
                    TickCollect(o);
                    done = _collected >= o.count;
                    ObjectiveText = $"{o.label}  ({_collected}/{o.count})";
                    break;
                case ObjectiveKind.Survive:
                    float left = Mathf.Max(0f, _surviveUntil - Time.time);
                    done = left <= 0f;
                    ObjectiveText = $"{o.label}  ({Mathf.CeilToInt(left)}s)";
                    break;
            }

            SetWaypointForObjective();
            if (done) CompleteStage();
        }

        void TickCollect(MissionObjective o)
        {
            var p = GameRefs.Player;
            if (p == null) return;
            var st = GameRefs.PlayerState;
            for (int i = 0; i < _props.Count; i++)
            {
                var t = _props[i];
                if (t == null) continue;
                Vector3 d = p.position - t.position; d.y = 0f;
                if (d.sqrMagnitude <= o.radius * o.radius)
                {
                    st?.AddCash(150);
                    Object.Destroy(t.gameObject);
                    _props[i] = null;
                    _collected++;
                }
            }
        }

        void SetWaypointForObjective()
        {
            if (_active == null) { ClearWaypoint(); return; }
            var o = _active.stages[_stageIndex].objective;
            if (o == null || !o.waypoint) { ClearWaypoint(); return; }

            Vector3 target;
            switch (o.kind)
            {
                case ObjectiveKind.EnterVehicle:
                    target = _vehicles.TryGetValue(o.reference, out var car) && car != null ? car.transform.position : o.pos;
                    break;
                case ObjectiveKind.Collect:
                    target = NearestProp(out bool any);
                    if (!any) { ClearWaypoint(); return; }
                    break;
                default:
                    target = o.pos;
                    break;
            }
            SetWaypoint(target);
        }

        Vector3 NearestProp(out bool any)
        {
            any = false;
            var p = GameRefs.Player;
            Vector3 best = Vector3.zero; float bestSq = float.MaxValue;
            foreach (var t in _props)
            {
                if (t == null) continue;
                float sq = p != null ? (t.position - p.position).sqrMagnitude : 0f;
                if (sq < bestSq) { bestSq = sq; best = t.position; any = true; }
            }
            return best;
        }

        // ── Fail / retry / abort (checkpoints = per stage) ───────────────────────
        void Fail(string reason, float delay)
        {
            if (_active == null || _failing) return;
            _failing = true;
            ClearStageSpawns();
            ClearWaypoint();
            StartCoroutine(ShowFail(reason, delay));
        }

        IEnumerator ShowFail(string reason, float delay)
        {
            yield return new WaitForSecondsRealtime(delay);
            MissionCard.Fail(_active != null ? _active.title : "", reason, RetryStage, AbortMission);
        }

        void RetryStage()
        {
            _failing = false;
            if (_active == null) return;
            ClearStageSpawns();
            _stageIndex--;      // re-enter the SAME stage (its onEnter respawns the checkpoint)
            AdvanceStage();
            GameHUD.Post("CHECKPOINT", "Retrying \u2014 " + _active.title);
        }

        void AbortMission()
        {
            _failing = false;
            string t = _active != null ? _active.title : "";
            _active = null; _stageIndex = -1;
            ObjectiveText = null;
            ClearStageSpawns(); ClearWaypoint();
            GameHUD.Post("MISSION ABORTED", t);
            UpdateGiver();
        }

        /// <summary>Rep perk (P1.6 lite): rep tiers grant bonus max health so rep finally matters.</summary>
        int _lastRepBonus = -1;
        void ApplyRepPerks()
        {
            if (_state == null) _state = GameRefs.PlayerState;
            if (_state == null) return;
            int bonus = TotalRep >= 20 ? 50 : TotalRep >= 10 ? 25 : TotalRep >= 5 ? 10 : 0;
            _state.SetRepHealthBonus(bonus);
            if (_lastRepBonus >= 0 && bonus > _lastRepBonus)
                GameHUD.Post("REP PERK", $"Reputation {TotalRep} \u2014 max health +{bonus}");
            _lastRepBonus = bonus;
        }

        void ClearStageSpawns()
        {
            _enemies.Clear();
            for (int i = 0; i < _props.Count; i++) if (_props[i] != null) Object.Destroy(_props[i].gameObject);
            _props.Clear();
        }

        bool Near(Vector3 p, float r)
        {
            var player = GameRefs.Player;
            if (player == null) return false;
            Vector3 d = player.position - p; d.y = 0f;
            return d.sqrMagnitude <= r * r;
        }

        void SetWaypoint(Vector3 p)
        {
            p = Ground(p);
            WaypointPos = p; HasWaypoint = true;
            if (_waypoint == null)
            {
                _waypoint = new GameObject("Waypoint");
                var beam = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                Object.Destroy(beam.GetComponent<Collider>());
                beam.transform.SetParent(_waypoint.transform, false);
                beam.transform.localScale = new Vector3(1.2f, 40f, 1.2f);
                beam.transform.localPosition = new Vector3(0f, 40f, 0f);
                var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.3f, 0.8f, 1f) };
                var r = beam.GetComponent<MeshRenderer>();
                r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                Blip.Attach(_waypoint, BlipKind.Waypoint, new Color(0.3f, 0.8f, 1f), "Objective");
            }
            _waypoint.transform.position = p;
        }

        void ClearWaypoint()
        {
            HasWaypoint = false;
            if (_waypoint != null) { Object.Destroy(_waypoint); _waypoint = null; }
        }

        static Vector3 Ground(Vector3 p)
        {
            if (Physics.Raycast(new Vector3(p.x, 300f, p.z), Vector3.down, out var hit, 600f))
                return new Vector3(p.x, hit.point.y + 0.1f, p.z);
            return new Vector3(p.x, 0.6f, p.z);
        }

        // ── Save / restore ───────────────────────────────────────────────────────
        public MissionSave Save() => new()
        {
            completed = new List<string>(_completed),
            activeId = _active?.id,
            stageIndex = _stageIndex,
            totalRep = TotalRep,
        };

        public void Load(MissionSave s)
        {
            EnsureBuilt();
            if (s == null) return;
            _completed.Clear();
            if (s.completed != null) foreach (var id in s.completed) _completed.Add(id);
            TotalRep = s.totalRep;
            ApplyRepPerks();
            _failing = false;
            ClearStageSpawns(); ClearWaypoint();

            // Restore an in-progress mission by re-entering its saved stage (re-runs onEnter to
            // respawn the checkpoint) — Load must NOT silently abandon an active mission.
            _active = null; _stageIndex = -1;
            if (!string.IsNullOrEmpty(s.activeId) && _defs != null)
            {
                var def = _defs.Find(d => d.id == s.activeId);
                if (def != null)
                {
                    _active = def;
                    _stageIndex = Mathf.Clamp(s.stageIndex, 0, def.stages.Count - 1) - 1;
                    AdvanceStage();
                    GameHUD.Post("MISSION RESUMED", def.title);
                }
            }
            UpdateGiver();
        }
    }
}
