using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;

namespace SketchFlow.Boards;

[Authorize]
public class BoardAppService : SketchFlowAppService, IBoardAppService
{
    private readonly IRepository<Board, Guid> _boardRepository;
    private readonly IDataFilter _dataFilter;

    public BoardAppService(
        IRepository<Board, Guid> boardRepository,
        IDataFilter dataFilter)
    {
        _boardRepository = boardRepository;
        _dataFilter = dataFilter;
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

        return MapToDto(board);
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

    private static BoardDto MapToDto(Board board, int participantCount = 1)
    {
        return new BoardDto
        {
            Id = board.Id,
            OwnerId = board.OwnerId,
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
}
