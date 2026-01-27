using SketchFlow.Localization;
using Volo.Abp.Application.Services;

namespace SketchFlow;

/* Inherit your application services from this class.
 */
public abstract class SketchFlowAppService : ApplicationService
{
    protected SketchFlowAppService()
    {
        LocalizationResource = typeof(SketchFlowResource);
    }
}
