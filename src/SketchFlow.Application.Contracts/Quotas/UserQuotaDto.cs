using System;

namespace SketchFlow.Quotas;

/// <summary>
/// DTO for user generation quota information.
/// Per spec: "X / Y generations remaining" display in code panel.
/// </summary>
public class UserQuotaDto
{
    /// <summary>
    /// Number of generations used in the current month.
    /// </summary>
    public int Used { get; set; }

    /// <summary>
    /// Maximum number of generations allowed (monthly limit + bonus).
    /// Per spec: Free authenticated users have 30 per month.
    /// </summary>
    public int Limit { get; set; }

    /// <summary>
    /// The date when the quota will reset (first of next month).
    /// </summary>
    public DateTime ResetDate { get; set; }

    /// <summary>
    /// Whether this is a guest user (different limits apply).
    /// Per spec: Guests have 5 per session, authenticated have 30 per month.
    /// </summary>
    public bool IsGuest { get; set; }

    /// <summary>
    /// Number of generations remaining (calculated: Limit - Used).
    /// </summary>
    public int Remaining => Math.Max(0, Limit - Used);

    /// <summary>
    /// Whether the user has reached their limit.
    /// </summary>
    public bool IsLimitReached => Used >= Limit;

    /// <summary>
    /// Whether to show the "running low" warning.
    /// Per spec: "Warning at 5 remaining"
    /// </summary>
    public bool ShowWarning => Remaining <= 5 && Remaining > 0;
}
