using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Tiny growable mesh accumulator used by the runtime city generator to combine many
    /// road/water/ground quads into a handful of draw calls (one mesh instead of thousands
    /// of GameObjects). Supports vertex colours and 32-bit indices for large meshes.
    /// </summary>
    public sealed class MeshBuilder
    {
        readonly List<Vector3> _v = new();
        readonly List<Vector3> _n = new();
        readonly List<Color32> _c = new();
        readonly List<Vector2> _uv = new();
        readonly List<int> _t = new();

        public int VertexCount => _v.Count;

        public void AddVertex(Vector3 pos, Vector3 normal, Color32 color, Vector2 uv)
        {
            _v.Add(pos); _n.Add(normal); _c.Add(color); _uv.Add(uv);
        }

        public void AddTriangle(int a, int b, int c) { _t.Add(a); _t.Add(b); _t.Add(c); }

        /// <summary>Add a flat horizontal quad (CCW seen from +Y) at height y.</summary>
        public void AddQuadXZ(float x0, float z0, float x1, float z1, float y, Color32 col, Vector2 uvTile)
        {
            int i = _v.Count;
            var up = Vector3.up;
            AddVertex(new Vector3(x0, y, z0), up, col, new Vector2(0, 0));
            AddVertex(new Vector3(x1, y, z0), up, col, new Vector2(uvTile.x, 0));
            AddVertex(new Vector3(x1, y, z1), up, col, new Vector2(uvTile.x, uvTile.y));
            AddVertex(new Vector3(x0, y, z1), up, col, new Vector2(0, uvTile.y));
            AddTriangle(i, i + 2, i + 1);
            AddTriangle(i, i + 3, i + 2);
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name };
            if (_v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(_v);
            m.SetNormals(_n);
            m.SetColors(_c);
            m.SetUVs(0, _uv);
            m.SetTriangles(_t, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
