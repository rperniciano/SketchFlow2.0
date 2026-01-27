using System;

namespace SketchFlow.Boards;

/// <summary>
/// Data transfer object for BoardElement.
/// </summary>
public class BoardElementDto
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public Guid? CreatorUserId { get; set; }
    public string? CreatorGuestSessionId { get; set; }

    /// <summary>
    /// JSON string containing element type, position, styling, etc.
    /// </summary>
    public string ElementData { get; set; } = string.Empty;

    public int ZIndex { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
