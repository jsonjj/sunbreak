using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Base for anything the player can walk up to and use with E — shops, ATMs, mission givers.
    /// Keeps a static registry so <see cref="PlayerInteractor"/> can find the nearest one cheaply
    /// without per-frame FindObjectsByType.
    /// </summary>
    public abstract class Interactable : MonoBehaviour
    {
        public static readonly List<Interactable> All = new();
        public float range = 3.5f;

        public abstract string Prompt { get; }
        public virtual bool Available => isActiveAndEnabled;

        protected virtual void OnEnable() { All.Add(this); }
        protected virtual void OnDisable() { All.Remove(this); }

        public abstract void Interact(GameObject player);
    }
}
