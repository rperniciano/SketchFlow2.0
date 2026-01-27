using System.ComponentModel.DataAnnotations;

namespace SketchFlow.Boards;

/// <summary>
/// DTO for creating a new board element.
/// </summary>
public class CreateBoardElementDto
{
    /// <summary>
    /// JSON string containing element type, position, styling, etc.
    /// </summary>
    [Required]
    public string ElementData { get; set; } = string.Empty;

    /// <summary>
    /// Z-index for element layering.
    /// </summary>
    public int ZIndex { get; set; } = 0;
}
