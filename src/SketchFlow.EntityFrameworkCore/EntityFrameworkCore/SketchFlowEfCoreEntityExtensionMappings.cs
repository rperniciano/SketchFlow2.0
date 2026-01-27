using Microsoft.EntityFrameworkCore;
using Volo.Abp.Identity;
using Volo.Abp.ObjectExtending;
using Volo.Abp.Threading;

namespace SketchFlow.EntityFrameworkCore;

public static class SketchFlowEfCoreEntityExtensionMappings
{
    private static readonly OneTimeRunner OneTimeRunner = new OneTimeRunner();

    public static void Configure()
    {
        SketchFlowGlobalFeatureConfigurator.Configure();
        SketchFlowModuleExtensionConfigurator.Configure();

        OneTimeRunner.Run(() =>
        {
            // Map user extra properties to database columns
            ObjectExtensionManager.Instance
                .MapEfCoreProperty<IdentityUser, string>(
                    "CursorColor",
                    (entityBuilder, propertyBuilder) =>
                    {
                        propertyBuilder.HasMaxLength(7);
                        propertyBuilder.HasDefaultValue("#6366f1");
                    }
                );

            ObjectExtensionManager.Instance
                .MapEfCoreProperty<IdentityUser, string>(
                    "DefaultStrokeColor",
                    (entityBuilder, propertyBuilder) =>
                    {
                        propertyBuilder.HasMaxLength(7);
                        propertyBuilder.HasDefaultValue("#000000");
                    }
                );

            ObjectExtensionManager.Instance
                .MapEfCoreProperty<IdentityUser, int>(
                    "DefaultStrokeThickness",
                    (entityBuilder, propertyBuilder) =>
                    {
                        propertyBuilder.HasDefaultValue(4);
                    }
                );
        });
    }
}
