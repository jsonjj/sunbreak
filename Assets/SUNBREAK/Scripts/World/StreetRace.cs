using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Missions;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>
    /// A repeatable street race (map icon, press E). Lays out a loop of checkpoint-ring gates on the
    /// road grid and gives a timer; the GPS beam points to the next gate. Clear them all in time for a
    /// cash + rep reward. Re-armable after a cooldown.
    /// </summary>
    public sealed class StreetRace : Interactable
    {
        public int rewardCash = 1600;
        public int rewardRep = 3;
        static readonly Color RaceColor = new Color(1f, 0.3f, 0.9f);

        bool _running;
        int _cp;
        readonly List<Vector3> _cps = new();
        float _limit, _startT, _cooldownUntil;
        GameObject _ring;
        static Material _beaconMat;

        public override string Prompt => "Press E \u2014 Street Race";
        public override bool Available => !_running && Time.time >= _cooldownUntil && isActiveAndEnabled;

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            if (_beaconMat == null) _beaconMat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = RaceColor };
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.45f, 6f, 0.45f);
            beacon.transform.localPosition = new Vector3(0f, 6f, 0f);
            var mr = beacon.GetComponent<MeshRenderer>(); mr.sharedMaterial = _beaconMat; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(gameObject, BlipKind.Activity, RaceColor, "Race", "R");
        }

        public override void Interact(GameObject player)
        {
            if (_running || Time.time < _cooldownUntil) return;
            BuildRoute();
            if (_cps.Count < 2) { _cps.Clear(); return; }
            _running = true; _cp = 0;
            _limit = _cps.Count * 13f;
            _startT = Time.time;
            ShowCheckpoint();
            GameHUD.Post("STREET RACE", $"Hit all {_cps.Count} checkpoints before time runs out!");
        }

        void BuildRoute()
        {
            _cps.Clear();
            const float g = 64f;
            Vector3 c = transform.position;
            c.x = Mathf.Round(c.x / g) * g; c.z = Mathf.Round(c.z / g) * g;
            // A rectangular lap in grid blocks; add a checkpoint every 2 blocks.
            Vector2Int[] legs = { new(1, 0), new(0, 1), new(-1, 0), new(0, -1) };
            int[] lens = { 4, 3, 4, 3 };
            Vector3 cur = c;
            int block = 0;
            for (int leg = 0; leg < legs.Length; leg++)
            {
                for (int s = 0; s < lens[leg]; s++)
                {
                    cur += new Vector3(legs[leg].x, 0f, legs[leg].y) * g;
                    block++;
                    if (block % 2 != 0) continue;
                    if (Mathf.Abs(cur.x) > Geography.CITY_HALF || Mathf.Abs(cur.z) > Geography.CITY_HALF) continue;
                    if (Geography.IsWaterPadded(cur.x, cur.z, 8f) || Geography.DistrictAt(cur.x, cur.z) == null) continue;
                    _cps.Add(new Vector3(cur.x, CityGenerator.GroundY(cur.x, cur.z) + 0.1f, cur.z));
                }
            }
        }

        void ShowCheckpoint()
        {
            if (_ring != null) Destroy(_ring);
            if (_cp >= _cps.Count) return;
            _ring = ActivityUtil.Beam(_cps[_cp], RaceColor, $"CP {_cp + 1}/{_cps.Count}");
            ActivityUtil.Ring(_ring, RaceColor);
            NavRoute.ActivityWaypoint = _cps[_cp];
        }

        void Update()
        {
            if (!_running) return;
            float left = _limit - (Time.time - _startT);
            GameHUD.SetActivity($"Race \u2014 CP {_cp + 1}/{_cps.Count}   ·   {Mathf.CeilToInt(Mathf.Max(0f, left))}s");
            var p = GameRefs.Player;
            if (p != null && _cp < _cps.Count && ActivityUtil.NearFlat(p.position, _cps[_cp], 8f))
            {
                _cp++;
                if (_cp >= _cps.Count) { Finish(true); return; }
                ShowCheckpoint();
                GameHUD.Post("CHECKPOINT", $"{_cp}/{_cps.Count}");
            }
            else if (left <= 0f) Finish(false);
        }

        void Finish(bool ok)
        {
            _running = false;
            if (_ring != null) Destroy(_ring);
            NavRoute.ActivityWaypoint = null;
            GameHUD.SetActivity(null);
            if (ok)
            {
                ActivityUtil.Completed++;
                GameRefs.PlayerState?.AddCash(rewardCash);
                MissionSystem.Instance?.AddRep(rewardRep);
                GameHUD.Post("RACE WON", $"+${rewardCash:n0}   ·   +{rewardRep} rep");
            }
            else GameHUD.Post("RACE FAILED", "Out of time.");
            _cooldownUntil = Time.time + 25f;
        }
    }
}
