using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>Interior exit door — press E to return to the street.</summary>
    public sealed class ShopExitDoor : Interactable
    {
        public EnterableShop shop;
        public override string Prompt => "Press E — Exit to street";
        public override void Interact(GameObject player) => shop?.ExitToStreet();

        void Start()
        {
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "exitBeacon";
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.3f, 2.2f, 0.3f);
            beacon.transform.localPosition = new Vector3(0f, 2.2f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.4f, 1f, 0.55f) };
            var r = beacon.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
