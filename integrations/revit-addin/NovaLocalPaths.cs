using System;
using System.IO;
using System.Linq;
using System.Reflection;

namespace Nova.RevitAddin;

/// <summary>
/// Dev-only path helpers. As of Approach C the local Connect hub runs IN-PROCESS
/// (<see cref="NovaHub"/>) and no longer needs Node or a Nova checkout, so the
/// hub no longer calls into here. These helpers survive solely for the OPTIONAL
/// "Open Nova against a localhost dev server" path (<see cref="NovaWebProcess"/>),
/// which only fires when the Nova URL is <c>http://127.0.0.1:8080</c> — never for
/// the default production URL. <c>NOVA_REPO_ROOT</c> is therefore a dev-only knob
/// for that one path; the Connect toggle does not depend on it.
/// </summary>
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
