using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace SketchFlow.Data;

/* This is used if database provider does't define
 * ISketchFlowDbSchemaMigrator implementation.
 */
public class NullSketchFlowDbSchemaMigrator : ISketchFlowDbSchemaMigrator, ITransientDependency
{
    public Task MigrateAsync()
    {
        return Task.CompletedTask;
    }
}
