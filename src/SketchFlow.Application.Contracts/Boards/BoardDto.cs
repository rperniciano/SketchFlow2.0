using System;
using Volo.Abp.Application.Dtos;

namespace SketchFlow.Boards;

public class BoardDto : EntityDto<Guid>
{
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShareToken { get; set; } = string.Empty;
    public string? Settings { get; set; }
    public DateTime CreationTime { get; set; }
    public DateTime? LastModificationTime { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletionTime { get; set; }

    /// <summary>
    /// Number of active participants on this board.
    /// </summary>
    public int ParticipantCount { get; set; }
}
