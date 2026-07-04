using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.Missions
{
    /// <summary>
    /// The single-player lead chain: places givers across the districts (map blips), runs the
    /// objective FSM (go-to / do / reward), tracks progress, and routes rewards to the wallet.
    /// Faithful in spirit to the web mission director, condensed to a runtime FSM.
    /// </summary>
    [DefaultExecutionOrder(50)]
    public sealed class MissionSystem : MonoBehaviour
    {
        public static MissionSystem Instance { get; private set; }

        readonly List<MissionDef> _defs = new();
        readonly Dictionary<string, MissionGiver> _givers = new();
        readonly HashSet<string> _completed = new();

        MissionDef _active;
        int _objIndex, _killProgress;
        GameObject _waypoint;
        VehicleInteraction _vehicle;
        bool _built;

        public bool HasActive => _active != null;
        public string ActiveTitle => _active?.title;
        public string ObjectiveText { get; private set; }
        public bool HasWaypoint { get; private set; }
        public Vector3 WaypointPos { get; private set; }

        void Awake() { Instance = this; }
        void OnEnable() { Health.PlayerKilled += OnPlayerKill; }
        void OnDisable() { Health.PlayerKilled -= OnPlayerKill; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void EnsureBuilt()
        {
            if (_built) return;
            var player = GameRefs.Player;
            if (player == null) return;
            _built = true;
            _vehicle = player.GetComponent<VehicleInteraction>();
            BuildChain(player.position);
            SpawnGivers();
            RefreshGivers();
        }

        void BuildChain(Vector3 s)
        {
            var m1 = new MissionDef { id = "m1", title = "Shakedown", giverName = "Rosa", giverPos = s + new Vector3(6, 0, 6), reward = 1500, next = "m2" };
            m1.objectives.Add(Objective.Go("Head to the marked lot", s + new Vector3(0, 0, 48)));
            m1.objectives.Add(Objective.Kill("Rough up 3 marks", 3));
            m1.objectives.Add(Objective.Go("Lie low — return to Rosa", s + new Vector3(6, 0, 6)));
            _defs.Add(m1);

            var m2 = new MissionDef { id = "m2", title = "Grand Theft", giverName = "Val", giverPos = s + new Vector3(-42, 0, 24), reward = 3000, next = "m3" };
            m2.objectives.Add(Objective.Steal("Boost any car"));
            m2.objectives.Add(Objective.Drive("Deliver it to the docks", s + new Vector3(78, 0, -34)));
            _defs.Add(m2);

            var m3 = new MissionDef { id = "m3", title = "Heat", giverName = "Dice", giverPos = s + new Vector3(34, 0, -50), reward = 6000, next = null };
            m3.objectives.Add(Objective.Go("Roll up on the downtown plaza", s + new Vector3(24, 0, 124)));
            m3.objectives.Add(Objective.Kill("Send a message — take out 5", 5));
            _defs.Add(m3);
        }

        void SpawnGivers()
        {
            foreach (var d in _defs)
            {
                var go = new GameObject("Giver_" + d.id) { transform = { position = Ground(d.giverPos) } };
                var g = go.AddComponent<MissionGiver>();
                g.def = d; g.system = this; g.range = 4.5f;
                g.Build();
                _givers[d.id] = g;
            }
        }

        public bool CanStart(MissionDef d)
        {
            if (d == null || _active != null || _completed.Contains(d.id)) return false;
            if (d.id == "m1") return true;
            foreach (var m in _defs) if (m.next == d.id && _completed.Contains(m.id)) return true;
            return false;
        }

        public void Accept(MissionDef d)
        {
            if (!CanStart(d)) return;
            _active = d; _objIndex = 0; _killProgress = 0;
            if (_givers.TryGetValue(d.id, out var g)) g.gameObject.SetActive(false);
            ActivateObjective();
        }

        void ActivateObjective()
        {
            var o = _active.objectives[_objIndex];
            _killProgress = 0;
            ObjectiveText = o.text;
            ClearWaypoint();
            if (o.kind == ObjectiveKind.GoTo || o.kind == ObjectiveKind.Deliver) SetWaypoint(o.pos);
        }

        void OnPlayerKill(Faction f, Vector3 pos)
        {
            if (_active == null) return;
            if (_active.objectives[_objIndex].kind == ObjectiveKind.Eliminate) _killProgress++;
        }

        void Update()
        {
            EnsureBuilt();
            RefreshGivers();
            if (_active == null) return;

            var o = _active.objectives[_objIndex];
            bool done = false;
            switch (o.kind)
            {
                case ObjectiveKind.GoTo:
                    done = Near(o.pos, o.radius); ObjectiveText = o.text; break;
                case ObjectiveKind.Deliver:
                    done = Near(o.pos, o.radius) && _vehicle != null && _vehicle.IsDriving;
                    ObjectiveText = o.text; break;
                case ObjectiveKind.StealCar:
                    done = _vehicle != null && _vehicle.IsDriving; ObjectiveText = o.text; break;
                case ObjectiveKind.Eliminate:
                    done = _killProgress >= o.count;
                    ObjectiveText = $"{o.text}  ({Mathf.Min(_killProgress, o.count)}/{o.count})"; break;
            }
            if (done) Advance();
        }

        void Advance()
        {
            _objIndex++;
            if (_objIndex >= _active.objectives.Count) Complete();
            else ActivateObjective();
        }

        void Complete()
        {
            GameRefs.PlayerState?.AddCash(_active.reward);
            _completed.Add(_active.id);
            _active = null; _objIndex = 0; ObjectiveText = null;
            ClearWaypoint();
            RefreshGivers();
        }

        void RefreshGivers()
        {
            foreach (var kv in _givers)
            {
                bool show = _active == null && CanStart(kv.Value.def);
                if (kv.Value.gameObject.activeSelf != show) kv.Value.gameObject.SetActive(show);
            }
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
            _waypoint = new GameObject("Waypoint") { transform = { position = p } };
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

        // ── Save / restore ──────────────────────────────────────────────────────
        public MissionSave Save() => new()
        {
            completed = new List<string>(_completed),
            activeId = _active?.id,
            objIndex = _objIndex,
            killProgress = _killProgress,
        };

        public void Load(MissionSave s)
        {
            EnsureBuilt();
            if (s == null) return;
            _completed.Clear();
            if (s.completed != null) foreach (var id in s.completed) _completed.Add(id);
            _active = null; ClearWaypoint();
            if (!string.IsNullOrEmpty(s.activeId))
            {
                _active = _defs.Find(d => d.id == s.activeId);
                if (_active != null)
                {
                    _objIndex = Mathf.Clamp(s.objIndex, 0, _active.objectives.Count - 1);
                    ActivateObjective();
                    _killProgress = s.killProgress;
                    if (_givers.TryGetValue(_active.id, out var g)) g.gameObject.SetActive(false);
                }
            }
            RefreshGivers();
        }
    }
}
