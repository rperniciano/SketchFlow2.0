using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace SketchFlow.Users;

/// <summary>
/// Application service for managing user profile operations.
/// </summary>
public interface IUserProfileAppService : IApplicationService
{
    /// <summary>
    /// Gets the current authenticated user's profile information.
    /// </summary>
    /// <returns>The user's profile data including email verification status.</returns>
    Task<UserProfileDto> GetCurrentUserProfileAsync();

    /// <summary>
    /// Resends the email verification link to the current user.
    /// </summary>
    /// <returns>A message indicating the result.</returns>
    Task<ResendEmailVerificationResultDto> ResendEmailVerificationAsync();
}

/// <summary>
/// Result DTO for the resend email verification operation.
/// </summary>
public class ResendEmailVerificationResultDto
{
    /// <summary>
    /// A message describing the result of the operation.
    /// </summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>
    /// Whether the operation was successful.
    /// </summary>
    public bool Success { get; set; }
}
