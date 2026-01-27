using System.Threading.Tasks;

namespace SketchFlow.Data;

public interface ISketchFlowDbSchemaMigrator
{
    Task MigrateAsync();
}
