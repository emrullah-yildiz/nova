using System;
using System.IO;
using System.Linq;
using System.Reflection;

namespace Nova.RevitAddin;

internal static class NovaLocalPaths
{
    public static string FindRepoRoot()
    {
        var candidates = new[]
        {
            Environment.GetEnvironmentVariable("NOVA_REPO_ROOT"),
            Directory.GetCurrentDirectory(),
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
        }.Where(path => !string.IsNullOrWhiteSpace(path)).Cast<string>();

        foreach (var candidate in candidates)
        {
            var root = WalkUpForRepo(candidate);
            if (root != null) return root;
        }

        throw new DirectoryNotFoundException("Could not locate Nova repository root. Set NOVA_REPO_ROOT to the repository folder.");
    }

    public static string FindNodeExecutable()
    {
        var env = Environment.GetEnvironmentVariable("NOVA_NODE_EXE");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var node = Path.Combine(programFiles, "nodejs", "node.exe");
        if (File.Exists(node)) return node;

        return "node";
    }

    public static string FindNpmExecutable()
    {
        var env = Environment.GetEnvironmentVariable("NOVA_NPM_EXE");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var npm = Path.Combine(programFiles, "nodejs", "npm.cmd");
        if (File.Exists(npm)) return npm;

        return "npm";
    }

    private static string? WalkUpForRepo(string start)
    {
        var directory = new DirectoryInfo(start);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                File.Exists(Path.Combine(directory.FullName, "scripts", "connect-hub.cjs")))
            {
                return directory.FullName;
            }
            directory = directory.Parent;
        }
        return null;
    }
}
