using System;
using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;

namespace SUNBREAK.Missions
{
    public enum ObjectiveKind { GoTo, Eliminate, StealCar, Deliver }

    /// <summary>Serializable mission progress for save slots.</summary>
    [Serializable]
    public sealed class MissionSave
    {
        public List<string> completed = new();
        public string activeId;
        public int objIndex;
        public int killProgress;
    }

    /// <summary>One step of a mission (go-to / do). Faithful to the web objective flow, trimmed to
    /// the kinds we can drive with the systems we have.</summary>
    public sealed class Objective
    {
        public ObjectiveKind kind;
        public string text;
        public Vector3 pos;
        public float radius = 7f;
        public int count = 1;
        public Faction target = Faction.Civilian;

        public static Objective Go(string text, Vector3 pos, float r = 7f) =>
            new() { kind = ObjectiveKind.GoTo, text = text, pos = pos, radius = r };
        public static Objective Kill(string text, int count) =>
            new() { kind = ObjectiveKind.Eliminate, text = text, count = count };
        public static Objective Steal(string text) =>
            new() { kind = ObjectiveKind.StealCar, text = text };
        public static Objective Drive(string text, Vector3 pos, float r = 8f) =>
            new() { kind = ObjectiveKind.Deliver, text = text, pos = pos, radius = r };
    }

    /// <summary>A mission: a giver placed in the world, an ordered objective list, and a cash reward
    /// routed to the wallet on completion. <c>next</c> unlocks the following lead.</summary>
    public sealed class MissionDef
    {
        public string id;
        public string title;
        public string giverName;
        public Vector3 giverPos;
        public int reward;
        public string next;
        public List<Objective> objectives = new();
    }
}
