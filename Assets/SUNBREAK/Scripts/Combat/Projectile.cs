using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Kinematic projectile for the RPG (impact) + grenade (timed fuse), ported from the web
    /// build's projectile system: integrate velocity + gravity + drag, detonate on impact or fuse,
    /// then apply an AoE blast to peds/cops (IDamageable) and the player (PlayerState). Player-owned
    /// blasts on people feed the contact-driven wanted formula via Health.ApplyDamage.
    /// </summary>
    public sealed class Projectile : MonoBehaviour
    {
        Vector3 _vel;
        float _gravity, _drag, _radius, _damage, _impulse, _dieAt, _fuseAt;
        bool _timed;
        GameObject _owner;

        public static void Spawn(Vector3 pos, Vector3 dir, WeaponSpec w, GameObject owner)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "Projectile";
            go.transform.position = pos;
            go.transform.localScale = Vector3.one * 0.3f;
            var col = go.GetComponent<Collider>(); if (col) Destroy(col);
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.5f, 0.2f) };

            var p = go.AddComponent<Projectile>();
            p._vel = dir.normalized * w.projectile.speed;
            p._gravity = w.projectile.gravity;
            p._drag = w.projectile.drag;
            p._radius = w.projectile.radius;
            p._damage = w.damage;
            p._impulse = w.impulse;
            p._owner = owner;
            p._dieAt = Time.time + 6f;
            p._timed = w.projectile.fuseMs > 0f;
            if (p._timed) p._fuseAt = Time.time + w.projectile.fuseMs / 1000f;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _vel.y += _gravity * dt;
            if (_drag > 0f) _vel *= Mathf.Clamp01(1f - _drag * dt);

            Vector3 from = transform.position;
            Vector3 to = from + _vel * dt;
            if (Physics.Raycast(from, (to - from).normalized, out var hit, (to - from).magnitude + 0.05f, ~0, QueryTriggerInteraction.Ignore)
                && (_owner == null || (hit.transform != _owner.transform && !hit.transform.IsChildOf(_owner.transform))))
            {
                transform.position = hit.point;
                if (!_timed) { Detonate(); return; }
            }
            transform.position = to;

            if (_timed && Time.time >= _fuseAt) { Detonate(); return; }
            if (Time.time >= _dieAt) Detonate();
        }

        void Detonate()
        {
            Vector3 c = transform.position;
            CombatFx.Instance?.Impact(c, Vector3.up);
            CombatFx.Instance?.Muzzle(c, new Color(1f, 0.6f, 0.2f));
            CombatFx.Instance?.Sfx("shotgun", c);
            ThreatBus.Explosion(c);
            bool fromPlayer = _owner != null && _owner.CompareTag("Player");

            foreach (var col in Physics.OverlapSphere(c, _radius, ~0, QueryTriggerInteraction.Ignore))
            {
                float d = Vector3.Distance(c, col.transform.position);
                float mul = Mathf.Clamp01(1f - d / _radius);
                float dmg = _damage * mul;
                var idmg = col.GetComponentInParent<IDamageable>();
                if (idmg != null && !idmg.IsDead)
                {
                    idmg.ApplyDamage(new DamageInfo
                    {
                        amount = dmg, point = col.transform.position, dir = (col.transform.position - c).normalized,
                        impulse = _impulse, fromPlayer = fromPlayer, attacker = _owner,
                    });
                    continue;
                }
                var ps = col.GetComponentInParent<PlayerState>();
                if (ps != null) ps.Damage(dmg);
            }
            Destroy(gameObject);
        }
    }
}
