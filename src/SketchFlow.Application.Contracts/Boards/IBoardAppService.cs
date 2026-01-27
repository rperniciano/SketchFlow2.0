using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;

namespace SketchFlow.Boards;

public interface IBoardAppService : IApplicationService
{
    /// <summary>
    /// Gets a paginated list of boards for the current user.
    /// </summary>
    Task<PagedResultDto<BoardDto>> GetListAsync(GetBoardListDto input);

    /// <summary>
    /// Gets boards in the trash for the current user.
    /// </summary>
    Task<PagedResultDto<BoardDto>> GetTrashAsync(GetBoardListDto input);

    /// <summary>
    /// Gets a single board by ID.
    /// </summary>
    Task<BoardDto> GetAsync(Guid id);

    /// <summary>
    /// Creates a new board for the current user.
    /// </summary>
    Task<BoardDto> CreateAsync(CreateBoardDto input);

    /// <summary>
    /// Updates an existing board.
    /// </summary>
    Task<BoardDto> UpdateAsync(Guid id, UpdateBoardDto input);

    /// <summary>
    /// Soft deletes a board (moves to trash).
    /// </summary>
    Task DeleteAsync(Guid id);

    /// <summary>
    /// Restores a board from trash.
    /// </summary>
    Task<BoardDto> RestoreAsync(Guid id);

    /// <summary>
    /// Permanently deletes a board from trash.
    /// </summary>
    Task PermanentDeleteAsync(Guid id);

    /// <summary>
    /// Regenerates the share token for a board.
    /// </summary>
    Task<string> RegenerateShareTokenAsync(Guid id);

    /// <summary>
    /// Gets a board by its share token (for join preview).
    /// </summary>
    Task<BoardDto?> GetByShareTokenAsync(string shareToken);

    /// <summary>
    /// Triggers the trash purge process to permanently delete boards that have been in trash for over 30 days.
    /// This method is intended for testing/admin purposes.
    /// </summary>
    /// <returns>The number of boards permanently deleted.</returns>
    Task<int> TriggerTrashPurgeAsync();

    // ============ BOARD ELEMENTS ============

    /// <summary>
    /// Gets all elements for a specific board.
    /// </summary>
    Task<List<BoardElementDto>> GetElementsAsync(Guid boardId);

    /// <summary>
    /// Creates a new element on a board.
    /// </summary>
    Task<BoardElementDto> CreateElementAsync(Guid boardId, CreateBoardElementDto input);

    /// <summary>
    /// Updates an existing element.
    /// </summary>
    Task<BoardElementDto> UpdateElementAsync(Guid boardId, Guid elementId, UpdateBoardElementDto input);

    /// <summary>
    /// Deletes elements from a board.
    /// </summary>
    Task DeleteElementsAsync(Guid boardId, List<Guid> elementIds);
}
