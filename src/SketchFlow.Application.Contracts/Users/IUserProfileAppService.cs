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
    /// Updates the current authenticated user's profile information.
    /// </summary>
    /// <param name="input">The updated profile data.</param>
    /// <returns>The result including updated profile and email change status.</returns>
    Task<UpdateUserProfileResultDto> UpdateUserProfileAsync(UpdateUserProfileInput input);

    /// <summary>
    /// Resends the email verification link to the current user.
    /// </summary>
    /// <returns>A message indicating the result.</returns>
    Task<ResendEmailVerificationResultDto> ResendEmailVerificationAsync();

    /// <summary>
    /// Changes the current user's password.
    /// </summary>
    /// <param name="input">The current and new password information.</param>
    /// <returns>Result indicating success or failure with message.</returns>
    Task<ChangePasswordResultDto> ChangePasswordAsync(ChangePasswordInput input);
}

/// <summary>
/// Input DTO for updating user profile.
/// </summary>
public class UpdateUserProfileInput
{
    /// <summary>
    /// The user's display name.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// The user's surname.
    /// </summary>
    public string? Surname { get; set; }

    /// <summary>
    /// The user's new email address. If different from current, triggers re-verification.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// The user's cursor color for real-time collaboration (hex color code).
    /// </summary>
    public string CursorColor { get; set; } = "#6366f1";

    /// <summary>
    /// The user's default stroke color for drawing (hex color code).
    /// </summary>
    public string DefaultStrokeColor { get; set; } = "#000000";

    /// <summary>
    /// The user's default stroke thickness for drawing (2, 4, or 8 pixels).
    /// </summary>
    public int DefaultStrokeThickness { get; set; } = 4;
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

/// <summary>
/// Result DTO for profile update operation.
/// </summary>
public class UpdateUserProfileResultDto
{
    /// <summary>
    /// The updated user profile.
    /// </summary>
    public UserProfileDto? Profile { get; set; }

    /// <summary>
    /// Whether the email was changed and requires re-verification.
    /// </summary>
    public bool EmailChanged { get; set; }

    /// <summary>
    /// Message about email re-verification if applicable.
    /// </summary>
    public string? Message { get; set; }
}

/// <summary>
/// Input DTO for changing password.
/// </summary>
public class ChangePasswordInput
{
    /// <summary>
    /// The user's current password (required for verification).
    /// </summary>
    public string CurrentPassword { get; set; } = string.Empty;

    /// <summary>
    /// The new password to set.
    /// </summary>
    public string NewPassword { get; set; } = string.Empty;

    /// <summary>
    /// Confirmation of the new password (must match NewPassword).
    /// </summary>
    public string ConfirmPassword { get; set; } = string.Empty;
}

/// <summary>
/// Result DTO for the change password operation.
/// </summary>
public class ChangePasswordResultDto
{
    /// <summary>
    /// Whether the password change was successful.
    /// </summary>
    public bool Success { get; set; }

    /// <summary>
    /// A message describing the result of the operation.
    /// </summary>
    public string Message { get; set; } = string.Empty;
}
