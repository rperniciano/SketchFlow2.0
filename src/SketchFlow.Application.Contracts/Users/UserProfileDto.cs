using System;

namespace SketchFlow.Users;

/// <summary>
/// DTO for the current user's profile information.
/// </summary>
public class UserProfileDto
{
    /// <summary>
    /// The user's unique identifier.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// The user's username.
    /// </summary>
    public string? UserName { get; set; }

    /// <summary>
    /// The user's email address.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// Whether the user's email address has been verified.
    /// </summary>
    public bool EmailConfirmed { get; set; }

    /// <summary>
    /// The user's display name.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// The user's surname.
    /// </summary>
    public string? Surname { get; set; }

    /// <summary>
    /// The user's phone number.
    /// </summary>
    public string? PhoneNumber { get; set; }

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
