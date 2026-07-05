using UnityEngine;
using SUNBREAK.Missions;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>
    /// Repeatable taxi / delivery job (map icon, press E). Reuses the GPS/waypoint beam: on start it
    /// drops a destination across town and gives a soft time window — reach it (in any vehicle or on
    /// foot) for a cash + rep reward. Re-armable after a short cooldown.
    /// </summary>
    public sealed class TaxiJob : Interactable
    {
        public int rewardCash = 550;
        public int rewardRep = 1;

        bool _running;
        float _deadline, _cooldownUntil;
        Vector3 _dest;
        GameObject _destBeam;
        static Material _beaconMat;

        public override string Prompt => "Press E \u2014 Taxi / Delivery";
        public override bool Available => !_running && Time.time >= _cooldownUntil && isActiveAndEnabled;

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            if (_beaconMat == null) _beaconMat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.85f, 0.2f) };
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.45f, 6f, 0.45f);
            beacon.transform.localPosition = new Vector3(0f, 6f, 0f);
            var mr = beacon.GetComponent<MeshRenderer>(); mr.sharedMaterial = _beaconMat; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(gameObject, BlipKind.Activity, new Color(1f, 0.85f, 0.2f), "Taxi");
        }

        public override void Interact(GameObject player)
        {
            if (_running || Time.time < _cooldownUntil) return;
            _running = true;
            _dest = ActivityUtil.RoadPoint(transform.position, Random.Range(150f, 240f));
            float travel = Vector3.Distance(transform.position, _dest);
            _deadline = Time.time + travel / 7f + 22f;   // soft window (≈7 m/s + slack)
            _destBeam = ActivityUtil.Beam(_dest, new Color(1f, 0.85f, 0.2f), "Drop-off");
            NavRoute.ActivityWaypoint = _dest;
            GameHUD.Post("TAXI", "Fare on board \u2014 get to the drop-off in time!");
        }

        void Update()
        {
            if (!_running) return;
            float left = _deadline - Time.time;
            GameHUD.SetActivity($"Taxi \u2014 reach the drop-off   ·   {Mathf.CeilToInt(Mathf.Max(0f, left))}s");
            var p = GameRefs.Player;
            if (p != null && ActivityUtil.NearFlat(p.position, _dest, 7f)) Finish(true);
            else if (left <= 0f) Finish(false);
        }

        void Finish(bool ok)
        {
            _running = false;
            if (_destBeam != null) Destroy(_destBeam);
            NavRoute.ActivityWaypoint = null;
            GameHUD.SetActivity(null);
            if (ok)
            {
                ActivityUtil.Completed++;
                GameRefs.PlayerState?.AddCash(rewardCash);
                MissionSystem.Instance?.AddRep(rewardRep);
                GameHUD.Post("FARE DELIVERED", $"+${rewardCash:n0}   ·   +{rewardRep} rep");
            }
            else GameHUD.Post("TAXI FAILED", "Too slow \u2014 the fare bailed.");
            _cooldownUntil = Time.time + 18f;
        }
    }
}
