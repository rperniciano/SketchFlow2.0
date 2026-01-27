using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace SketchFlow.Boards;

/// <summary>
/// Represents a whiteboard/canvas where users can collaborate and draw.
/// </summary>
public class Board : FullAuditedAggregateRoot<Guid>
{
    /// <summary>
    /// The ID of the user who owns this board.
    /// </summary>
    public Guid OwnerId { get; private set; }

    /// <summary>
    /// The display name of the board.
    /// </summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>
    /// Unique share token for generating share links.
    /// </summary>
    public string ShareToken { get; private set; } = string.Empty;

    /// <summary>
    /// JSON-serialized board settings (background color, grid options, etc.).
    /// </summary>
    public string? Settings { get; private set; }

    protected Board()
    {
        // Required for EF Core
    }

    public Board(
        Guid id,
        Guid ownerId,
        string name,
        string? settings = null)
        : base(id)
    {
        OwnerId = ownerId;
        SetName(name);
        ShareToken = GenerateShareToken();
        Settings = settings;
    }

    public void SetName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Board name cannot be empty.", nameof(name));
        }

        if (name.Length > 200)
        {
            throw new ArgumentException("Board name cannot exceed 200 characters.", nameof(name));
        }

        Name = name.Trim();
    }

    public void SetSettings(string? settings)
    {
        Settings = settings;
    }

    public string RegenerateShareToken()
    {
        ShareToken = GenerateShareToken();
        return ShareToken;
    }

    private static string GenerateShareToken()
    {
        // Generate a 20-character alphanumeric token
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var random = new Random();
        var token = new char[20];
        for (int i = 0; i < token.Length; i++)
        {
            token[i] = chars[random.Next(chars.Length)];
        }
        return new string(token);
    }
}
