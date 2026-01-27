using System;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SketchFlow.Identity;

/// <summary>
/// Custom token provider for password reset tokens with a 1-hour expiration.
/// This matches the app_spec.txt requirement: "Password reset via email (1h link expiry, single-use)"
///
/// The default DataProtectorTokenProvider has a 24-hour lifetime, but for security reasons,
/// password reset tokens should expire more quickly.
/// </summary>
public class PasswordResetTokenProvider<TUser> : DataProtectorTokenProvider<TUser> where TUser : class
{
    public PasswordResetTokenProvider(
        IDataProtectionProvider dataProtectionProvider,
        IOptions<PasswordResetTokenProviderOptions> options,
        ILogger<DataProtectorTokenProvider<TUser>> logger)
        : base(dataProtectionProvider, options, logger)
    {
    }
}

/// <summary>
/// Options for the password reset token provider.
/// Sets the token lifespan to 1 hour as per security requirements.
/// </summary>
public class PasswordResetTokenProviderOptions : DataProtectionTokenProviderOptions
{
    public const string ProviderName = "PasswordResetTokenProvider";

    public PasswordResetTokenProviderOptions()
    {
        // Unique name for this token provider
        Name = ProviderName;

        // Password reset tokens expire after 1 hour for security
        TokenLifespan = TimeSpan.FromHours(1);
    }
}
