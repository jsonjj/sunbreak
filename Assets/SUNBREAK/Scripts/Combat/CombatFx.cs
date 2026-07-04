using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Lightweight pooled combat VFX + SFX: bullet tracers (LineRenderers), impact sparks, muzzle
    /// flash lights, and a procedural gunshot (no audio assets needed — a decaying noise burst,
    /// pitched per weapon family). Hard-capped pools, recycled — cheap during a firefight.
    /// </summary>
    public sealed class CombatFx : MonoBehaviour
    {
        public static CombatFx Instance { get; private set; }

        const int TracerPool = 24, ImpactPool = 24, AudioPool = 8;
        const float TracerLife = 0.05f, ImpactLife = 0.22f, MuzzleLife = 0.05f;

        LineRenderer[] _tracers;
        float[] _tracerOff;
        Transform[] _impacts;
        float[] _impactOff;
        Light _muzzle; float _muzzleOff;
        AudioSource[] _audio; int _audioNext;
        AudioClip _shot;
        Material _tracerMat, _impactMat;

        void Awake()
        {
            Instance = this;
            _tracerMat = Unlit(new Color(1f, 0.9f, 0.7f));
            _impactMat = Unlit(new Color(1f, 0.85f, 0.5f));

            _tracers = new LineRenderer[TracerPool];
            _tracerOff = new float[TracerPool];
            for (int i = 0; i < TracerPool; i++)
            {
                var go = new GameObject("tracer" + i);
                go.transform.SetParent(transform, false);
                var lr = go.AddComponent<LineRenderer>();
                lr.material = _tracerMat; lr.widthMultiplier = 0.06f; lr.positionCount = 2;
                lr.numCapVertices = 0; lr.enabled = false; lr.textureMode = LineTextureMode.Stretch;
                _tracers[i] = lr;
            }

            _impacts = new Transform[ImpactPool];
            _impactOff = new float[ImpactPool];
            for (int i = 0; i < ImpactPool; i++)
            {
                var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
                q.name = "impact" + i;
                var c = q.GetComponent<Collider>(); if (c) Destroy(c);
                q.GetComponent<MeshRenderer>().sharedMaterial = _impactMat;
                q.transform.SetParent(transform, false);
                q.transform.localScale = Vector3.one * 0.35f;
                q.SetActive(false);
                _impacts[i] = q.transform;
            }

            var ml = new GameObject("muzzleLight");
            ml.transform.SetParent(transform, false);
            _muzzle = ml.AddComponent<Light>();
            _muzzle.type = LightType.Point; _muzzle.range = 8f; _muzzle.intensity = 0f;
            _muzzle.color = new Color(1f, 0.9f, 0.7f);

            _shot = MakeShotClip();
            _audio = new AudioSource[AudioPool];
            for (int i = 0; i < AudioPool; i++)
            {
                var go = new GameObject("sfx" + i);
                go.transform.SetParent(transform, false);
                var a = go.AddComponent<AudioSource>();
                a.playOnAwake = false; a.spatialBlend = 1f; a.rolloffMode = AudioRolloffMode.Linear;
                a.minDistance = 6f; a.maxDistance = 120f; a.clip = _shot;
                _audio[i] = a;
            }
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            float t = Time.time;
            for (int i = 0; i < TracerPool; i++)
                if (_tracers[i].enabled && t > _tracerOff[i]) _tracers[i].enabled = false;
            for (int i = 0; i < ImpactPool; i++)
                if (_impacts[i].gameObject.activeSelf && t > _impactOff[i]) _impacts[i].gameObject.SetActive(false);
            if (_muzzle.intensity > 0f && t > _muzzleOff) _muzzle.intensity = 0f;
        }

        int _tracerNext;
        public void Tracer(Vector3 from, Vector3 to, Color color)
        {
            var lr = _tracers[_tracerNext];
            _tracerNext = (_tracerNext + 1) % TracerPool;
            lr.startColor = lr.endColor = color;
            lr.SetPosition(0, from); lr.SetPosition(1, to);
            lr.enabled = true;
            _tracerOff[System.Array.IndexOf(_tracers, lr)] = Time.time + TracerLife;
        }

        int _impactNext;
        public void Impact(Vector3 point, Vector3 normal)
        {
            var tr = _impacts[_impactNext];
            int idx = _impactNext;
            _impactNext = (_impactNext + 1) % ImpactPool;
            tr.position = point + normal * 0.02f;
            tr.rotation = Quaternion.LookRotation(-normal);
            tr.gameObject.SetActive(true);
            _impactOff[idx] = Time.time + ImpactLife;
        }

        public void Muzzle(Vector3 pos, Color color)
        {
            _muzzle.transform.position = pos;
            _muzzle.color = color; _muzzle.intensity = 3.5f;
            _muzzleOff = Time.time + MuzzleLife;
        }

        public void Sfx(string kind, Vector3 pos)
        {
            if (_audio == null) return;
            var a = _audio[_audioNext];
            _audioNext = (_audioNext + 1) % AudioPool;
            a.transform.position = pos;
            a.pitch = kind switch { "pistol" => 1.15f, "smg" => 1.35f, "shotgun" => 0.7f, "rifle" => 0.95f, "melee" => 1.6f, _ => 1f };
            a.volume = kind == "melee" ? 0.35f : 0.55f;
            a.Play();
        }

        static AudioClip MakeShotClip()
        {
            int rate = 44100; int len = rate / 8; // ~0.125s
            var data = new float[len];
            var rng = new System.Random(7);
            for (int i = 0; i < len; i++)
            {
                float env = Mathf.Exp(-i / (len * 0.18f));
                data[i] = (float)(rng.NextDouble() * 2 - 1) * env * 0.9f;
            }
            var clip = AudioClip.Create("shot", len, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        static Material Unlit(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            m.SetColor("_BaseColor", c);
            return m;
        }
    }
}
