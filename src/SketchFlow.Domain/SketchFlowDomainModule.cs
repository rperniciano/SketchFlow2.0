using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SketchFlow.Localization;
using SketchFlow.MultiTenancy;
using System;
using Volo.Abp.Localization;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.PermissionManagement.Identity;
using Volo.Abp.SettingManagement;
using Volo.Abp.BlobStoring.Database;
using Volo.Abp.Caching;
using Volo.Abp.OpenIddict;
using Volo.Abp.PermissionManagement.OpenIddict;
using Volo.Abp.AuditLogging;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Emailing;
using Volo.Abp.FeatureManagement;
using Volo.Abp.Identity;
using SketchFlow.Email;

namespace SketchFlow;

[DependsOn(
    typeof(SketchFlowDomainSharedModule),
    typeof(AbpAuditLoggingDomainModule),
    typeof(AbpCachingModule),
    typeof(AbpBackgroundJobsDomainModule),
    typeof(AbpFeatureManagementDomainModule),
    typeof(AbpPermissionManagementDomainIdentityModule),
    typeof(AbpPermissionManagementDomainOpenIddictModule),
    typeof(AbpSettingManagementDomainModule),
    typeof(AbpEmailingModule),
    typeof(AbpIdentityDomainModule),
    typeof(AbpOpenIddictDomainModule),
    typeof(BlobStoringDatabaseDomainModule)
    )]
public class SketchFlowDomainModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpMultiTenancyOptions>(options =>
        {
            options.IsEnabled = MultiTenancyConsts.IsEnabled;
        });

        // Configure Identity options
        Configure<IdentityOptions>(options =>
        {
            // Require email confirmation for sign-in
            options.SignIn.RequireConfirmedEmail = false; // ABP handles this differently via settings
            options.SignIn.RequireConfirmedAccount = false;

            // Password settings matching app_spec.txt requirements
            options.Password.RequiredLength = 8;
            options.Password.RequireDigit = false;
            options.Password.RequireLowercase = false;
            options.Password.RequireUppercase = false;
            options.Password.RequireNonAlphanumeric = false;

            // User settings
            options.User.RequireUniqueEmail = true;
        });

        // Configure email verification token to expire after 24 hours
        // This matches the app_spec.txt requirement: "24h link expiry"
        context.Services.Configure<DataProtectionTokenProviderOptions>(options =>
        {
            options.TokenLifespan = TimeSpan.FromHours(24);
        });

#if DEBUG
        // Use console email sender in debug mode to log verification links to terminal
        context.Services.Replace(ServiceDescriptor.Transient<Volo.Abp.Emailing.IEmailSender, ConsoleEmailSender>());
#endif
    }
}
