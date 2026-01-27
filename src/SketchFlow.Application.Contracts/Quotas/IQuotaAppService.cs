using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace SketchFlow.Quotas;

/// <summary>
/// Application service for managing user generation quotas.
/// Per spec: GET /api/generate/quota endpoint.
/// </summary>
public interface IQuotaAppService : IApplicationService
{
    /// <summary>
    /// Gets the current user's generation quota information.
    /// Automatically resets quota if it's past the reset date.
    /// Per spec: "Quota resets on first of month"
    /// </summary>
    Task<UserQuotaDto> GetQuotaAsync();

    /// <summary>
    /// Records a generation usage for the current user.
    /// Called after a successful code generation.
    /// </summary>
    Task<UserQuotaDto> RecordUsageAsync();

    /// <summary>
    /// Checks if the current user can generate (has quota remaining).
    /// </summary>
    Task<bool> CanGenerateAsync();

    /// <summary>
    /// TEST ONLY: Simulates quota expiration by setting usage and reset date to past.
    /// Feature #135 verification: "Quota resets on first of month"
    /// </summary>
    /// <param name="used">Number of generations to set as used (typically 30 to show full usage)</param>
    /// <returns>Updated quota DTO showing the state before reset</returns>
    Task<UserQuotaDto> SimulateQuotaExpirationAsync(int used);

    /// <summary>
    /// TEST ONLY: Triggers quota check and returns the result after potential reset.
    /// Feature #135 verification: After calling SimulateQuotaExpirationAsync,
    /// calling this should show quota reset to 0 used with new reset date.
    /// </summary>
    /// <returns>Quota DTO after reset check (should show 0 used if reset occurred)</returns>
    Task<UserQuotaDto> TriggerQuotaResetCheckAsync();
}
