using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Missions
{
    /// <summary>A lead marker in the world. Walk up and press E to start the mission. Shows a gold
    /// beacon + map blip while its mission is available.</summary>
    public sealed class MissionGiver : Interactable
    {
        public MissionDef def;
        public MissionSystem system;

        public override string Prompt => def != null ? $"Press E — Start: {def.title}" : "Press E";
        public override bool Available => isActiveAndEnabled && system != null && system.CanStart(def);

        public override void Interact(GameObject player) => system?.Accept(def);

        public void Build()
        {
            var color = new Color(1f, 0.82f, 0.28f);
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "giver_beacon";
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.5f, 7f, 0.5f);
            beacon.transform.localPosition = new Vector3(0f, 7f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = color };
            var r = beacon.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(gameObject, BlipKind.Mission, color, Prompt);
        }
    }
}
