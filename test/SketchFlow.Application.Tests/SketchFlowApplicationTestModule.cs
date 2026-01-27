using Volo.Abp.Modularity;

namespace SketchFlow;

[DependsOn(
    typeof(SketchFlowApplicationModule),
    typeof(SketchFlowDomainTestModule)
)]
public class SketchFlowApplicationTestModule : AbpModule
{

}
