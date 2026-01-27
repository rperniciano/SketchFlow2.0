using Volo.Abp.Modularity;

namespace SketchFlow;

/* Inherit from this class for your domain layer tests. */
public abstract class SketchFlowDomainTestBase<TStartupModule> : SketchFlowTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
