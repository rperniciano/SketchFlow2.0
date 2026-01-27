using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SketchFlow.Data;
using Volo.Abp.DependencyInjection;

namespace SketchFlow.EntityFrameworkCore;

public class EntityFrameworkCoreSketchFlowDbSchemaMigrator
    : ISketchFlowDbSchemaMigrator, ITransientDependency
{
    private readonly IServiceProvider _serviceProvider;

    public EntityFrameworkCoreSketchFlowDbSchemaMigrator(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task MigrateAsync()
    {
        /* We intentionally resolving the SketchFlowDbContext
         * from IServiceProvider (instead of directly injecting it)
         * to properly get the connection string of the current tenant in the
         * current scope.
         */

        await _serviceProvider
            .GetRequiredService<SketchFlowDbContext>()
            .Database
            .MigrateAsync();
    }
}
