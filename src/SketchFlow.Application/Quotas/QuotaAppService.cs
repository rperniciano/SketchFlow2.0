using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Volo.Abp.Domain.Repositories;

namespace SketchFlow.Quotas;

/// <summary>
/// Application service for managing user generation quotas.
/// Per spec: Feature #135 - "Quota resets on first of month"
/// </summary>
[Authorize]
public class QuotaAppService : SketchFlowAppService, IQuotaAppService
{
    private readonly IRepository<UserQuota, Guid> _quotaRepository;

    public QuotaAppService(IRepository<UserQuota, Guid> quotaRepository)
    {
        _quotaRepository = quotaRepository;
    }

    /// <summary>
    /// Gets the current user's generation quota information.
    /// Automatically resets quota if it's past the reset date.
    /// Per spec: "Quota resets on first of month"
    /// </summary>
    public async Task<UserQuotaDto> GetQuotaAsync()
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException("User must be authenticated");

        var quota = await GetOrCreateQuotaAsync(userId);

        // Check and reset if needed (Feature #135: Quota resets on first of month)
        var wasReset = quota.CheckAndResetIfNeeded();
        if (wasReset)
        {
            Logger.LogInformation("Quota reset for user {UserId}. New reset date: {ResetDate}",
                userId, quota.QuotaResetDate);
            await _quotaRepository.UpdateAsync(quota, autoSave: true);
        }

        return MapToDto(quota);
    }

    /// <summary>
    /// Records a generation usage for the current user.
    /// Called after a successful code generation.
    /// </summary>
    public async Task<UserQuotaDto> RecordUsageAsync()
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException("User must be authenticated");

        var quota = await GetOrCreateQuotaAsync(userId);

        // IncrementUsage will also check and reset if needed
        quota.IncrementUsage();
        await _quotaRepository.UpdateAsync(quota, autoSave: true);

        Logger.LogInformation("Recorded generation usage for user {UserId}. Used: {Used}/{Limit}",
            userId, quota.MonthlyGenerationsUsed, quota.GetTotalLimit());

        return MapToDto(quota);
    }

    /// <summary>
    /// Checks if the current user can generate (has quota remaining).
    /// </summary>
    public async Task<bool> CanGenerateAsync()
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException("User must be authenticated");

        var quota = await GetOrCreateQuotaAsync(userId);

        // Check and reset if needed first
        var wasReset = quota.CheckAndResetIfNeeded();
        if (wasReset)
        {
            await _quotaRepository.UpdateAsync(quota, autoSave: true);
        }

        return quota.CanGenerate();
    }

    /// <summary>
    /// Gets the existing quota for a user, or creates a new one if it doesn't exist.
    /// </summary>
    private async Task<UserQuota> GetOrCreateQuotaAsync(Guid userId)
    {
        var quota = await _quotaRepository.FindAsync(q => q.UserId == userId);

        if (quota == null)
        {
            Logger.LogInformation("Creating new quota record for user {UserId}", userId);
            quota = new UserQuota(GuidGenerator.Create(), userId);
            await _quotaRepository.InsertAsync(quota, autoSave: true);
        }

        return quota;
    }

    /// <summary>
    /// Maps a UserQuota entity to a UserQuotaDto.
    /// </summary>
    private static UserQuotaDto MapToDto(UserQuota quota)
    {
        return new UserQuotaDto
        {
            Used = quota.MonthlyGenerationsUsed,
            Limit = quota.GetTotalLimit(),
            ResetDate = quota.QuotaResetDate,
            IsGuest = false
        };
    }

    /// <summary>
    /// TEST ONLY: Simulates quota expiration by setting usage and reset date to past.
    /// Feature #135 verification: "Quota resets on first of month"
    /// </summary>
    public async Task<UserQuotaDto> SimulateQuotaExpirationAsync(int used)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException("User must be authenticated");

        var quota = await GetOrCreateQuotaAsync(userId);

        // Set usage to specified amount (typically 30 to show full usage)
        quota.SetUsageForTesting(used);

        // Set reset date to last month (so it will trigger reset on next check)
        var lastMonth = DateTime.UtcNow.AddMonths(-1);
        var pastResetDate = new DateTime(lastMonth.Year, lastMonth.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        quota.SetResetDateForTesting(pastResetDate);

        await _quotaRepository.UpdateAsync(quota, autoSave: true);

        Logger.LogInformation(
            "[Feature #135 Test] Set quota for user {UserId}: Used={Used}, ResetDate={ResetDate} (past)",
            userId, quota.MonthlyGenerationsUsed, quota.QuotaResetDate);

        return MapToDto(quota);
    }

    /// <summary>
    /// TEST ONLY: Triggers quota check and returns the result after potential reset.
    /// Feature #135 verification: After calling SimulateQuotaExpirationAsync,
    /// calling this should show quota reset to 0 used with new reset date.
    /// </summary>
    public async Task<UserQuotaDto> TriggerQuotaResetCheckAsync()
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException("User must be authenticated");

        var quota = await GetOrCreateQuotaAsync(userId);

        Logger.LogInformation(
            "[Feature #135 Test] Before reset check - User {UserId}: Used={Used}, ResetDate={ResetDate}",
            userId, quota.MonthlyGenerationsUsed, quota.QuotaResetDate);

        // This is the key Feature #135 functionality - automatic reset on first of month
        var wasReset = quota.CheckAndResetIfNeeded();

        if (wasReset)
        {
            Logger.LogInformation(
                "[Feature #135 Test] QUOTA RESET TRIGGERED for user {UserId}! New state: Used={Used}, ResetDate={ResetDate}",
                userId, quota.MonthlyGenerationsUsed, quota.QuotaResetDate);
            await _quotaRepository.UpdateAsync(quota, autoSave: true);
        }
        else
        {
            Logger.LogInformation(
                "[Feature #135 Test] No reset needed for user {UserId}. Current: Used={Used}, ResetDate={ResetDate}",
                userId, quota.MonthlyGenerationsUsed, quota.QuotaResetDate);
        }

        return MapToDto(quota);
    }
}
