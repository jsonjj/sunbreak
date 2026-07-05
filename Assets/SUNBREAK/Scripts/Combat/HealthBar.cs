using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Tiny world-space health bar that appears above a ped/cop once it's damaged, billboards to
    /// the camera, and auto-hides after a few seconds. Two unlit quads (dark track + colour fill);
    /// no per-instance Canvas, so it's cheap for a crowd.
    /// </summary>
    public sealed class HealthBar : MonoBehaviour
    {
        const float Width = 1.1f, Height = 0.16f, HideAfter = 4f;
        static Material _bgMat, _fillMat;

        Transform _fill;
        MeshRenderer _fillMr;
        float _hideAt;
        MaterialPropertyBlock _mpb;

        public static HealthBar Create(Transform owner)
        {
            var root = new GameObject("HealthBar");
            root.transform.SetParent(owner, false);
            root.transform.localPosition = new Vector3(0f, 2.05f, 0f);
            var bar = root.AddComponent<HealthBar>();
            bar.Build();
            return bar;
        }

        void Build()
        {
            EnsureMats();
            _mpb = new MaterialPropertyBlock();
            var bg = Quad("bar_bg", _bgMat, new Vector3(Width, Height, 1f), 0f);
            _fill = Quad("bar_fill", _fillMat, new Vector3(Width, Height * 0.72f, 1f), 0.01f).transform;
            _fillMr = _fill.GetComponent<MeshRenderer>();
            gameObject.SetActive(false);
        }

        GameObject Quad(string name, Material mat, Vector3 scale, float z)
        {
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            q.name = name;
            var col = q.GetComponent<Collider>(); if (col) Destroy(col);
            q.transform.SetParent(transform, false);
            q.transform.localPosition = new Vector3(0f, 0f, z);
            q.transform.localScale = scale;
            q.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return q;
        }

        public void Set(float fraction)
        {
            fraction = Mathf.Clamp01(fraction);
            if (fraction >= 0.9f) { Hide(); return; } // only show for clearly-hurt NPCs (no near-full green blob)
            gameObject.SetActive(true);
            _hideAt = Time.time + HideAfter;
            float w = Width * fraction;
            _fill.localScale = new Vector3(w, Height * 0.72f, 1f);
            _fill.localPosition = new Vector3(-(Width - w) * 0.5f, 0f, 0.01f);
            _fillMr.GetPropertyBlock(_mpb);
            _mpb.SetColor("_BaseColor", Color.Lerp(new Color(0.85f, 0.2f, 0.15f), new Color(0.35f, 0.85f, 0.35f), fraction));
            _fillMr.SetPropertyBlock(_mpb);
        }

        public void Hide() { if (this != null) gameObject.SetActive(false); }

        void LateUpdate()
        {
            if (Time.time > _hideAt) { Hide(); return; }
            var cam = Camera.main;
            if (cam != null) transform.rotation = Quaternion.LookRotation(transform.position - cam.transform.position, Vector3.up);
        }

        static void EnsureMats()
        {
            if (_bgMat != null) return;
            Shader sh = Shader.Find("Universal Render Pipeline/Unlit");
            _bgMat = new Material(sh); _bgMat.SetColor("_BaseColor", new Color(0.05f, 0.05f, 0.06f, 1f));
            _fillMat = new Material(sh); _fillMat.SetColor("_BaseColor", new Color(0.35f, 0.85f, 0.35f, 1f));
        }
    }
}
