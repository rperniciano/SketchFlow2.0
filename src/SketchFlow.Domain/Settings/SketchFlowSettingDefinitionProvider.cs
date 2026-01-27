using Volo.Abp.Settings;

namespace SketchFlow.Settings;

public class SketchFlowSettingDefinitionProvider : SettingDefinitionProvider
{
    public override void Define(ISettingDefinitionContext context)
    {
        //Define your own settings here. Example:
        //context.Add(new SettingDefinition(SketchFlowSettings.MySetting1));
    }
}
