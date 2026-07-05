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
    /// Car radio with multiple genre STATIONS. Each station is a small playlist (procedural synth
    /// genres + any CC0 mp3s dropped in StreamingAssets/Radio). N cycles stations (with a short
    /// station-ID stinger), H toggles power. Plays only while driving; routed through the music bus.
    /// </summary>
    public sealed class CarRadio : MonoBehaviour
    {
        public VehicleInteraction vehicle;

        sealed class Station { public string name; public readonly List<AudioClip> tracks = new(); public int track = -1; }

        AudioSource _src;
        readonly List<Station> _stations = new();
        AudioClip _stinger;
        int _station;
        bool _on = true, _stingerPlaying;
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
            _stinger = MakeStinger();

            // Procedural genre stations.
            var neon = new Station { name = "Neon Nights 100.5" };
            neon.tracks.Add(Synth("Nightdrive", 112f, ChordsAmFCG(), 0.005f, saw: true));
            neon.tracks.Add(Synth("Afterburn", 120f, ChordsEmCGD(), 0.006f, saw: true));
            _stations.Add(neon);

            var gold = new Station { name = "Sol Gold 88" };
            gold.tracks.Add(Synth("Golden Hour", 92f, ChordsCAmFG(), 0.0f, saw: false));
            gold.tracks.Add(Synth("Boulevard", 84f, ChordsAmFCG(), 0.0f, saw: false));
            _stations.Add(gold);

            var pulse = new Station { name = "Pulse FM 24" };
            pulse.tracks.Add(Synth("Overdrive", 128f, ChordsEmCGD(), 0.008f, saw: true));
            _stations.Add(pulse);

            // Any CC0 mp3s become a "Classics" station.
            string dir = Path.Combine(Application.streamingAssetsPath, "Radio");
            if (Directory.Exists(dir))
            {
                var classics = new Station { name = "SUN Classics" };
                var files = Directory.GetFiles(dir, "*.mp3");
                System.Array.Sort(files);
                foreach (var f in files)
                {
                    using var req = UnityWebRequestMultimedia.GetAudioClip("file://" + f, AudioType.MPEG);
                    yield return req.SendWebRequest();
                    if (req.result != UnityWebRequest.Result.Success) continue;
                    var clip = DownloadHandlerAudioClip.GetContent(req);
                    if (clip == null) continue;
                    clip.name = Path.GetFileNameWithoutExtension(f);
                    classics.tracks.Add(clip);
                }
                if (classics.tracks.Count > 0) _stations.Add(classics);
            }
        }

        void Update()
        {
            if (Driving)
            {
                if (_toggle.WasPressedThisFrame()) _on = !_on;
                if (_next.WasPressedThisFrame() && _on) NextStation();
            }

            if (Driving && _on && _src != null && _stations.Count > 0)
            {
                _src.volume = GameAudio.Instance != null ? GameAudio.Instance.Music : 0.7f;
                if (Time.time >= _trackEnd)
                {
                    if (_stingerPlaying) { _stingerPlaying = false; PlayTrack(_stations[_station], advance: true); }
                    else AdvanceTrack();
                }
                else if (!_src.isPlaying) _src.UnPause();
            }
            else if (_src != null && _src.isPlaying) _src.Pause();
        }

        void NextStation()
        {
            if (_stations.Count == 0) return;
            _station = (_station + 1) % _stations.Count;
            // Station-ID stinger first, then the station's music.
            _src.clip = _stinger;
            _src.Play();
            _stingerPlaying = true;
            _trackEnd = Time.time + Mathf.Max(0.5f, _stinger.length);
            NowPlaying = _stations[_station].name;
        }

        void AdvanceTrack()
        {
            if (_stations.Count == 0) return;
            PlayTrack(_stations[_station], advance: true);
        }

        void PlayTrack(Station s, bool advance)
        {
            if (s.tracks.Count == 0) return;
            if (advance) s.track = (s.track + 1) % s.tracks.Count;
            if (s.track < 0) s.track = 0;
            _src.clip = s.tracks[s.track];
            _src.Play();
            _trackEnd = Time.time + Mathf.Max(2f, _src.clip.length);
            NowPlaying = $"{s.name} · {_src.clip.name}";
        }

        // ── Procedural genre tracks ──────────────────────────────────────────────
        static float[][] ChordsAmFCG() => new[] { new[] { 220f, 261.63f, 329.63f }, new[] { 174.61f, 220f, 261.63f }, new[] { 261.63f, 329.63f, 392f }, new[] { 196f, 246.94f, 293.66f } };
        static float[][] ChordsCAmFG() => new[] { new[] { 261.63f, 329.63f, 392f }, new[] { 220f, 261.63f, 329.63f }, new[] { 174.61f, 220f, 261.63f }, new[] { 196f, 246.94f, 293.66f } };
        static float[][] ChordsEmCGD() => new[] { new[] { 164.81f, 196f, 246.94f }, new[] { 261.63f, 329.63f, 392f }, new[] { 196f, 246.94f, 293.66f }, new[] { 146.83f, 220f, 293.66f } };

        static AudioClip Synth(string name, float bpm, float[][] chords, float detune, bool saw)
        {
            const int rate = 44100;
            float eighth = 60f / bpm / 2f;
            int stepLen = Mathf.RoundToInt(eighth * rate);
            int[] arp = { 0, 1, 2, 1 };
            int steps = chords.Length * arp.Length;
            int len = steps * stepLen;
            var d = new float[len];
            for (int c = 0; c < chords.Length; c++)
            {
                float bass = chords[c][0] * 0.5f;
                for (int s = 0; s < arp.Length; s++)
                {
                    int start = (c * arp.Length + s) * stepLen;
                    float lead = chords[c][arp[s]];
                    for (int i = 0; i < stepLen; i++)
                    {
                        float t = i / (float)rate;
                        float env = Mathf.Exp(-i / (stepLen * 0.5f));
                        float v;
                        if (saw)
                        {
                            float p = lead * t; float sw = 2f * (p - Mathf.Floor(p + 0.5f));
                            float p2 = lead * (1f + detune) * t; float sw2 = 2f * (p2 - Mathf.Floor(p2 + 0.5f));
                            v = (sw * 0.5f + sw2 * 0.5f) * 0.22f;
                        }
                        else
                        {
                            v = (Mathf.Sin(lead * t * Mathf.PI * 2f) * 0.7f + Mathf.Sin(lead * 2f * t * Mathf.PI * 2f) * 0.2f) * 0.2f;
                        }
                        float bt = (start + i) / (float)rate;
                        float b = Mathf.Sin(bt * bass * Mathf.PI * 2f);
                        d[start + i] = v * env + b * 0.16f;
                    }
                }
            }
            var clip = AudioClip.Create(name, len, 1, rate, false);
            clip.SetData(d, 0);
            return clip;
        }

        // A ~1s station-ID jingle: quick rising arpeggio into a bright chord.
        static AudioClip MakeStinger()
        {
            const int rate = 44100; int len = rate; var d = new float[len];
            float[] notes = { 392f, 523.25f, 659.25f, 783.99f };
            for (int n = 0; n < notes.Length; n++)
            {
                int start = n * (rate / 6);
                for (int i = 0; i < rate / 5 && start + i < len; i++)
                {
                    float env = Mathf.Exp(-i / (rate / 12f));
                    d[start + i] += Mathf.Sin(notes[n] * (start + i) / (float)rate * Mathf.PI * 2f) * env * 0.25f;
                }
            }
            var clip = AudioClip.Create("station-id", len, 1, rate, false);
            clip.SetData(d, 0);
            return clip;
        }
    }
}
