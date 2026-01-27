using System;
using Volo.Abp.Domain.Entities;

namespace SketchFlow.Boards;

/// <summary>
/// Represents an element on a whiteboard/canvas (stroke, rectangle, circle, text, etc.).
/// </summary>
public class BoardElement : Entity<Guid>
{
    /// <summary>
    /// The ID of the board this element belongs to.
    /// </summary>
    public Guid BoardId { get; private set; }

    /// <summary>
    /// The ID of the authenticated user who created this element.
    /// Null if created by a guest.
    /// </summary>
    public Guid? CreatorUserId { get; private set; }

    /// <summary>
    /// The session ID of the guest who created this element.
    /// Null if created by an authenticated user.
    /// </summary>
    public string? CreatorGuestSessionId { get; private set; }

    /// <summary>
    /// JSON-serialized element data containing type, position, styling, etc.
    /// Structure: { v: 1, type: "stroke"|"rectangle"|"circle"|"text", ...properties }
    /// </summary>
    public string ElementData { get; private set; } = string.Empty;

    /// <summary>
    /// Z-ordering index for layering elements (higher = on top).
    /// </summary>
    public int ZIndex { get; private set; }

    /// <summary>
    /// When this element was created.
    /// </summary>
    public DateTime CreatedAt { get; private set; }

    /// <summary>
    /// When this element was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; private set; }

    protected BoardElement()
    {
        // Required for EF Core
    }

    public BoardElement(
        Guid id,
        Guid boardId,
        string elementData,
        int zIndex,
        Guid? creatorUserId = null,
        string? creatorGuestSessionId = null)
        : base(id)
    {
        BoardId = boardId;
        SetElementData(elementData);
        ZIndex = zIndex;
        CreatorUserId = creatorUserId;
        CreatorGuestSessionId = creatorGuestSessionId;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetElementData(string elementData)
    {
        if (string.IsNullOrWhiteSpace(elementData))
        {
            throw new ArgumentException("Element data cannot be empty.", nameof(elementData));
        }

        ElementData = elementData;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetZIndex(int zIndex)
    {
        ZIndex = zIndex;
        UpdatedAt = DateTime.UtcNow;
    }
}
