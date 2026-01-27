using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Volo.Abp;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Threading;
using Volo.Abp.Uow;

namespace SketchFlow.Boards;

/// <summary>
/// Background worker that automatically purges boards that have been in trash for more than 30 days.
/// Runs every hour to check for expired boards.
/// </summary>
public class TrashPurgeBackgroundWorker : AsyncPeriodicBackgroundWorkerBase
{
    /// <summary>
    /// Number of days after which trashed boards are permanently deleted.
    /// </summary>
    public const int TrashRetentionDays = 30;

    public TrashPurgeBackgroundWorker(
        AbpAsyncTimer timer,
        IServiceScopeFactory serviceScopeFactory)
        : base(timer, serviceScopeFactory)
    {
        // Run every hour (3600000 milliseconds)
        // In production, this ensures boards are purged within an hour of expiring
        Timer.Period = 3600000;
    }

    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        Logger.LogInformation("Starting trash purge job...");

        var boardRepository = workerContext.ServiceProvider.GetRequiredService<IRepository<Board, Guid>>();
        var dataFilter = workerContext.ServiceProvider.GetRequiredService<IDataFilter>();
        var unitOfWorkManager = workerContext.ServiceProvider.GetRequiredService<IUnitOfWorkManager>();

        var cutoffDate = DateTime.UtcNow.AddDays(-TrashRetentionDays);

        using var uow = unitOfWorkManager.Begin();

        // Disable soft-delete filter to access deleted boards
        using (dataFilter.Disable<ISoftDelete>())
        {
            var queryable = await boardRepository.GetQueryableAsync();

            // Find boards that are deleted and have been in trash for more than 30 days
            var expiredBoards = queryable
                .Where(b => b.IsDeleted && b.DeletionTime.HasValue && b.DeletionTime.Value < cutoffDate)
                .ToList();

            if (expiredBoards.Count > 0)
            {
                Logger.LogInformation("Found {Count} boards to permanently delete (in trash for over {Days} days)",
                    expiredBoards.Count, TrashRetentionDays);

                foreach (var board in expiredBoards)
                {
                    Logger.LogInformation("Permanently deleting board '{Name}' (ID: {Id}, Deleted: {DeletionTime})",
                        board.Name, board.Id, board.DeletionTime);

                    await boardRepository.HardDeleteAsync(board);
                }
            }
            else
            {
                Logger.LogDebug("No expired boards found to purge.");
            }
        }

        await uow.CompleteAsync();

        Logger.LogInformation("Trash purge job completed.");
    }
}
