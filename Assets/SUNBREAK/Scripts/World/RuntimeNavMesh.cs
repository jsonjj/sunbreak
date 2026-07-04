using UnityEngine;
using Unity.AI.Navigation;

namespace SUNBREAK.World
{
    /// <summary>
    /// Bakes the walkable NavMesh at runtime over the procedurally-generated city (the geometry
    /// only exists after CityGenerator runs, so an edit-time bake isn't possible). Runs in Start,
    /// after CityGenerator.Awake has built the terrain/roads/buildings. The terrain collider is the
    /// walkable ground; building box colliders carve out obstacles. Also callable from the editor
    /// capture tool so peds appear in screenshots.
    /// </summary>
    [RequireComponent(typeof(NavMeshSurface))]
    public sealed class RuntimeNavMesh : MonoBehaviour
    {
        public bool bakeOnStart = true;
        NavMeshSurface _surface;

        void Awake() { _surface = GetComponent<NavMeshSurface>(); }

        void Start() { if (bakeOnStart) Bake(); }

        public void Bake()
        {
            if (_surface == null) _surface = GetComponent<NavMeshSurface>();
            if (_surface == null) return;
            _surface.BuildNavMesh();
        }
    }
}
