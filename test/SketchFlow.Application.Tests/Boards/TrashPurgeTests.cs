using System;
using System.Linq;
using System.Threading.Tasks;
using Shouldly;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;
using Xunit;

namespace SketchFlow.Boards;

public class TrashPurgeTests : SketchFlowApplicationTestBase<SketchFlowApplicationTestModule>
{
    private readonly IBoardAppService _boardAppService;
    private readonly IRepository<Board, Guid> _boardRepository;
    private readonly IDataFilter _dataFilter;

    public TrashPurgeTests()
    {
        _boardAppService = GetRequiredService<IBoardAppService>();
        _boardRepository = GetRequiredService<IRepository<Board, Guid>>();
        _dataFilter = GetRequiredService<IDataFilter>();
    }

    [Fact]
    public async Task TriggerTrashPurge_Should_Delete_Boards_Older_Than_30_Days()
    {
        // Arrange: Create a board
        var createResult = await _boardAppService.CreateAsync(new CreateBoardDto { Name = "TestTrashPurge" });
        var boardId = createResult.Id;

        // Soft delete the board
        await _boardAppService.DeleteAsync(boardId);

        // Verify board is in trash
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();
            var deletedBoard = queryable.FirstOrDefault(b => b.Id == boardId);
            deletedBoard.ShouldNotBeNull();
            deletedBoard.IsDeleted.ShouldBeTrue();
        }

        // Manually set DeletionTime to 31 days ago (simulating time passage)
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();
            var board = queryable.First(b => b.Id == boardId);

            // Use reflection to set DeletionTime since it's protected
            var deletionTimeProperty = board.GetType().GetProperty("DeletionTime");
            deletionTimeProperty?.SetValue(board, DateTime.UtcNow.AddDays(-31));

            await _boardRepository.UpdateAsync(board);
        }

        // Act: Trigger the purge
        var deletedCount = await _boardAppService.TriggerTrashPurgeAsync();

        // Assert: Board should be permanently deleted
        deletedCount.ShouldBeGreaterThanOrEqualTo(1);

        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();
            var purgedBoard = queryable.FirstOrDefault(b => b.Id == boardId);
            purgedBoard.ShouldBeNull(); // Board should be permanently deleted
        }
    }

    [Fact]
    public async Task TriggerTrashPurge_Should_Not_Delete_Boards_Less_Than_30_Days()
    {
        // Arrange: Create a board
        var createResult = await _boardAppService.CreateAsync(new CreateBoardDto { Name = "TestRecentTrash" });
        var boardId = createResult.Id;

        // Soft delete the board (will have DeletionTime of now)
        await _boardAppService.DeleteAsync(boardId);

        // Act: Trigger the purge (immediately after deletion)
        await _boardAppService.TriggerTrashPurgeAsync();

        // Assert: Board should still exist (not purged because < 30 days)
        using (_dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await _boardRepository.GetQueryableAsync();
            var board = queryable.FirstOrDefault(b => b.Id == boardId);
            board.ShouldNotBeNull(); // Board should still exist
            board.IsDeleted.ShouldBeTrue(); // But still marked as deleted
        }
    }
}
