using Volo.Abp.Modularity;

namespace SketchFlow;

[DependsOn(
    typeof(SketchFlowDomainModule),
    typeof(SketchFlowTestBaseModule)
)]
public class SketchFlowDomainTestModule : AbpModule
{

}
