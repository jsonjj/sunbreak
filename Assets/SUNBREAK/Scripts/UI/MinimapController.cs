using UnityEngine;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Drives a north-up orthographic minimap camera that follows the tracked target (player
    /// or vehicle) over the top of the world and renders into a <see cref="RenderTexture"/> the
    /// HUD displays. Creates its own RT so nothing needs to be authored in the scene.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class MinimapController : MonoBehaviour
    {
        public Transform target;
        public float height = 160f;
        public float orthoSize = 95f;
        public int textureSize = 512;

        Camera _cam;
        public RenderTexture Texture { get; private set; }

        void Awake()
        {
            _cam = GetComponent<Camera>();
            _cam.orthographic = true;
            _cam.orthographicSize = orthoSize;
            _cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f); // straight down, north-up
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = new Color(0.10f, 0.16f, 0.24f, 1f); // sea blue
            _cam.nearClipPlane = 0.3f;
            _cam.farClipPlane = height + 60f;
            _cam.allowMSAA = false;
            _cam.allowHDR = false;
            // A clean map: skip vehicle/effect clutter so it reads as roads + district land + water.
            _cam.cullingMask = ~(1 << World.CityGenerator.CarLayer);

            Texture = new RenderTexture(textureSize, textureSize, 16, RenderTextureFormat.ARGB32)
            {
                name = "MinimapRT",
                antiAliasing = 2,
                filterMode = FilterMode.Bilinear,
            };
            _cam.targetTexture = Texture;
        }

        void LateUpdate()
        {
            if (target == null) return;
            Vector3 p = target.position;
            transform.position = new Vector3(p.x, p.y + height, p.z);
        }
    }
}
