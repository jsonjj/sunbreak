using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Networking;
using SUNBREAK.Vehicles;

namespace SUNBREAK.Audio
{
    /// <summary>
    /// Car radio: a built-in synth station plus CC0 tracks streamed from StreamingAssets/Radio at
    /// runtime. Plays only while driving; H toggles on/off, N skips. Routed through the music bus.
    /// </summary>
    public sealed class CarRadio : MonoBehaviour
    {
        public VehicleInteraction vehicle;

        AudioSource _src;
        readonly List<AudioClip> _tracks = new();
        int _index = -1;
        bool _on = true;
        float _trackEnd;
        InputAction _toggle, _next;

        public bool On => _on;
        public string NowPlaying { get; private set; } = "";
        public bool Driving => vehicle != null && vehicle.IsDriving;

        void Awake()
        {
            _toggle = new InputAction("Radio", InputActionType.Button, "<Keyboard>/h");
            _next = new InputAction("RadioNext", InputActionType.Button, "<Keyboard>/n");
        }
        void OnEnable() { _toggle.Enable(); _next.Enable(); }
        void OnDisable() { _toggle.Disable(); _next.Disable(); }

        IEnumerator Start()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.spatialBlend = 0f; _src.loop = false; _src.playOnAwake = false;

            var synth = MakeSynthTrack();
            synth.name = "SUNBREAK FM · Nightdrive";
            _tracks.Add(synth);

            string dir = Path.Combine(Application.streamingAssetsPath, "Radio");
            if (Directory.Exists(dir))
            {
                var files = Directory.GetFiles(dir, "*.mp3");
                System.Array.Sort(files);
                int n = 1;
                foreach (var f in files)
                {
                    using var req = UnityWebRequestMultimedia.GetAudioClip("file://" + f, AudioType.MPEG);
                    yield return req.SendWebRequest();
                    if (req.result != UnityWebRequest.Result.Success) continue;
                    var clip = DownloadHandlerAudioClip.GetContent(req);
                    if (clip == null) continue;
                    clip.name = $"SUN Classics · {n++}";
                    _tracks.Add(clip);
                }
            }
        }

        void Update()
        {
            if (Driving)
            {
                if (_toggle.WasPressedThisFrame()) _on = !_on;
                if (_next.WasPressedThisFrame() && _on) Advance();
            }

            if (Driving && _on && _src != null)
            {
                _src.volume = GameAudio.Instance != null ? GameAudio.Instance.Music : 0.7f;
                if (_index < 0 || Time.time >= _trackEnd) Advance();
                else if (!_src.isPlaying) _src.UnPause();
            }
            else if (_src != null && _src.isPlaying)
            {
                _src.Pause();
            }
        }

        void Advance()
        {
            if (_tracks.Count == 0) return;
            _index = (_index + 1) % _tracks.Count;
            _src.clip = _tracks[_index];
            NowPlaying = _src.clip.name;
            _trackEnd = Time.time + Mathf.Max(2f, _src.clip.length);
            _src.Play();
        }

        // A short synthwave loop: an arpeggiated i–VI–III–VII progression over a sine bass.
        static AudioClip MakeSynthTrack()
        {
            const int rate = 44100;
            float bpm = 112f;
            float eighth = 60f / bpm / 2f;
            int stepLen = Mathf.RoundToInt(eighth * rate);
            // Am, F, C, G triads (Hz).
            float[][] chords =
            {
                new[] { 220.00f, 261.63f, 329.63f },
                new[] { 174.61f, 220.00f, 261.63f },
                new[] { 261.63f, 329.63f, 392.00f },
                new[] { 196.00f, 246.94f, 293.66f },
            };
            int[] arp = { 0, 1, 2, 1 }; // up-down
            int steps = chords.Length * arp.Length; // 16 eighths
            int len = steps * stepLen;
            var d = new float[len];

            for (int c = 0; c < chords.Length; c++)
            {
                float bass = chords[c][0] * 0.5f;
                for (int s = 0; s < arp.Length; s++)
                {
                    int stepIdx = c * arp.Length + s;
                    int start = stepIdx * stepLen;
                    float lead = chords[c][arp[s]];
                    for (int i = 0; i < stepLen; i++)
                    {
                        float t = i / (float)rate;
                        float env = Mathf.Exp(-i / (stepLen * 0.5f));
                        // lead: detuned saws; bass: sine held across the whole bar.
                        float p = lead * t;
                        float saw = 2f * (p - Mathf.Floor(p + 0.5f));
                        float p2 = lead * 1.005f * t;
                        float saw2 = 2f * (p2 - Mathf.Floor(p2 + 0.5f));
                        float bt = (start + i) / (float)rate;
                        float b = Mathf.Sin(bt * bass * Mathf.PI * 2f);
                        d[start + i] = (saw * 0.5f + saw2 * 0.5f) * env * 0.22f + b * 0.16f;
                    }
                }
            }
            var clip = AudioClip.Create("synth", len, 1, rate, false);
            clip.SetData(d, 0);
            return clip;
        }
    }
}
