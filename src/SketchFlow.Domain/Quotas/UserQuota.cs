using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace SketchFlow.Quotas;

/// <summary>
/// Tracks the generation quota for an authenticated user.
/// Per spec: Free authenticated users have 30 generations per month.
/// The quota resets on the first of each month.
/// </summary>
public class UserQuota : AuditedAggregateRoot<Guid>
{
    /// <summary>
    /// The ID of the user this quota belongs to.
    /// </summary>
    public Guid UserId { get; private set; }

    /// <summary>
    /// Number of generations used in the current month.
    /// Per spec: Resets to 0 on the first of each month.
    /// </summary>
    public int MonthlyGenerationsUsed { get; private set; }

    /// <summary>
    /// The date when the quota will reset (first of next month).
    /// Per spec: "Quota resets on first of month"
    /// </summary>
    public DateTime QuotaResetDate { get; private set; }

    /// <summary>
    /// Any bonus generations granted to the user (e.g., promotions).
    /// </summary>
    public int BonusGenerations { get; private set; }

    /// <summary>
    /// The monthly limit for free users.
    /// Per spec: Free authenticated: 30 generations per month
    /// </summary>
    public const int FreeUserMonthlyLimit = 30;

    protected UserQuota()
    {
        // Required for EF Core
    }

    public UserQuota(Guid id, Guid userId) : base(id)
    {
        UserId = userId;
        MonthlyGenerationsUsed = 0;
        BonusGenerations = 0;
        QuotaResetDate = CalculateNextResetDate(DateTime.UtcNow);
    }

    /// <summary>
    /// Increments the usage count by 1.
    /// Should be called after a successful generation.
    /// </summary>
    public void IncrementUsage()
    {
        // First check if we need to reset
        CheckAndResetIfNeeded();

        MonthlyGenerationsUsed++;
    }

    /// <summary>
    /// Gets the total number of generations available (monthly limit + bonus).
    /// </summary>
    public int GetTotalLimit()
    {
        return FreeUserMonthlyLimit + BonusGenerations;
    }

    /// <summary>
    /// Gets the number of generations remaining.
    /// </summary>
    public int GetRemaining()
    {
        CheckAndResetIfNeeded();
        return Math.Max(0, GetTotalLimit() - MonthlyGenerationsUsed);
    }

    /// <summary>
    /// Checks if the user can generate (has quota remaining).
    /// </summary>
    public bool CanGenerate()
    {
        CheckAndResetIfNeeded();
        return MonthlyGenerationsUsed < GetTotalLimit();
    }

    /// <summary>
    /// Adds bonus generations to the user's quota.
    /// </summary>
    public void AddBonusGenerations(int amount)
    {
        if (amount < 0)
        {
            throw new ArgumentException("Bonus amount cannot be negative.", nameof(amount));
        }
        BonusGenerations += amount;
    }

    /// <summary>
    /// Checks if the current date is past the reset date and resets the quota if needed.
    /// Per spec: "Quota resets on first of month"
    /// </summary>
    public bool CheckAndResetIfNeeded()
    {
        var now = DateTime.UtcNow;

        if (now >= QuotaResetDate)
        {
            // Reset the quota
            MonthlyGenerationsUsed = 0;
            QuotaResetDate = CalculateNextResetDate(now);
            return true; // Quota was reset
        }

        return false; // No reset needed
    }

    /// <summary>
    /// Manually resets the quota (for testing or admin purposes).
    /// </summary>
    public void Reset()
    {
        MonthlyGenerationsUsed = 0;
        QuotaResetDate = CalculateNextResetDate(DateTime.UtcNow);
    }

    /// <summary>
    /// Calculates the next reset date (first of next month at midnight UTC).
    /// </summary>
    private static DateTime CalculateNextResetDate(DateTime fromDate)
    {
        // If we're on the first of the month and it's exactly midnight,
        // the reset date should be next month's first
        var nextMonth = fromDate.Month == 12
            ? new DateTime(fromDate.Year + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            : new DateTime(fromDate.Year, fromDate.Month + 1, 1, 0, 0, 0, DateTimeKind.Utc);

        return nextMonth;
    }

    /// <summary>
    /// Sets the reset date to a past date (for testing purposes).
    /// </summary>
    internal void SetResetDateForTesting(DateTime resetDate)
    {
        QuotaResetDate = resetDate;
    }

    /// <summary>
    /// Sets the usage count (for testing purposes).
    /// </summary>
    internal void SetUsageForTesting(int used)
    {
        MonthlyGenerationsUsed = used;
    }
}
