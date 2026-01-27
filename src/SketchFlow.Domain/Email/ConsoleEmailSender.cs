using System;
using System.Net.Mail;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Emailing;

namespace SketchFlow.Email;

/// <summary>
/// A development email sender that logs email content to the console.
/// This allows testing email verification flows without a real SMTP server.
/// Verification links will be printed to the terminal.
/// </summary>
public class ConsoleEmailSender : IEmailSender, ITransientDependency
{
    private readonly ILogger<ConsoleEmailSender> _logger;

    public ConsoleEmailSender(ILogger<ConsoleEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string to, string? subject, string? body, bool isBodyHtml = true, AdditionalEmailSendingArgs? additionalEmailSendingArgs = null)
    {
        LogEmail(to, null, null, subject, body);
        return Task.CompletedTask;
    }

    public Task SendAsync(string from, string to, string? subject, string? body, bool isBodyHtml = true, AdditionalEmailSendingArgs? additionalEmailSendingArgs = null)
    {
        LogEmail(to, from, null, subject, body);
        return Task.CompletedTask;
    }

    public Task QueueAsync(string to, string? subject, string? body, bool isBodyHtml = true, AdditionalEmailSendingArgs? additionalEmailSendingArgs = null)
    {
        LogEmail(to, null, null, subject, body);
        return Task.CompletedTask;
    }

    public Task QueueAsync(string from, string to, string? subject, string? body, bool isBodyHtml = true, AdditionalEmailSendingArgs? additionalEmailSendingArgs = null)
    {
        LogEmail(to, from, null, subject, body);
        return Task.CompletedTask;
    }

    public Task SendAsync(MailMessage mail, bool normalize = true)
    {
        var to = mail.To.Count > 0 ? mail.To[0].Address : "unknown";
        var from = mail.From?.Address;
        LogEmail(to, from, null, mail.Subject, mail.Body);
        return Task.CompletedTask;
    }

    private void LogEmail(string to, string? from, string? cc, string? subject, string? body)
    {
        var separator = new string('=', 80);
        var message = $@"
{separator}
📧 EMAIL SENT (Development Mode - Not Actually Sent)
{separator}
To: {to}
From: {from ?? "noreply@sketchflow.local"}
Subject: {subject}
{separator}
{body}
{separator}
";

        _logger.LogWarning(message);

        // Also write to console directly to ensure visibility
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine(separator);
        Console.WriteLine("📧 EMAIL SENT (Development Mode)");
        Console.WriteLine(separator);
        Console.ResetColor();
        Console.WriteLine($"To: {to}");
        Console.WriteLine($"Subject: {subject}");
        Console.WriteLine(separator);
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine(body);
        Console.ResetColor();
        Console.WriteLine(separator);
        Console.WriteLine();
    }
}
