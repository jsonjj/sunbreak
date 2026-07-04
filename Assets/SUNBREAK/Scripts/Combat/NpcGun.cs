using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Shared NPC-fire path (armed peds + cops) — the Unity equivalent of the web build's
    /// <c>enemyFireAt</c>/<c>enemyMelee</c>. Rolls a distance-scaled accuracy against line-of-sight,
    /// damages the player through the SAME PlayerState the player uses (so player death/respawn just
    /// works), and plays the cosmetic tracer/muzzle/SFX. Returns whether a shot actually went off.
    /// </summary>
    public static class NpcGun
    {
        public static bool FireAt(GameObject shooter, Transform player, PlayerState state, string weaponId, float accuracy)
        {
            if (player == null || state == null || state.IsDead) return false;
            var w = Weapons.Get(weaponId);

            Vector3 eye = shooter.transform.position + Vector3.up * 1.5f;
            Vector3 tp = player.position + Vector3.up * 1.0f;
            Vector3 delta = tp - eye;
            float dist = delta.magnitude;
            if (dist > w.rangeM || dist < 0.5f) return false;
            Vector3 dir = delta / dist;

            CombatFx.Instance?.Muzzle(eye + dir * 0.4f, w.muzzle);
            CombatFx.Instance?.Tracer(eye + dir * 0.4f, tp, w.tracer);
            CombatFx.Instance?.Sfx(w.sfx, eye);

            // Line of sight: a solid hit before the player means the shot is blocked.
            if (Physics.Raycast(eye, dir, out var hit, dist - 0.4f, ~0, QueryTriggerInteraction.Ignore))
            {
                var t = hit.collider.transform;
                if (t != player && !t.IsChildOf(player) && !t.CompareTag("Player"))
                    return true; // fired, but a wall/body is in the way → miss
            }

            float hitChance = Mathf.Clamp01(accuracy * Mathf.Lerp(1.25f, 0.4f, Mathf.InverseLerp(4f, w.rangeM, dist)));
            if (Random.value <= hitChance)
            {
                float dmg = w.pellets > 1 ? w.damage * w.pellets * 0.5f : w.damage;
                state.Damage(dmg);
            }
            return true;
        }

        public static bool Melee(GameObject attacker, Transform player, PlayerState state, float dmg, float reach)
        {
            if (player == null || state == null || state.IsDead) return false;
            Vector3 a = attacker.transform.position; a.y = 0f;
            Vector3 p = player.position; p.y = 0f;
            if ((a - p).sqrMagnitude > reach * reach) return false;
            state.Damage(dmg);
            CombatFx.Instance?.Sfx("melee", attacker.transform.position);
            return true;
        }
    }
}
