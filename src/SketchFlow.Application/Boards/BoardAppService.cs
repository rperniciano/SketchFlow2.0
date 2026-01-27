using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Domain.Repositories;

namespace SketchFlow.Boards;

[Authorize]
public class BoardAppService : SketchFlowAppService, IBoardAppService
{
    private readonly IRepository<Board, Guid> _boardRepository;

    public BoardAppService(IRepository<Board, Guid> boardRepository)
    {
        _boardRepository = boardRepository;
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

        // Get queryable with soft deleted items
        var queryable = await _boardRepository.WithDetailsAsync();

        // For trash, we need to query soft-deleted items
        // ABP's soft delete filter needs to be disabled for this
        var query = (await _boardRepository.GetQueryableAsync())
            .Where(b => b.OwnerId == userId);

        // Since we can't easily disable soft-delete filter in Application layer,
        // we'll return empty for now - this can be enhanced with a custom repository later
        return new PagedResultDto<BoardDto>(0, new List<BoardDto>());
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
        // Restore requires custom repository with soft-delete filter disabled
        // For now, throw not implemented
        throw new NotImplementedException("Restore functionality requires custom repository implementation");
    }

    public async Task PermanentDeleteAsync(Guid id)
    {
        // Permanent delete requires custom repository with soft-delete filter disabled
        // For now, throw not implemented
        throw new NotImplementedException("Permanent delete functionality requires custom repository implementation");
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
