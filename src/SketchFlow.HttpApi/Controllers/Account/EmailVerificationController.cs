using System;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Emailing;
using Volo.Abp.Identity;

namespace SketchFlow.Controllers.Account;

/// <summary>
/// Custom email verification endpoint for Angular SPA.
/// ABP's built-in email verification uses MVC pages, so we need this custom endpoint
/// to support the Angular SPA flow.
/// </summary>
[Route("api/account")]
[ApiController]
public class EmailVerificationController : AbpController
{
    private readonly IdentityUserManager _userManager;
    private readonly ILogger<EmailVerificationController> _logger;
    private readonly IEmailSender _emailSender;
    private readonly IConfiguration _configuration;

    public EmailVerificationController(
        IdentityUserManager userManager,
        ILogger<EmailVerificationController> logger,
        IEmailSender emailSender,
        IConfiguration configuration)
    {
        _userManager = userManager;
        _logger = logger;
        _emailSender = emailSender;
        _configuration = configuration;
    }

    /// <summary>
    /// Verifies a user's email address using the confirmation token sent via email.
    /// </summary>
    /// <param name="input">The verification request containing userId and token.</param>
    /// <returns>Success if the email is verified, otherwise an error.</returns>
    [HttpPost("verify-email-confirmation-token")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmailConfirmationToken([FromBody] VerifyEmailInput input)
    {
        if (string.IsNullOrEmpty(input.UserId) || string.IsNullOrEmpty(input.Token))
        {
            throw new UserFriendlyException("Invalid verification request. UserId and token are required.");
        }

        if (!Guid.TryParse(input.UserId, out var userGuid))
        {
            throw new UserFriendlyException("Invalid user ID format.");
        }

        var user = await _userManager.FindByIdAsync(input.UserId);
        if (user == null)
        {
            _logger.LogWarning("Email verification attempted for non-existent user: {UserId}", input.UserId);
            throw new UserFriendlyException("User not found.");
        }

        if (user.EmailConfirmed)
        {
            _logger.LogInformation("Email already verified for user: {UserId}", input.UserId);
            return Ok(new { message = "Email is already verified." });
        }

        // Decode the token (it should be URL-encoded)
        var decodedToken = Uri.UnescapeDataString(input.Token);

        var result = await _userManager.ConfirmEmailAsync(user, decodedToken);

        if (result.Succeeded)
        {
            _logger.LogInformation("Email verified successfully for user: {UserId}, Email: {Email}",
                user.Id, user.Email);
            return Ok(new { message = "Email verified successfully." });
        }

        var errorCodes = result.Errors.Select(e => e.Code).ToList();
        var errorDescriptions = result.Errors.Select(e => e.Description).ToList();

        _logger.LogWarning("Email verification failed for user: {UserId}. Error codes: {Codes}, Descriptions: {Descriptions}",
            input.UserId, string.Join(", ", errorCodes), string.Join(", ", errorDescriptions));

        // Determine specific error message based on error codes
        // ASP.NET Core Identity uses "InvalidToken" for both expired and invalid tokens
        // but we can provide a more helpful message to users
        string userMessage;
        if (errorCodes.Contains("InvalidToken"))
        {
            // Token is either expired or malformed - most likely expired given our 24h expiration
            userMessage = "The verification link has expired. Verification links are valid for 24 hours. Please request a new verification email.";
        }
        else
        {
            userMessage = "Email verification failed. The link may be invalid or already been used.";
        }

        throw new UserFriendlyException(userMessage);
    }

    /// <summary>
    /// Resends the email verification link to the user's email address.
    /// </summary>
    /// <param name="input">The request containing the user's email address.</param>
    /// <returns>Success message if the email is sent.</returns>
    [HttpPost("resend-email-verification")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendEmailVerification([FromBody] ResendEmailVerificationInput input)
    {
        if (string.IsNullOrEmpty(input.Email))
        {
            throw new UserFriendlyException("Email address is required.");
        }

        var user = await _userManager.FindByEmailAsync(input.Email);
        if (user == null)
        {
            // Don't reveal if user exists or not for security
            return Ok(new { message = "If an account exists with this email, a verification link will be sent." });
        }

        if (user.EmailConfirmed)
        {
            return Ok(new { message = "Email is already verified." });
        }

        // Generate new confirmation token
        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        var encodedToken = HttpUtility.UrlEncode(token);

        // Build the verification URL for the Angular SPA
        var appUrl = _configuration["App:SelfUrl"] ?? "http://localhost:4200";
        var verificationUrl = $"{appUrl}/account/confirm-email?userId={user.Id}&token={encodedToken}";

        _logger.LogInformation(
            "Resending email verification for user {UserId}, Email: {Email}",
            user.Id, user.Email);

        // Send the verification email
        var emailBody = BuildVerificationEmailBody(user.UserName ?? user.Email ?? "User", verificationUrl);
        await _emailSender.SendAsync(
            user.Email!,
            "Verify Your Email - SketchFlow",
            emailBody,
            isBodyHtml: true
        );

        return Ok(new { message = "Verification email sent. Please check your inbox." });
    }

    /// <summary>
    /// Builds the HTML body for the verification email.
    /// </summary>
    private static string BuildVerificationEmailBody(string userName, string verificationUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html>");
        sb.AppendLine("<head>");
        sb.AppendLine("  <style>");
        sb.AppendLine("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }");
        sb.AppendLine("    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }");
        sb.AppendLine("    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }");
        sb.AppendLine("    .button { display: inline-block; background: #6366f1; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; margin: 20px 0; }");
        sb.AppendLine("    .button:hover { background: #4f46e5; }");
        sb.AppendLine("    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }");
        sb.AppendLine("    .link-fallback { word-break: break-all; font-size: 12px; color: #6b7280; margin-top: 15px; }");
        sb.AppendLine("  </style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine("  <div class='header'>");
        sb.AppendLine("    <h1 style='margin: 0;'>SketchFlow</h1>");
        sb.AppendLine("    <p style='margin: 10px 0 0 0; opacity: 0.9;'>Email Verification</p>");
        sb.AppendLine("  </div>");
        sb.AppendLine("  <div class='content'>");
        sb.AppendLine($"    <p>Hi {System.Net.WebUtility.HtmlEncode(userName)},</p>");
        sb.AppendLine("    <p>Please verify your email address by clicking the button below:</p>");
        sb.AppendLine($"    <p style='text-align: center;'><a href='{verificationUrl}' class='button'>Verify Email Address</a></p>");
        sb.AppendLine("    <p>This link will expire in 24 hours.</p>");
        sb.AppendLine("    <p>If you didn't create an account with SketchFlow, you can safely ignore this email.</p>");
        sb.AppendLine($"    <p class='link-fallback'>If the button doesn't work, copy and paste this link into your browser:<br/>{verificationUrl}</p>");
        sb.AppendLine("  </div>");
        sb.AppendLine("  <div class='footer'>");
        sb.AppendLine("    <p>&copy; SketchFlow. All rights reserved.</p>");
        sb.AppendLine("  </div>");
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
        return sb.ToString();
    }
}

/// <summary>
/// Input model for email verification.
/// </summary>
public class VerifyEmailInput
{
    /// <summary>
    /// The user's ID (GUID format).
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>
    /// The email confirmation token from the verification email.
    /// </summary>
    public string? Token { get; set; }
}

/// <summary>
/// Input model for resending email verification.
/// </summary>
public class ResendEmailVerificationInput
{
    /// <summary>
    /// The user's email address.
    /// </summary>
    public string? Email { get; set; }
}
