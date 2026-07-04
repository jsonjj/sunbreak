# SUNBREAK — Art Asset Attribution

All third-party art in this folder is **CC0 (public domain)** unless noted otherwise.
CC0 requires no attribution, but credit is given here as good practice and to record
provenance for license audits. Re-verify each source page before shipping.

## Environment

### HDRI sky (sky + image-based lighting / reflections)
- **Kloofendal 48d Partly Cloudy (Pure Sky), 4K** — Poly Haven
  - License: **CC0** — https://polyhaven.com/license
  - Source: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
  - File: `Environment/HDRI/kloofendal_puresky_2k.hdr` (2K kept for repo leanness; 4K was ~20 MB)
  - Download: `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr`

### PBR ground textures (road + sidewalk)
- **Asphalt025A (2K)** — ambientCG
  - License: **CC0** — https://ambientcg.com/
  - Source / download: `https://ambientcg.com/get?file=Asphalt025A_2K-JPG.zip`
  - Maps kept: Color, NormalGL, AmbientOcclusion (downsized to 1K; Roughness/Displacement dropped — unused — for repo leanness)
  - Folder: `Environment/Textures/Asphalt025A/`
- **PavingStones128 (2K)** — ambientCG
  - License: **CC0** — https://ambientcg.com/
  - Source / download: `https://ambientcg.com/get?file=PavingStones128_2K-JPG.zip`
  - Folder: `Environment/Textures/PavingStones128/`

## Kits — Kenney (www.kenney.nl), all **CC0**

Support by crediting 'Kenney' or 'www.kenney.nl' (not required). Trimmed to the FBX
format + `Textures/colormap.png` (kits ship OBJ/GLB/previews too; removed to keep the
project lean). All Kenney kits share a single `colormap.png` palette atlas per kit, so
the whole family is texel-consistent — this is the cohesion backbone of the hero street.

- **Car Kit (3.1)** — `Kits/Kenney/kenney_car-kit/` — https://kenney.nl/assets/car-kit
  - Drivable body + separate wheels (sedan, sports, suv, taxi, police, van, truck…).
- **City Kit (Commercial) (2.1)** — `Kits/Kenney/kenney_city-kit-commercial/` — https://kenney.nl/assets/city-kit-commercial
  - Complete buildings `building-a…n`, `building-skyscraper-a…e`, awnings/overhangs.
- **City Kit (Roads)** — `Kits/Kenney/kenney_city-kit-roads/` — https://kenney.nl/assets/city-kit-roads
  - Streetlights (`light-square`, `light-curved`…), cones, barriers, road pieces.
- **Nature Kit** — `Kits/Kenney/kenney_nature-kit/` — https://kenney.nl/assets/nature-kit
  - Trimmed to palms only (`tree_palm*`) for the coastal Santa Vista look.
  - NOTE: Kenney nature models are **vertex-coloured** (no texture atlas); rendered via
    `Art/Shaders/VertexColorLit` so their baked colours show under URP.

## Kits — Quaternius (OPTIONAL / not yet imported)

- **Downtown City Mega Kit** — Quaternius — **CC0**
  - Source: https://quaternius.com/packs/downtowncitymegakit.html
  - Download page: https://quaternius.itch.io/downtown-city-megakit (itch.io)
  - STATUS: **awaiting manual download.** The itch.io download is behind a
    "name your price" button / session and can't be fetched head-less. It is *not*
    needed for Slice 1 — the hero street is built from the cohesive Kenney family
    (mixing a second kit family would fight the cohesion goal). Drop the unzipped
    kit into `Kits/Quaternius/` if you want it available for later districts.

## First-party
- All SUNBREAK code, generated meshes, procedural materials, and the world blueprint
  (`Scripts/World/Geography.cs`) are original to this project.
