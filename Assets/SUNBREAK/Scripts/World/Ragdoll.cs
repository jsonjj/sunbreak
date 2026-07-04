using UnityEngine;
using UnityEngine.AI;

namespace SUNBREAK.World
{
    /// <summary>
    /// Simplified "ragdoll" for pooled NPCs: on death we disable the agent + freeze the animator and
    /// let the body topple as a single dynamic rigidbody (a capsule), pushed by the killing blow.
    /// Not per-bone (too heavy for a crowd) but reads as a body dropping. Reset() restores the pooled
    /// NPC for reuse.
    /// </summary>
    public static class Ragdoll
    {
        public static void Topple(GameObject root, CapsuleCollider capsule, Vector3 dir, float impulse)
        {
            if (root.TryGetComponent<NavMeshAgent>(out var ag)) ag.enabled = false;
            if (root.TryGetComponent<CharacterAnimDriver>(out var d)) d.enabled = false;
            foreach (var an in root.GetComponentsInChildren<Animator>()) an.enabled = false;

            var rb = root.GetComponent<Rigidbody>();
            if (rb == null) rb = root.AddComponent<Rigidbody>();
            rb.isKinematic = false;
            rb.mass = 60f;
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

            if (!IsFinite(dir) || dir.sqrMagnitude < 1e-4f) dir = Vector3.forward;
            dir = dir.normalized;
            rb.AddForce((dir + Vector3.up * 0.5f) * Mathf.Clamp(impulse, 2f, 40f) * 6f, ForceMode.Impulse);
            rb.AddTorque(Random.insideUnitSphere * 6f, ForceMode.Impulse);
        }

        public static void Reset(GameObject root)
        {
            if (root.TryGetComponent<Rigidbody>(out var rb)) Object.Destroy(rb);
            root.transform.rotation = Quaternion.identity;
            if (root.TryGetComponent<NavMeshAgent>(out var ag)) ag.enabled = true;
            if (root.TryGetComponent<CharacterAnimDriver>(out var d)) d.enabled = true;
            foreach (var an in root.GetComponentsInChildren<Animator>()) an.enabled = true;
        }

        static bool IsFinite(Vector3 v) =>
            !(float.IsNaN(v.x) || float.IsInfinity(v.x) || float.IsNaN(v.y) || float.IsInfinity(v.y)
              || float.IsNaN(v.z) || float.IsInfinity(v.z));
    }
}
