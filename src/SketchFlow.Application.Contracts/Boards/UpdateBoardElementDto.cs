using System.ComponentModel.DataAnnotations;

namespace SketchFlow.Boards;

/// <summary>
/// DTO for updating an existing board element.
/// </summary>
public class UpdateBoardElementDto
{
    /// <summary>
    /// JSON string containing element type, position, styling, etc.
    /// </summary>
    [Required]
    public string ElementData { get; set; } = string.Empty;

    /// <summary>
    /// Optional: Z-index for element layering. If null, keeps current value.
    /// </summary>
    public int? ZIndex { get; set; }
}
