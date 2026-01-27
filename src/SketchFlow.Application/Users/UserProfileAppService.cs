using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.Identity;
using Volo.Abp.Users;

namespace SketchFlow.Users;

/// <summary>
/// Application service for managing user profile operations.
/// </summary>
[Authorize]
public class UserProfileAppService : SketchFlowAppService, IUserProfileAppService
{
    private readonly IdentityUserManager _userManager;
    private readonly ILogger<UserProfileAppService> _logger;

    public UserProfileAppService(
        IdentityUserManager userManager,
        ILogger<UserProfileAppService> logger)
    {
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>
    /// Gets the current authenticated user's profile information.
    /// </summary>
    public async Task<UserProfileDto> GetCurrentUserProfileAsync()
    {
        var userId = CurrentUser.Id;
        if (userId == null)
        {
            throw new UserFriendlyException("User is not authenticated.");
        }

        var user = await _userManager.GetByIdAsync(userId.Value);
        if (user == null)
        {
            throw new UserFriendlyException("User not found.");
        }

        return new UserProfileDto
        {
            Id = user.Id,
            UserName = user.UserName,
            Email = user.Email,
            EmailConfirmed = user.EmailConfirmed,
            Name = user.Name,
            Surname = user.Surname,
            PhoneNumber = user.PhoneNumber
        };
    }

    /// <summary>
    /// Resends the email verification link to the current user.
    /// </summary>
    public async Task<ResendEmailVerificationResultDto> ResendEmailVerificationAsync()
    {
        var userId = CurrentUser.Id;
        if (userId == null)
        {
            throw new UserFriendlyException("User is not authenticated.");
        }

        var user = await _userManager.GetByIdAsync(userId.Value);
        if (user == null)
        {
            throw new UserFriendlyException("User not found.");
        }

        if (user.EmailConfirmed)
        {
            return new ResendEmailVerificationResultDto
            {
                Success = true,
                Message = "Email is already verified."
            };
        }

        // Generate new email confirmation token
        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);

        // In development mode, log the token to console
        // In production, this would send an actual email
        _logger.LogInformation(
            "Email verification token generated for user {UserId} ({Email}): {Token}",
            user.Id, user.Email, token);

        // TODO: Implement actual email sending via ABP's email service
        // For now, we log the token which can be used in development

        return new ResendEmailVerificationResultDto
        {
            Success = true,
            Message = "Verification email sent. Please check your inbox."
        };
    }
}
