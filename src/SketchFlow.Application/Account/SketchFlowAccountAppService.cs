using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Volo.Abp.Account;
using Volo.Abp.Account.Emailing;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Identity;

namespace SketchFlow.Account;

/// <summary>
/// Custom AccountAppService that prevents user enumeration attacks.
/// When sending password reset codes, this implementation always returns success
/// regardless of whether the email exists in the system.
/// </summary>
[ExposeServices(typeof(IAccountAppService), typeof(AccountAppService), typeof(SketchFlowAccountAppService))]
[Dependency(ReplaceServices = true)]
public class SketchFlowAccountAppService : AccountAppService
{
    public SketchFlowAccountAppService(
        IdentityUserManager userManager,
        IIdentityRoleRepository roleRepository,
        IAccountEmailer accountEmailer,
        IdentitySecurityLogManager identitySecurityLogManager,
        IOptions<IdentityOptions> identityOptions)
        : base(userManager, roleRepository, accountEmailer, identitySecurityLogManager, identityOptions)
    {
    }

    /// <summary>
    /// Sends a password reset code to the specified email.
    /// Always succeeds without error, even if the email doesn't exist.
    /// This is a security best practice to prevent user enumeration attacks.
    /// </summary>
    public override async Task SendPasswordResetCodeAsync(SendPasswordResetCodeDto input)
    {
        try
        {
            // Try to send the reset code using the base implementation
            await base.SendPasswordResetCodeAsync(input);
        }
        catch (Volo.Abp.UserFriendlyException ex)
        {
            // User not found or similar friendly exception - silently ignore
            // This prevents user enumeration attacks
            Logger.LogDebug(ex, "Password reset failed for email: {Email} - hiding error for security", input.Email);
        }
        catch (Exception ex) when (ex.Message.Contains("not find", StringComparison.OrdinalIgnoreCase) ||
                                    ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ||
                                    ex.Message.Contains("email", StringComparison.OrdinalIgnoreCase))
        {
            // Catch any "user not found" or email-related exceptions
            Logger.LogDebug(ex, "Password reset requested for possibly non-existent email: {Email}", input.Email);
        }
        // Don't re-throw - always return success to prevent enumeration
    }
}
