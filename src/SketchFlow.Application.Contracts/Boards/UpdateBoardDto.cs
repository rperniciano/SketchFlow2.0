using System.ComponentModel.DataAnnotations;

namespace SketchFlow.Boards;

public class UpdateBoardDto
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    public string? Settings { get; set; }
}
