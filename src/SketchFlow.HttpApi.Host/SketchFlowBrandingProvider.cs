using Microsoft.Extensions.Localization;
using SketchFlow.Localization;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Ui.Branding;

namespace SketchFlow;

[Dependency(ReplaceServices = true)]
public class SketchFlowBrandingProvider : DefaultBrandingProvider
{
    private IStringLocalizer<SketchFlowResource> _localizer;

    public SketchFlowBrandingProvider(IStringLocalizer<SketchFlowResource> localizer)
    {
        _localizer = localizer;
    }

    public override string AppName => _localizer["AppName"];
}
