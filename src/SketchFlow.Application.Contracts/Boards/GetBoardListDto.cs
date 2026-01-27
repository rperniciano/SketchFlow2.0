using Volo.Abp.Application.Dtos;

namespace SketchFlow.Boards;

public class GetBoardListDto : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
    public bool IncludeDeleted { get; set; } = false;
}
