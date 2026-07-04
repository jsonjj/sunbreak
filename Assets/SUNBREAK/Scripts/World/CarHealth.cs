using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    /// <summary>
    /// Vehicle health + destruction. Takes damage from gunfire (IDamageable) and hard collisions,
    /// escalates smoke → fire, and on death EXPLODES (flash + AoE damage + ped-fear) into a blackened
    /// burnt wreck. Applies to the player car, traffic, and cop cars.
    /// </summary>
    public sealed class CarHealth : MonoBehaviour, IDamageable
    {
        public float max = 150f;
        float _cur;
        bool _dead;
        float _lastCollisionT;

        ParticleSystem _smoke;
        Light _fire;
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        public Faction Faction => Faction.Neutral;
        public bool IsDead => _dead;

        void Awake()
        {
            _cur = max;
            BuildFx();
        }

        public void ApplyDamage(in DamageInfo info)
        {
            if (_dead) return;
            _cur -= info.amount;
            UpdateFx();
            if (_cur <= 0f) Explode(info.point);
        }

        void OnCollisionEnter(Collision c)
        {
            if (_dead) return;
            float v = c.relativeVelocity.magnitude;
            if (v < 9f || Time.time - _lastCollisionT < 0.25f) return;
            _lastCollisionT = Time.time;
            _cur -= (v - 9f) * 3.5f;
            UpdateFx();
            if (_cur <= 0f) Explode(c.contacts.Length > 0 ? c.contacts[0].point : transform.position + Vector3.up);
        }

        void UpdateFx()
        {
            float f = _cur / max;
            if (_smoke != null)
            {
                var em = _smoke.emission;
                bool on = f < 0.55f;
                if (on && !_smoke.isPlaying) _smoke.Play();
                else if (!on && _smoke.isPlaying) _smoke.Stop();
                em.rateOverTime = f < 0.25f ? 26f : 12f;
                var main = _smoke.main;
                main.startColor = f < 0.25f ? new Color(0.1f, 0.1f, 0.1f, 0.7f) : new Color(0.5f, 0.5f, 0.5f, 0.5f);
            }
            if (_fire != null) _fire.enabled = f < 0.22f;
        }

        void Explode(Vector3 at)
        {
            _dead = true;

            // Flash + burst light.
            CombatFx.Instance?.Impact(at, Vector3.up);
            var flashGo = new GameObject("boom");
            flashGo.transform.position = at;
            var flash = flashGo.AddComponent<Light>();
            flash.type = LightType.Point; flash.color = new Color(1f, 0.7f, 0.3f); flash.range = 22f; flash.intensity = 8f;
            Destroy(flashGo, 0.25f);

            // AoE damage to nearby actors + player + ped fear.
            ThreatBus.Explosion(at);
            foreach (var col in Physics.OverlapSphere(at, 7f, ~0, QueryTriggerInteraction.Ignore))
            {
                var d = col.GetComponentInParent<IDamageable>();
                if (d != null && !ReferenceEquals(d, this) && !d.IsDead)
                    d.ApplyDamage(new DamageInfo { amount = 55f, point = at, dir = Vector3.up, impulse = 6f, fromPlayer = false });
            }
            var st = GameRefs.PlayerState;
            if (st != null && GameRefs.Player != null && (GameRefs.Player.position - at).sqrMagnitude < 7f * 7f)
                st.Damage(45f);

            // Become a burnt wreck.
            var mpb = new MaterialPropertyBlock();
            foreach (var r in GetComponentsInChildren<MeshRenderer>())
            {
                r.GetPropertyBlock(mpb);
                mpb.SetColor(BaseColor, new Color(0.08f, 0.07f, 0.06f));
                r.SetPropertyBlock(mpb);
            }
            if (TryGetComponent<ArcadeCarController>(out var arcade)) arcade.controlEnabled = false;
            if (TryGetComponent<TrafficCar>(out var traffic)) traffic.enabled = false;
            if (TryGetComponent<CopCar>(out var cop)) cop.enabled = false;

            if (_smoke != null) { var em = _smoke.emission; em.rateOverTime = 24f; var main = _smoke.main; main.startColor = new Color(0.08f, 0.08f, 0.08f, 0.75f); if (!_smoke.isPlaying) _smoke.Play(); }
            if (_fire != null) { _fire.enabled = true; _fire.intensity = 3.5f; }
        }

        void Update()
        {
            if (_fire != null && _fire.enabled)
                _fire.intensity = (_dead ? 3.5f : 2.2f) + Mathf.Sin(Time.time * 18f) * 0.7f; // flicker
        }

        void BuildFx()
        {
            var go = new GameObject("smoke");
            go.transform.SetParent(transform, false);
            go.transform.localPosition = new Vector3(0f, 1.1f, 0f);
            _smoke = go.AddComponent<ParticleSystem>();
            var main = _smoke.main;
            main.startLifetime = 1.6f; main.startSpeed = 1.4f; main.startSize = 1.1f; main.maxParticles = 50;
            main.startColor = new Color(0.5f, 0.5f, 0.5f, 0.5f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = _smoke.emission; em.rateOverTime = 12f;
            var sh = _smoke.shape; sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = 0.4f;
            var col = _smoke.colorOverLifetime; col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0.6f, 0f), new GradientAlphaKey(0f, 1f) });
            col.color = grad;
            var r = _smoke.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = ParticleMat();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _smoke.Stop();

            var fireGo = new GameObject("fire");
            fireGo.transform.SetParent(transform, false);
            fireGo.transform.localPosition = new Vector3(0f, 0.9f, 0f);
            _fire = fireGo.AddComponent<Light>();
            _fire.type = LightType.Point; _fire.range = 9f; _fire.color = new Color(1f, 0.55f, 0.2f); _fire.intensity = 2.2f;
            _fire.enabled = false;
        }

        static Material _particleMat;
        static Material ParticleMat()
        {
            if (_particleMat != null) return _particleMat;
            var m = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = 3000;
            m.SetColor("_BaseColor", new Color(0.4f, 0.4f, 0.4f, 0.5f));
            _particleMat = m;
            return m;
        }
    }
}
