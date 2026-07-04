using System.IO;
using UnityEditor;

namespace SUNBREAK.EditorTools.Kits
{
    /// <summary>
    /// Import settings for the CC0 Kenney kits under <c>Art/Kits/Kenney/</c>. Materials are
    /// imported as <c>None</c> on purpose — every Kenney kit shares ONE <c>colormap.png</c>
    /// atlas (or, for the Nature kit, bakes colour into vertices), so the world generator
    /// (<see cref="KitLibrary"/>) assigns a single shared, texel-consistent material per kit
    /// at build time. That deterministic, import-order-independent path is what keeps the
    /// hero street cohesive. We also strip cameras/lights/animation the kits don't need.
    /// </summary>
    public sealed class KenneyKitPostprocessor : AssetPostprocessor
    {
        const string KenneyRoot = "/Art/Kits/Kenney/";

        void OnPreprocessModel()
        {
            if (assetPath.IndexOf(KenneyRoot, System.StringComparison.Ordinal) < 0) return;
            if (assetImporter is not ModelImporter importer) return;

            // Colormap-atlas kits (car/city) share ONE material assigned by KitLibrary → import
            // none. The Nature kit has no atlas (per-material flat colours), so let Unity build
            // URP materials from the FBX so palms keep their authored green/brown.
            importer.materialImportMode = HasColormap(assetPath)
                ? ModelImporterMaterialImportMode.None
                : ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importBlendShapes = false;
            importer.importCameras = false;
            importer.importLights = false;
            importer.importVisibility = false;
            importer.importAnimation = false;
            importer.importConstraints = false;
            importer.importAnimatedCustomProperties = false;
            importer.addCollider = false;
            importer.animationType = ModelImporterAnimationType.None;
            // Kenney models read cleanly at file scale; the generator rescales each instance
            // to its target footprint/height, so exact import scale doesn't matter.
            importer.useFileScale = true;
        }

        static bool HasColormap(string path)
        {
            int idx = path.IndexOf("/Models/FBX format/", System.StringComparison.Ordinal);
            if (idx < 0) return false;
            return File.Exists(path.Substring(0, idx) + "/Models/FBX format/Textures/colormap.png");
        }
    }
}
