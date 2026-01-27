using SketchFlow.Localization;
using Volo.Abp.AspNetCore.Mvc;

namespace SketchFlow.Controllers;

/* Inherit your controllers from this class.
 */
public abstract class SketchFlowController : AbpControllerBase
{
    protected SketchFlowController()
    {
        LocalizationResource = typeof(SketchFlowResource);
    }
}
