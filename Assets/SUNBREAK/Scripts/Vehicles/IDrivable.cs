using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.Vehicles
{
    /// <summary>
    /// Common contract for anything the player enters with F — the raycast car, the boat, and
    /// aircraft. <see cref="VehicleInteraction"/> finds the nearest registered drivable and hands
    /// control to it, so one enter/exit path works for every vehicle class.
    /// </summary>
    public interface IDrivable
    {
        Transform Transform { get; }
        /// <summary>Master enable — true while the player occupies it, false when parked.</summary>
        bool ControlEnabled { get; set; }
        /// <summary>Body collider used to measure "am I close enough to board it".</summary>
        Collider BodyCollider { get; }
        /// <summary>Lateral distance to drop the player when they exit.</summary>
        float ExitOffset { get; }
        /// <summary>True if the chase camera should trail the vehicle's heading (boats/aircraft).</summary>
        bool TrailHeading { get; }
        /// <summary>Short label for HUD / prompts.</summary>
        string VehicleName { get; }
    }

    /// <summary>Live registry of drivable vehicles (each registers on enable) so the interactor
    /// can find the nearest one without a per-frame FindObjectsByType sweep.</summary>
    public static class Drivables
    {
        public static readonly List<IDrivable> All = new();
        public static void Register(IDrivable d) { if (d != null && !All.Contains(d)) All.Add(d); }
        public static void Unregister(IDrivable d) { All.Remove(d); }
    }
}
