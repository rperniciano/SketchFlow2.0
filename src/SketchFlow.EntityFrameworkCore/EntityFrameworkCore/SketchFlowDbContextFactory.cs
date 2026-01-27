using System;
using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace SketchFlow.EntityFrameworkCore;

/* This class is needed for EF Core console commands
 * (like Add-Migration and Update-Database commands) */
public class SketchFlowDbContextFactory : IDesignTimeDbContextFactory<SketchFlowDbContext>
{
    public SketchFlowDbContext CreateDbContext(string[] args)
    {
        var configuration = BuildConfiguration();
        
        SketchFlowEfCoreEntityExtensionMappings.Configure();

        var builder = new DbContextOptionsBuilder<SketchFlowDbContext>()
            .UseSqlServer(configuration.GetConnectionString("Default"));
        
        return new SketchFlowDbContext(builder.Options);
    }

    private static IConfigurationRoot BuildConfiguration()
    {
        var builder = new ConfigurationBuilder()
            .SetBasePath(Path.Combine(Directory.GetCurrentDirectory(), "../SketchFlow.DbMigrator/"))
            .AddJsonFile("appsettings.json", optional: false)
            .AddEnvironmentVariables();

        return builder.Build();
    }
}
