using System.Reflection;
using System.Security;
using System.Text;
using Microsoft.Win32;

const string ProductName = "Nova Connect";
const string Publisher = "Nova";
const string RevitVersion = "2027";
const string DllResource = "Payload.Nova.RevitAddin.dll";
const string DepsResource = "Payload.Nova.RevitAddin.deps.json";
const string TemplateResource = "Payload.Nova.addin.template";
const string UninstallKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaConnect";

var quiet = args.Any(IsQuietArg);
var uninstall = args.Any(arg => arg.Equals("/uninstall", StringComparison.OrdinalIgnoreCase) ||
                               arg.Equals("--uninstall", StringComparison.OrdinalIgnoreCase));

try
{
    var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
    if (string.IsNullOrWhiteSpace(appData))
    {
        Fail("Could not locate the current user's AppData folder.");
        return 1;
    }

    var addinsDir = Path.Combine(appData, "Autodesk", "Revit", "Addins", RevitVersion);
    var novaDir = Path.Combine(addinsDir, "Nova");
    var addinPath = Path.Combine(addinsDir, "Nova.addin");
    var dllTarget = Path.Combine(novaDir, "Nova.RevitAddin.dll");
    var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    var installerStoreDir = string.IsNullOrWhiteSpace(localAppData)
        ? novaDir
        : Path.Combine(localAppData, "Programs", "Nova Connect");
    var installedInstallerPath = Path.Combine(installerStoreDir, "NovaConnect-Setup.exe");

    WriteHeader(uninstall);

    if (uninstall)
    {
        Uninstall(addinPath, novaDir, installerStoreDir);
        ExitPause(quiet);
        return 0;
    }

    if (!RevitIsDetected(addinsDir))
    {
        Warn($"Autodesk Revit {RevitVersion} was not detected on this PC.");
        Warn($"Nova Connect is built for Revit {RevitVersion} and will load only after that version is installed.");
        if (!quiet && !Confirm("Continue installing anyway? [y/N] "))
        {
            Info("Installation cancelled.");
            ExitPause(quiet);
            return 0;
        }
    }
    else
    {
        Ok($"Autodesk Revit {RevitVersion} detected.");
    }

    Directory.CreateDirectory(novaDir);

    ExtractResource(DllResource, dllTarget, required: true);
    Ok($"Copied add-in to {dllTarget}");

    var depsTarget = Path.Combine(novaDir, "Nova.RevitAddin.deps.json");
    if (ExtractResource(DepsResource, depsTarget, required: false))
    {
        Ok($"Copied dependency metadata to {depsTarget}");
    }

    var template = ReadResourceText(TemplateResource);
    var manifest = template.Replace("{{ASSEMBLY_PATH}}", SecurityElement.Escape(dllTarget));
    File.WriteAllText(addinPath, manifest, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    Ok($"Wrote Revit manifest to {addinPath}");

    CopyInstallerForUninstall(installedInstallerPath);
    RegisterUninstallEntry(installedInstallerPath);

    Console.WriteLine();
    Ok("Nova Connect was installed successfully.");
    Info($"Restart Autodesk Revit {RevitVersion}, then open Add-Ins > External Tools > Nova Connect.");
    ExitPause(quiet);
    return 0;
}
catch (Exception ex)
{
    Fail(ex.Message);
    if (ex is not IOException and not UnauthorizedAccessException)
    {
        Console.WriteLine(ex);
    }
    ExitPause(quiet);
    return 1;
}

static bool IsQuietArg(string arg) =>
    arg.Equals("/quiet", StringComparison.OrdinalIgnoreCase) ||
    arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
    arg.Equals("--quiet", StringComparison.OrdinalIgnoreCase) ||
    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase);

static bool RevitIsDetected(string addinsDir)
{
    var revitExe = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "Autodesk",
        $"Revit {RevitVersion}",
        "Revit.exe");
    return File.Exists(revitExe) || Directory.Exists(addinsDir);
}

static void Uninstall(string addinPath, string novaDir, string installerStoreDir)
{
    var removed = false;
    if (File.Exists(addinPath))
    {
        File.Delete(addinPath);
        Ok($"Removed {addinPath}");
        removed = true;
    }

    if (Directory.Exists(novaDir))
    {
        Directory.Delete(novaDir, recursive: true);
        Ok($"Removed {novaDir}");
        removed = true;
    }

    if (removed)
    {
        Ok("Nova Connect was removed. Restart Revit to complete.");
    }
    else
    {
        Warn($"Nova Connect was not installed for Revit {RevitVersion}.");
    }

    RemoveUninstallEntry();
    RemoveInstallerStore(installerStoreDir);
}

static bool ExtractResource(string resourceName, string targetPath, bool required)
{
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
    if (stream is null)
    {
        if (required) throw new InvalidOperationException($"Installer payload is missing: {resourceName}");
        return false;
    }

    Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
    using var file = File.Create(targetPath);
    stream.CopyTo(file);
    return true;
}

static string ReadResourceText(string resourceName)
{
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
        ?? throw new InvalidOperationException($"Installer payload is missing: {resourceName}");
    using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
    return reader.ReadToEnd();
}

static void CopyInstallerForUninstall(string installedInstallerPath)
{
    var currentPath = Environment.ProcessPath;
    if (string.IsNullOrWhiteSpace(currentPath) || !File.Exists(currentPath))
    {
        Warn("Could not locate the running installer, so Windows uninstall registration was skipped.");
        return;
    }

    Directory.CreateDirectory(Path.GetDirectoryName(installedInstallerPath)!);
    if (!Path.GetFullPath(currentPath).Equals(Path.GetFullPath(installedInstallerPath), StringComparison.OrdinalIgnoreCase))
    {
        File.Copy(currentPath, installedInstallerPath, overwrite: true);
    }

    Ok($"Registered uninstaller at {installedInstallerPath}");
}

static void RegisterUninstallEntry(string installedInstallerPath)
{
    using var key = Registry.CurrentUser.CreateSubKey(UninstallKeyPath, writable: true)
        ?? throw new InvalidOperationException("Could not create the Windows uninstall registry entry.");

    var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";
    var estimatedSizeKb = File.Exists(installedInstallerPath)
        ? Math.Max(1, (int)Math.Round(new FileInfo(installedInstallerPath).Length / 1024.0))
        : 1;

    key.SetValue("DisplayName", ProductName, RegistryValueKind.String);
    key.SetValue("DisplayVersion", version, RegistryValueKind.String);
    key.SetValue("Publisher", Publisher, RegistryValueKind.String);
    key.SetValue("InstallLocation", Path.GetDirectoryName(installedInstallerPath) ?? string.Empty, RegistryValueKind.String);
    key.SetValue("DisplayIcon", Quote(installedInstallerPath), RegistryValueKind.String);
    key.SetValue("UninstallString", $"{Quote(installedInstallerPath)} /uninstall", RegistryValueKind.String);
    key.SetValue("QuietUninstallString", $"{Quote(installedInstallerPath)} /uninstall /quiet", RegistryValueKind.String);
    key.SetValue("EstimatedSize", estimatedSizeKb, RegistryValueKind.DWord);
    key.SetValue("NoModify", 1, RegistryValueKind.DWord);
    key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
}

static void RemoveUninstallEntry()
{
    Registry.CurrentUser.DeleteSubKeyTree(UninstallKeyPath, throwOnMissingSubKey: false);
}

static void RemoveInstallerStore(string installerStoreDir)
{
    if (!Directory.Exists(installerStoreDir)) return;

    var currentPath = Environment.ProcessPath;
    var currentDir = string.IsNullOrWhiteSpace(currentPath) ? string.Empty : Path.GetDirectoryName(currentPath);
    if (currentDir is not null &&
        Path.GetFullPath(currentDir).Equals(Path.GetFullPath(installerStoreDir), StringComparison.OrdinalIgnoreCase))
    {
        Warn($"The uninstaller copy remains at {currentPath} because Windows is running it right now.");
        return;
    }

    Directory.Delete(installerStoreDir, recursive: true);
}

static string Quote(string path) => "\"" + path.Replace("\"", "\\\"") + "\"";

static bool Confirm(string prompt)
{
    Console.Write(prompt);
    var answer = Console.ReadLine();
    return answer is not null &&
           (answer.Equals("y", StringComparison.OrdinalIgnoreCase) ||
            answer.Equals("yes", StringComparison.OrdinalIgnoreCase));
}

static void WriteHeader(bool uninstall)
{
    Console.ForegroundColor = ConsoleColor.White;
    Console.WriteLine("=====================================================");
    Console.WriteLine(uninstall
        ? $" Nova Connect - Revit {RevitVersion} add-in uninstaller"
        : $" Nova Connect - Revit {RevitVersion} add-in installer");
    Console.WriteLine("=====================================================");
    Console.ResetColor();
    Console.WriteLine();
}

static void Info(string message)
{
    Console.ForegroundColor = ConsoleColor.White;
    Console.WriteLine(message);
    Console.ResetColor();
}

static void Ok(string message)
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine(message);
    Console.ResetColor();
}

static void Warn(string message)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine(message);
    Console.ResetColor();
}

static void Fail(string message)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.Error.WriteLine("ERROR: " + message);
    Console.ResetColor();
}

static void ExitPause(bool quiet)
{
    if (quiet) return;
    Console.WriteLine();
    Console.Write("Press Enter to exit...");
    Console.ReadLine();
}
