using Xunit;

namespace SketchFlow.EntityFrameworkCore;

[CollectionDefinition(SketchFlowTestConsts.CollectionDefinitionName)]
public class SketchFlowEntityFrameworkCoreCollection : ICollectionFixture<SketchFlowEntityFrameworkCoreFixture>
{

}
