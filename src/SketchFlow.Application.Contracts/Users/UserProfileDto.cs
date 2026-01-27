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
}
