using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Missions;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>A collectible hidden package (clone of the cash-pickup pattern): walk over it for a
    /// cash + rep reward and a running counter. Does not respawn. Its found-state persists per save
    /// via a position-hash id, so loading a save hides the ones you already grabbed.</summary>
    public sealed class HiddenPackage : MonoBehaviour
    {
        public int cash = 400;
        public int rep = 1;
        public float radius = 1.8f;

        public static int Total, Found;
        public static readonly HashSet<int> FoundIds = new();
        static readonly List<HiddenPackage> All = new();
        static Material _mat;

        GameObject _marker;
        bool _taken;
        int _id;

        /// <summary>All collected package ids (save).</summary>
        public static List<int> FoundList() => new(FoundIds);
        /// <summary>Restore the collected set + hide those packages already spawned.</summary>
        public static void LoadFound(List<int> ids)
        {
            FoundIds.Clear();
            if (ids != null) foreach (var i in ids) FoundIds.Add(i);
            Found = FoundIds.Count;
            foreach (var p in All) if (p != null) p.ApplyFound();
        }

        void ApplyFound()
        {
            if (!_taken && FoundIds.Contains(_id)) { _taken = true; if (_marker != null) _marker.SetActive(false); var b = GetComponent<Blip>(); if (b != null) Destroy(b); }
        }

        void Start()
        {
            Total++;
            All.Add(this);
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            _id = Mathf.RoundToInt(transform.position.x) * 100000 + Mathf.RoundToInt(transform.position.z);

            if (_mat == null) _mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.9f, 0.75f, 0.2f) };
            _marker = new GameObject("package");
            _marker.transform.SetParent(transform, false);
            _marker.transform.localPosition = new Vector3(0f, 0.7f, 0f);
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(box.GetComponent<Collider>());
            box.name = "box"; box.transform.SetParent(_marker.transform, false);
            box.transform.localScale = new Vector3(0.4f, 0.32f, 0.4f);
            box.GetComponent<MeshRenderer>().sharedMaterial = _mat;
            Blip.Attach(gameObject, BlipKind.Activity, new Color(0.9f, 0.75f, 0.2f), "Package");
            ApplyFound(); // already collected in a loaded save?
        }

        void OnDestroy() { All.Remove(this); }

        void Update()
        {
            if (_taken || _marker == null) return;
            _marker.transform.Rotate(0f, 90f * Time.deltaTime, 0f, Space.Self);
            _marker.transform.localPosition = new Vector3(0f, 0.7f + Mathf.Sin(Time.time * 2.5f) * 0.08f, 0f);

            var player = GameRefs.Player;
            if (player == null) return;
            Vector3 d = player.position - transform.position; d.y = 0f;
            if (d.sqrMagnitude > radius * radius) return;

            _taken = true;
            FoundIds.Add(_id);
            Found++;
            GameRefs.PlayerState?.AddCash(cash);
            MissionSystem.Instance?.AddRep(rep);
            GameHUD.Post("HIDDEN PACKAGE", $"{Found}/{Total} found   ·   +${cash:n0}   ·   +{rep} rep");
            _marker.SetActive(false);
            var blip = GetComponent<Blip>();
            if (blip != null) Destroy(blip);
        }
    }
}
