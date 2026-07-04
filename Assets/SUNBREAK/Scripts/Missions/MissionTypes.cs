using System;
using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.Missions
{
    public enum ObjectiveKind { Interact, Goto, EnterVehicle, Eliminate, Collect, Survive }
    public enum FxKind { Dialogue, SetWanted, SpawnVehicle, SpawnEnemies, SpawnProp }

    /// <summary>A stage onEnter/onComplete side-effect (dialogue, setWanted, spawns) — ported from the
    /// canon mission JSON action list.</summary>
    public sealed class MissionFx
    {
        public FxKind kind;
        public string speaker, line;      // Dialogue
        public int stars;                 // SetWanted
        public string reference, model;   // SpawnVehicle / SpawnEnemies / SpawnProp
        public Vector3 pos;
        public float heading;             // SpawnVehicle
        public int count = 1;             // SpawnEnemies
        public float radius = 6f;         // SpawnEnemies
        public string weapon = "pistol_9mm";

        public static MissionFx Say(string speaker, string line) => new() { kind = FxKind.Dialogue, speaker = speaker, line = line };
        public static MissionFx Wanted(int stars) => new() { kind = FxKind.SetWanted, stars = stars };
        public static MissionFx Car(string reference, string model, Vector3 pos, float heading) =>
            new() { kind = FxKind.SpawnVehicle, reference = reference, model = model, pos = pos, heading = heading };
        public static MissionFx Enemies(string reference, Vector3 pos, int count, float radius, string weapon) =>
            new() { kind = FxKind.SpawnEnemies, reference = reference, pos = pos, count = count, radius = radius, weapon = weapon };
        public static MissionFx Prop(string reference, Vector3 pos) =>
            new() { kind = FxKind.SpawnProp, reference = reference, pos = pos };
    }

    public sealed class MissionObjective
    {
        public ObjectiveKind kind;
        public string label;
        public Vector3 pos;
        public float radius = 3f;
        public int count = 1;
        public string reference;   // EnterVehicle vehicle ref / Eliminate enemy ref / Collect prop ref
        public float seconds;      // Survive
        public bool waypoint = true;
    }

    public sealed class MissionStage
    {
        public string title;
        public readonly List<MissionFx> onEnter = new();
        public readonly List<MissionFx> onComplete = new();
        public MissionObjective objective;
    }

    /// <summary>A canon mission: a giver (lead), a linear stage list, and rewards. <c>next</c> unlocks
    /// the following mission.</summary>
    public sealed class MissionDef
    {
        public string id, title, giver, description;
        public Vector3 startPos;
        public float startRadius = 4.5f;
        public readonly List<MissionStage> stages = new();
        public int rewardCash, rewardRep;
        public string rewardWeapon, next;
    }

    [Serializable]
    public sealed class MissionSave
    {
        public List<string> completed = new();
        public string activeId;
        public int stageIndex;
        public int totalRep;
    }
}
