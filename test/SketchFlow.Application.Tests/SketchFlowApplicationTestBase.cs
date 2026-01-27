using Volo.Abp.Modularity;

namespace SketchFlow;

public abstract class SketchFlowApplicationTestBase<TStartupModule> : SketchFlowTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
