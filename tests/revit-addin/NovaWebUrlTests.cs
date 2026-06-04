using Nova.RevitAddin;
using Xunit;

namespace Nova.RevitAddin.Tests;

public class NovaWebUrlTests
{
    private const string Hub = "ws://127.0.0.1:8765";
    private const string Token = "nova-local";

    [Fact]
    public void Build_AppendsAllConnectParams_WithQuestionMarkSeparator()
    {
        var url = NovaWebUrl.Build("https://hi-nova.work/", Hub, Token, "revit-local");

        Assert.StartsWith("https://hi-nova.work/?", url);
        Assert.Contains("novaConnectOpen=1", url);
        Assert.Contains("novaConnectAuto=1", url);
        Assert.Contains("novaConnectUrl=ws%3A%2F%2F127.0.0.1%3A8765", url);
        Assert.Contains("novaConnectToken=nova-local", url);
        Assert.Contains("novaConnectProject=revit-local", url);
    }

    [Fact]
    public void Build_UsesAmpersand_WhenBaseUrlAlreadyHasQuery()
    {
        var url = NovaWebUrl.Build("https://hi-nova.work/?ref=ribbon", Hub, Token, "p1");

        Assert.Contains("?ref=ribbon&novaConnectOpen=1", url);
        Assert.DoesNotContain("??", url);
    }

    [Fact]
    public void Build_EscapesProjectPath()
    {
        var url = NovaWebUrl.Build("https://hi-nova.work/", Hub, Token, @"C:\Projects\Tower A.rvt");

        // Backslashes, spaces and the drive colon must be percent-encoded.
        Assert.Contains("novaConnectProject=C%3A%5CProjects%5CTower%20A.rvt", url);
        Assert.DoesNotContain(" ", url);
    }

    [Fact]
    public void Build_HandlesNullTokenAndProject_WithoutThrowing()
    {
        var url = NovaWebUrl.Build("https://hi-nova.work/", Hub, null!, null!);

        Assert.Contains("novaConnectToken=", url);
        Assert.Contains("novaConnectProject=", url);
    }

    [Fact]
    public void Build_HandlesEmptyBaseUrl()
    {
        var url = NovaWebUrl.Build("", Hub, Token, "p1");

        Assert.StartsWith("?novaConnectOpen=1", url);
    }
}
