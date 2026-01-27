using System.Threading.Tasks;
using Volo.Abp;
using Volo.Abp.PermissionManagement;
using Volo.Abp.SettingManagement;
using Volo.Abp.Account;
using Volo.Abp.Identity;
using Volo.Abp.Mapperly;
using Volo.Abp.FeatureManagement;
using Volo.Abp.Modularity;
using Volo.Abp.BackgroundWorkers;
using Microsoft.Extensions.DependencyInjection;
using SketchFlow.Boards;

namespace SketchFlow;

[DependsOn(
    typeof(SketchFlowDomainModule),
    typeof(SketchFlowApplicationContractsModule),
    typeof(AbpPermissionManagementApplicationModule),
    typeof(AbpFeatureManagementApplicationModule),
    typeof(AbpIdentityApplicationModule),
    typeof(AbpAccountApplicationModule),
    typeof(AbpSettingManagementApplicationModule),
    typeof(AbpBackgroundWorkersModule)
    )]
public class SketchFlowApplicationModule : AbpModule
{
    public override async Task OnApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        await context.AddBackgroundWorkerAsync<TrashPurgeBackgroundWorker>();
    }
}
