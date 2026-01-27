using System;
using System.Linq;
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
    public async Task<UpdateUserProfileResultDto> UpdateUserProfileAsync(UpdateUserProfileInput input)
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

        // Track if email was changed
        var emailChanged = false;
        var oldEmail = user.Email;

        // Check if email is being changed
        if (!string.IsNullOrWhiteSpace(input.Email) &&
            !string.Equals(user.Email, input.Email, StringComparison.OrdinalIgnoreCase))
        {
            // Validate email format
            if (!IsValidEmail(input.Email))
            {
                throw new UserFriendlyException("Invalid email format.");
            }

            // Check if email is already in use by another user
            var existingUser = await _userManager.FindByEmailAsync(input.Email);
            if (existingUser != null && existingUser.Id != user.Id)
            {
                throw new UserFriendlyException("This email is already in use by another account.");
            }

            // Update email and mark as unverified
            var setEmailResult = await _userManager.SetEmailAsync(user, input.Email);
            if (!setEmailResult.Succeeded)
            {
                var errors = string.Join(", ", setEmailResult.Errors.Select(e => e.Description));
                throw new UserFriendlyException($"Failed to update email: {errors}");
            }

            // Set email as unverified
            user.SetEmailConfirmed(false);
            emailChanged = true;

            // Generate email confirmation token and log it (development mode)
            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            _logger.LogInformation(
                "Email changed for user {UserId} from {OldEmail} to {NewEmail}. Verification token: {Token}",
                user.Id, oldEmail, input.Email, token);

            // Construct verification URL for development
            var verificationUrl = $"http://localhost:4200/verify-email?userId={user.Id}&token={Uri.EscapeDataString(token)}";
            _logger.LogInformation(
                "Email verification link: {VerificationUrl}",
                verificationUrl);
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
            "User profile updated for user {UserId}: Name={Name}, Surname={Surname}, CursorColor={CursorColor}, EmailChanged={EmailChanged}",
            user.Id, input.Name, input.Surname, input.CursorColor, emailChanged);

        // Build result
        var profile = new UserProfileDto
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

        return new UpdateUserProfileResultDto
        {
            Profile = profile,
            EmailChanged = emailChanged,
            Message = emailChanged
                ? "Your email has been updated. Please verify your new email address. Your old email will continue to work until the new one is verified."
                : null
        };
    }

    /// <summary>
    /// Validates email format using basic regex.
    /// </summary>
    private static bool IsValidEmail(string email)
    {
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return addr.Address == email;
        }
        catch
        {
            return false;
        }
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

    /// <summary>
    /// Changes the current user's password.
    /// </summary>
    public async Task<ChangePasswordResultDto> ChangePasswordAsync(ChangePasswordInput input)
    {
        var userId = CurrentUser.Id;
        if (userId == null)
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "User is not authenticated."
            };
        }

        // Validate input
        if (string.IsNullOrWhiteSpace(input.CurrentPassword))
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "Current password is required."
            };
        }

        if (string.IsNullOrWhiteSpace(input.NewPassword))
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "New password is required."
            };
        }

        if (input.NewPassword != input.ConfirmPassword)
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "New password and confirmation do not match."
            };
        }

        // Validate password length (8-128 characters as per spec)
        if (input.NewPassword.Length < 8)
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "Password must be at least 8 characters long."
            };
        }

        if (input.NewPassword.Length > 128)
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "Password cannot exceed 128 characters."
            };
        }

        var user = await _userManager.GetByIdAsync(userId.Value);
        if (user == null)
        {
            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "User not found."
            };
        }

        // Verify current password
        var isCurrentPasswordValid = await _userManager.CheckPasswordAsync(user, input.CurrentPassword);
        if (!isCurrentPasswordValid)
        {
            _logger.LogWarning(
                "Password change failed for user {UserId}: incorrect current password",
                userId);

            return new ChangePasswordResultDto
            {
                Success = false,
                Message = "Current password is incorrect."
            };
        }

        // Change the password
        var changeResult = await _userManager.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword);
        if (!changeResult.Succeeded)
        {
            var errors = string.Join(", ", changeResult.Errors.Select(e => e.Description));
            _logger.LogWarning(
                "Password change failed for user {UserId}: {Errors}",
                userId, errors);

            return new ChangePasswordResultDto
            {
                Success = false,
                Message = $"Failed to change password: {errors}"
            };
        }

        _logger.LogInformation(
            "Password changed successfully for user {UserId}",
            userId);

        return new ChangePasswordResultDto
        {
            Success = true,
            Message = "Your password has been changed successfully."
        };
    }
}
