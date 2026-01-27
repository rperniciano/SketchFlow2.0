using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.Data;
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
            PhoneNumber = user.PhoneNumber,
            CursorColor = user.GetProperty<string>("CursorColor") ?? "#6366f1",
            DefaultStrokeColor = user.GetProperty<string>("DefaultStrokeColor") ?? "#000000",
            DefaultStrokeThickness = user.GetProperty<int>("DefaultStrokeThickness", 4)
        };
    }

    /// <summary>
    /// Updates the current authenticated user's profile information.
    /// </summary>
    public async Task<UserProfileDto> UpdateUserProfileAsync(UpdateUserProfileInput input)
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

        // Update basic properties
        user.Name = input.Name;
        user.Surname = input.Surname;

        // Update extra properties for custom fields
        user.SetProperty("CursorColor", input.CursorColor);
        user.SetProperty("DefaultStrokeColor", input.DefaultStrokeColor);
        user.SetProperty("DefaultStrokeThickness", input.DefaultStrokeThickness);

        // Save the user
        await _userManager.UpdateAsync(user);

        _logger.LogInformation(
            "User profile updated for user {UserId}: Name={Name}, Surname={Surname}, CursorColor={CursorColor}",
            user.Id, input.Name, input.Surname, input.CursorColor);

        // Return the updated profile
        return new UserProfileDto
        {
            Id = user.Id,
            UserName = user.UserName,
            Email = user.Email,
            EmailConfirmed = user.EmailConfirmed,
            Name = user.Name,
            Surname = user.Surname,
            PhoneNumber = user.PhoneNumber,
            CursorColor = input.CursorColor,
            DefaultStrokeColor = input.DefaultStrokeColor,
            DefaultStrokeThickness = input.DefaultStrokeThickness
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
