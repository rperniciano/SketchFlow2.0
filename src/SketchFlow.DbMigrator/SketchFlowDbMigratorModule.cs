using SketchFlow.EntityFrameworkCore;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace SketchFlow.DbMigrator;

[DependsOn(
    typeof(AbpAutofacModule),
    typeof(SketchFlowEntityFrameworkCoreModule),
    typeof(SketchFlowApplicationContractsModule)
)]
public class SketchFlowDbMigratorModule : AbpModule
{
}
