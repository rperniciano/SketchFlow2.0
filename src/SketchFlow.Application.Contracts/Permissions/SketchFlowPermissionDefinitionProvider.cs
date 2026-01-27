using SketchFlow.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;
using Volo.Abp.MultiTenancy;

namespace SketchFlow.Permissions;

public class SketchFlowPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var myGroup = context.AddGroup(SketchFlowPermissions.GroupName);

        //Define your own permissions here. Example:
        //myGroup.AddPermission(SketchFlowPermissions.MyPermission1, L("Permission:MyPermission1"));
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<SketchFlowResource>(name);
    }
}
