using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>A tiny flock of seagulls wheeling over the marina/coast — pure atmosphere. Each is a
    /// cheap white "V" that orbits, bobs, banks, and flaps. No physics, no colliders.</summary>
    public sealed class Seagulls : MonoBehaviour
    {
        public Vector3 center = new Vector3(-250f, 0f, 495f);
        public float radius = 70f;
        public float altitude = 32f;
        public int count = 7;

        Transform[] _gulls;
        Transform[] _wingL, _wingR;
        float[] _phase, _speed, _rad, _alt, _flap;

        void Start()
        {
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.95f, 0.95f, 0.97f) };
            _gulls = new Transform[count]; _wingL = new Transform[count]; _wingR = new Transform[count];
            _phase = new float[count]; _speed = new float[count]; _rad = new float[count]; _alt = new float[count]; _flap = new float[count];
            for (int i = 0; i < count; i++)
            {
                var g = new GameObject("Gull" + i).transform;
                g.SetParent(transform, false);
                _wingL[i] = Wing(g, mat, -1);
                _wingR[i] = Wing(g, mat, 1);
                _gulls[i] = g;
                _phase[i] = Random.value * Mathf.PI * 2f;
                _speed[i] = Random.Range(0.12f, 0.22f);
                _rad[i] = radius * Random.Range(0.4f, 1f);
                _alt[i] = altitude + Random.Range(-6f, 10f);
                _flap[i] = Random.Range(4f, 7f);
            }
        }

        static Transform Wing(Transform parent, Material mat, int side)
        {
            var w = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var col = w.GetComponent<Collider>(); if (col) Destroy(col);
            w.name = side < 0 ? "wingL" : "wingR";
            w.transform.SetParent(parent, false);
            w.transform.localScale = new Vector3(1.4f, 0.06f, 0.35f);
            w.transform.localPosition = new Vector3(side * 0.8f, 0f, 0f);
            w.transform.localRotation = Quaternion.Euler(0f, 0f, side * -12f);
            w.GetComponent<MeshRenderer>().sharedMaterial = mat;
            w.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return w.transform;
        }

        void Update()
        {
            float t = Time.time;
            for (int i = 0; i < _gulls.Length; i++)
            {
                float a = _phase[i] + t * _speed[i];
                float x = center.x + Mathf.Cos(a) * _rad[i];
                float z = center.z + Mathf.Sin(a) * _rad[i];
                float y = _alt[i] + Mathf.Sin(t * 0.5f + _phase[i]) * 3f;
                Vector3 pos = new Vector3(x, y, z);
                Vector3 fwd = new Vector3(-Mathf.Sin(a), 0f, Mathf.Cos(a)); // tangent to the circle
                _gulls[i].SetPositionAndRotation(pos, Quaternion.LookRotation(fwd, Vector3.up) * Quaternion.Euler(0f, 0f, 18f));
                float flap = Mathf.Sin(t * _flap[i] + _phase[i]) * 22f;
                _wingL[i].localRotation = Quaternion.Euler(0f, 0f, 12f + flap);
                _wingR[i].localRotation = Quaternion.Euler(0f, 0f, -12f - flap);
            }
        }
    }
}
