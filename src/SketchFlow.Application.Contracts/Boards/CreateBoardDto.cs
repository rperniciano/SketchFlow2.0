using System.ComponentModel.DataAnnotations;

namespace SketchFlow.Boards;

public class CreateBoardDto
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}
