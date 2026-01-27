using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;
using Volo.Abp.Uow;

namespace SketchFlow.Boards;

[Authorize]
public class BoardAppService : SketchFlowAppService, IBoardAppService
{
    private const int MaxBoardsPerUser = 50;
    private const int MaxElementsPerBoard = 5000;

    private readonly IRepository<Board, Guid> _boardRepository;
    private readonly IRepository<BoardElement, Guid> _elementRepository;
    private readonly IDataFilter _dataFilter;
    private readonly IdentityUserManager _userManager;

    public BoardAppService(
        IRepository<Board, Guid> boardRepository,
        IRepository<BoardElement, Guid> elementRepository,
        IDataFilter dataFilter,
        IdentityUserManager userManager)
    {
        _boardRepository = boardRepository;
        _elementRepository = elementRepository;
        _dataFilter = dataFilter;
        _userManager = userManager;
    }

    public async Task<PagedResultDto<BoardDto>> GetListAsync(GetBoardListDto input)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        var queryable = await _boardRepository.GetQueryableAsync();

        var query = queryable.Where(b => b.OwnerId == userId);

        if (!string.IsNullOrWhiteSpace(input.Filter))
        {
            var filter = input.Filter.ToLowerInvariant();
            query = query.Where(b => b.Name.ToLower().Contains(filter));
        }

        var totalCount = query.Count();

        // Default sorting: most recently modified first
        var boards = query
            .OrderByDescending(b => b.LastModificationTime ?? b.CreationTime)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount > 0 ? input.MaxResultCount : 20)
            .ToList();

        var items = boards.Select(b => MapToDto(b)).ToList();

        return new PagedResultDto<BoardDto>(totalCount, items);
    }

    public async Task<PagedResultDto<BoardDto>> GetTrashAsync(GetBoardListDto input)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        // Disable soft-delete filter to get deleted items
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();

            // Query only soft-deleted boards owned by the current user
            var query = queryable.Where(b => b.OwnerId == userId && b.IsDeleted);

            var totalCount = query.Count();

            // Sort by deletion time (most recently deleted first)
            var boards = query
                .OrderByDescending(b => b.DeletionTime)
                .Skip(input.SkipCount)
                .Take(input.MaxResultCount > 0 ? input.MaxResultCount : 20)
                .ToList();

            var items = boards.Select(b => MapToDto(b)).ToList();

            return new PagedResultDto<BoardDto>(totalCount, items);
        }
    }

    public async Task<BoardDto> GetAsync(Guid id)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId);

        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        return MapToDto(board);
    }

    public async Task<BoardDto> CreateAsync(CreateBoardDto input)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        // Check board limit
        var queryable = await _boardRepository.GetQueryableAsync();
        var currentBoardCount = queryable.Count(b => b.OwnerId == userId);

        if (currentBoardCount >= MaxBoardsPerUser)
        {
            throw new BusinessException("SketchFlow:BoardLimitReached")
                .WithData("maxBoards", MaxBoardsPerUser);
        }

        var board = new Board(
            GuidGenerator.Create(),
            userId,
            input.Name
        );

        await _boardRepository.InsertAsync(board);

        return MapToDto(board);
    }

    public async Task<BoardDto> UpdateAsync(Guid id, UpdateBoardDto input)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId);

        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        board.SetName(input.Name);
        board.SetSettings(input.Settings);

        await _boardRepository.UpdateAsync(board);

        return MapToDto(board);
    }

    public async Task DeleteAsync(Guid id)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId);

        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        // Soft delete - ABP handles this automatically via ISoftDelete
        await _boardRepository.DeleteAsync(board);
    }

    public async Task<BoardDto> RestoreAsync(Guid id)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        // Disable soft-delete filter to find the deleted board
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId && b.IsDeleted);

            if (board == null)
            {
                throw new BusinessException("SketchFlow:BoardNotFound");
            }

            // Restore the board by setting IsDeleted to false
            // We need to access the entity to modify its soft-delete properties
            // ABP's FullAuditedAggregateRoot implements ISoftDelete with IsDeleted property
            var entityType = board.GetType();
            var isDeletedProperty = entityType.GetProperty("IsDeleted");
            var deletionTimeProperty = entityType.GetProperty("DeletionTime");

            if (isDeletedProperty != null)
            {
                isDeletedProperty.SetValue(board, false);
            }

            if (deletionTimeProperty != null)
            {
                deletionTimeProperty.SetValue(board, null);
            }

            await _boardRepository.UpdateAsync(board);

            return MapToDto(board);
        }
    }

    public async Task PermanentDeleteAsync(Guid id)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        // Disable soft-delete filter to find the deleted board
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId && b.IsDeleted);

            if (board == null)
            {
                throw new BusinessException("SketchFlow:BoardNotFound");
            }

            // Hard delete the board - this will bypass soft-delete and remove the record permanently
            await _boardRepository.HardDeleteAsync(board);
        }
    }

    public async Task<string> RegenerateShareTokenAsync(Guid id)
    {
        var userId = CurrentUser.Id ?? throw new UnauthorizedAccessException();

        var board = await _boardRepository.FindAsync(b => b.Id == id && b.OwnerId == userId);

        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        var newToken = board.RegenerateShareToken();
        await _boardRepository.UpdateAsync(board);

        return newToken;
    }

    [AllowAnonymous]
    public async Task<BoardDto?> GetByShareTokenAsync(string shareToken)
    {
        var board = await _boardRepository.FindAsync(b => b.ShareToken == shareToken);

        if (board == null)
        {
            return null;
        }

        // Fetch owner name for join preview
        var ownerName = "Unknown";
        var owner = await _userManager.FindByIdAsync(board.OwnerId.ToString());
        if (owner != null)
        {
            // Use UserName (email) or Name extra property if available
            ownerName = owner.Name ?? owner.UserName ?? "Unknown";
        }

        // TODO: Get real participant count from BoardSessions when implemented
        // For now, default to 1 (the owner)
        var participantCount = 1;

        return MapToDto(board, ownerName, participantCount);
    }

    /// <summary>
    /// Triggers the trash purge process to permanently delete boards that have been in trash for over 30 days.
    /// This method is intended for testing/admin purposes.
    /// </summary>
    /// <returns>The number of boards permanently deleted.</returns>
    public async Task<int> TriggerTrashPurgeAsync()
    {
        var cutoffDate = DateTime.UtcNow.AddDays(-TrashPurgeBackgroundWorker.TrashRetentionDays);
        var deletedCount = 0;

        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();

            var expiredBoards = queryable
                .Where(b => b.IsDeleted && b.DeletionTime.HasValue && b.DeletionTime.Value < cutoffDate)
                .ToList();

            foreach (var board in expiredBoards)
            {
                await _boardRepository.HardDeleteAsync(board);
                deletedCount++;
            }
        }

        return deletedCount;
    }

    // ============ BOARD ELEMENTS ============

    [AllowAnonymous]
    public async Task<List<BoardElementDto>> GetElementsAsync(Guid boardId)
    {
        // First check if board exists (allow anonymous access via share token later)
        var board = await _boardRepository.FindAsync(boardId);
        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        var queryable = await _elementRepository.GetQueryableAsync();
        var elements = queryable
            .Where(e => e.BoardId == boardId)
            .OrderBy(e => e.ZIndex)
            .ThenBy(e => e.CreatedAt)
            .ToList();

        return elements.Select(MapElementToDto).ToList();
    }

    public async Task<BoardElementDto> CreateElementAsync(Guid boardId, CreateBoardElementDto input)
    {
        var userId = CurrentUser.Id;

        // Check if board exists and user has access (owner or guest via share token)
        var board = await _boardRepository.FindAsync(boardId);
        if (board == null)
        {
            throw new BusinessException("SketchFlow:BoardNotFound");
        }

        // Check element count limit
        var queryable = await _elementRepository.GetQueryableAsync();
        var elementCount = queryable.Count(e => e.BoardId == boardId);
        if (elementCount >= MaxElementsPerBoard)
        {
            throw new BusinessException("SketchFlow:ElementLimitReached")
                .WithData("maxElements", MaxElementsPerBoard);
        }

        var element = new BoardElement(
            GuidGenerator.Create(),
            boardId,
            input.ElementData,
            input.ZIndex,
            userId,
            null // TODO: Support guest session ID
        );

        await _elementRepository.InsertAsync(element);

        return MapElementToDto(element);
    }

    public async Task<BoardElementDto> UpdateElementAsync(Guid boardId, Guid elementId, UpdateBoardElementDto input)
    {
        var element = await _elementRepository.FindAsync(e => e.Id == elementId && e.BoardId == boardId);
        if (element == null)
        {
            throw new BusinessException("SketchFlow:ElementNotFound");
        }

        element.SetElementData(input.ElementData);
        if (input.ZIndex.HasValue)
        {
            element.SetZIndex(input.ZIndex.Value);
        }

        await _elementRepository.UpdateAsync(element);

        return MapElementToDto(element);
    }

    [UnitOfWork]
    public async Task DeleteElementsAsync(Guid boardId, List<Guid> elementIds)
    {
        // Delete each element individually using direct ID lookup
        foreach (var elementId in elementIds)
        {
            try
            {
                var element = await _elementRepository.GetAsync(elementId);
                if (element.BoardId == boardId)
                {
                    await _elementRepository.DeleteAsync(element);
                }
            }
            catch
            {
                // Element not found, skip
            }
        }

        // Ensure changes are persisted
        await CurrentUnitOfWork!.SaveChangesAsync();
    }

    private static BoardDto MapToDto(Board board, string ownerName = "", int participantCount = 1)
    {
        return new BoardDto
        {
            Id = board.Id,
            OwnerId = board.OwnerId,
            OwnerName = ownerName,
            Name = board.Name,
            ShareToken = board.ShareToken,
            Settings = board.Settings,
            CreationTime = board.CreationTime,
            LastModificationTime = board.LastModificationTime,
            IsDeleted = board.IsDeleted,
            DeletionTime = board.DeletionTime,
            ParticipantCount = participantCount
        };
    }

    private static BoardElementDto MapElementToDto(BoardElement element)
    {
        return new BoardElementDto
        {
            Id = element.Id,
            BoardId = element.BoardId,
            CreatorUserId = element.CreatorUserId,
            CreatorGuestSessionId = element.CreatorGuestSessionId,
            ElementData = element.ElementData,
            ZIndex = element.ZIndex,
            CreatedAt = element.CreatedAt,
            UpdatedAt = element.UpdatedAt
        };
    }
}
