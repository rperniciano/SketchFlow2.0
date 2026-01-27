using System.ComponentModel.DataAnnotations;
using Volo.Abp.Identity;
using Volo.Abp.ObjectExtending;
using Volo.Abp.Threading;

namespace SketchFlow;

public static class SketchFlowModuleExtensionConfigurator
{
    private static readonly OneTimeRunner OneTimeRunner = new OneTimeRunner();

    public static void Configure()
    {
        OneTimeRunner.Run(() =>
        {
            ConfigureExistingProperties();
            ConfigureExtraProperties();
        });
    }

    private static void ConfigureExistingProperties()
    {
        /* You can change max lengths for properties of the
         * entities defined in the modules used by your application.
         *
         * Example: Change user and role name max lengths

           AbpUserConsts.MaxNameLength = 99;
           IdentityRoleConsts.MaxNameLength = 99;

         * Notice: It is not suggested to change property lengths
         * unless you really need it. Go with the standard values wherever possible.
         *
         * If you are using EF Core, you will need to run the add-migration command after your changes.
         */
    }

    private static void ConfigureExtraProperties()
    {
        // Configure extra properties for IdentityUser
        // These properties are used for user preferences and profile customization
        ObjectExtensionManager.Instance.Modules()
            .ConfigureIdentity(identity =>
            {
                identity.ConfigureUser(user =>
                {
                    // Cursor color for real-time collaboration (hex color code)
                    user.AddOrUpdateProperty<string>(
                        "CursorColor",
                        property =>
                        {
                            property.DefaultValue = "#6366f1"; // Default indigo
                            property.Attributes.Add(new StringLengthAttribute(7) { MinimumLength = 7 });
                        }
                    );

                    // Default stroke color for drawing (hex color code)
                    user.AddOrUpdateProperty<string>(
                        "DefaultStrokeColor",
                        property =>
                        {
                            property.DefaultValue = "#000000"; // Default black
                            property.Attributes.Add(new StringLengthAttribute(7) { MinimumLength = 7 });
                        }
                    );

                    // Default stroke thickness for drawing (2, 4, or 8 pixels)
                    user.AddOrUpdateProperty<int>(
                        "DefaultStrokeThickness",
                        property =>
                        {
                            property.DefaultValue = 4; // Default medium
                            property.Attributes.Add(new RangeAttribute(2, 8));
                        }
                    );
                });
            });
    }
}
