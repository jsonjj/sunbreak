using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Missions;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    public enum ActivityKind { Bounty, Rampage }

    /// <summary>
    /// A repeatable free-roam activity surfaced as a map icon (press E to start). Reuses
    /// <see cref="MissionEnemy"/> for spawns and the wallet/rep economy for rewards:
    ///  • Bounty  — eliminate a tough target crew.
    ///  • Rampage — survive + clear escalating waves.
    /// Re-armable after a short cooldown.
    /// </summary>
    public sealed class Activity : Interactable
    {
        public ActivityKind kind = ActivityKind.Bounty;
        public int rewardCash = 900;
        public int rewardRep = 2;

        readonly List<MissionEnemy> _enemies = new();
        bool _running;
        int _wave;
        int _waves = 3;
        float _cooldownUntil;
        GameObject _beacon;

        string Title => kind == ActivityKind.Bounty ? "Bounty" : "Rampage";
        Color Tint => kind == ActivityKind.Bounty ? new Color(1f, 0.55f, 0.2f) : new Color(1f, 0.3f, 0.3f);

        public override string Prompt => $"Press E \u2014 {Title}";
        public override bool Available => !_running && Time.time >= _cooldownUntil && isActiveAndEnabled;

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            _beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(_beacon.GetComponent<Collider>());
            _beacon.transform.SetParent(transform, false);
            _beacon.transform.localScale = new Vector3(0.45f, 6f, 0.45f);
            _beacon.transform.localPosition = new Vector3(0f, 6f, 0f);
            _beacon.GetComponent<MeshRenderer>().sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = Tint };
            _beacon.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(gameObject, BlipKind.Activity, Tint, Title);
        }

        public override void Interact(GameObject player)
        {
            if (_running || Time.time < _cooldownUntil) return;
            _running = true; _wave = 0;
            if (kind == ActivityKind.Bounty)
            {
                GameHUD.Post("BOUNTY", "Eliminate the target crew.");
                SpawnWave(2, "rifle_carbine");
            }
            else
            {
                GameHUD.Post("RAMPAGE", $"Survive {_waves} waves!");
                SpawnWave(3, "smg_vector");
            }
        }

        void Update()
        {
            if (!_running) return;
            int alive = 0;
            foreach (var e in _enemies) if (e != null && !e.Dead) alive++;
            if (alive > 0) return;

            if (kind == ActivityKind.Rampage && _wave < _waves - 1)
            {
                _wave++;
                GameHUD.Post("RAMPAGE", $"Wave {_wave + 1} / {_waves}");
                SpawnWave(3 + _wave, "smg_vector");
            }
            else
            {
                Finish();
            }
        }

        void SpawnWave(int count, string weapon)
        {
            _enemies.Clear();
            var player = GameRefs.Player;
            Vector3 c = player != null ? player.position : transform.position;
            for (int i = 0; i < count; i++)
            {
                float a = i / (float)count * Mathf.PI * 2f;
                Vector3 p = c + new Vector3(Mathf.Cos(a) * 12f, 0f, Mathf.Sin(a) * 12f);
                var e = MissionEnemy.Spawn(p, weapon);
                if (e != null) _enemies.Add(e);
            }
            if (_enemies.Count == 0) Finish(); // crowd not ready — bail cleanly
        }

        void Finish()
        {
            _running = false;
            _enemies.Clear();
            GameRefs.PlayerState?.AddCash(rewardCash);
            MissionSystem.Instance?.AddRep(rewardRep);
            GameHUD.Post(Title.ToUpperInvariant() + " COMPLETE", $"+${rewardCash:n0}   ·   +{rewardRep} rep");
            _cooldownUntil = Time.time + 40f;
        }
    }
}
