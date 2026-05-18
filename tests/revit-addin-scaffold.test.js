import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const addinDir = join(process.cwd(), 'integrations', 'revit-addin');

describe('Revit add-in launcher scaffold', () => {
  it('defines a Revit external application and launch command', () => {
    const appSource = readFileSync(join(addinDir, 'App.cs'), 'utf8');
    const commandSource = readFileSync(join(addinDir, 'OpenNovaCommand.cs'), 'utf8');

    expect(appSource).toContain('public class App : IExternalApplication');
    expect(appSource).toContain('Open\\nNova');
    expect(commandSource).toContain('public class OpenNovaCommand : IExternalCommand');
    expect(commandSource).toContain('NovaLauncher.OpenNova');
  });

  it('builds Nova launch URLs with Connect panel parameters', () => {
    const launcherSource = readFileSync(join(addinDir, 'NovaLauncher.cs'), 'utf8');

    expect(launcherSource).toContain('novaConnectOpen=1');
    expect(launcherSource).toContain('novaConnectUrl=');
    expect(launcherSource).toContain('novaConnectToken=');
    expect(launcherSource).toContain('nova-connect-launch.json');
  });

  it('includes a Revit add-in manifest template and local install script', () => {
    const project = readFileSync(join(addinDir, 'Nova.RevitAddin.csproj'), 'utf8');
    const manifest = readFileSync(join(addinDir, 'Nova.addin.template'), 'utf8');
    const installScript = readFileSync(join(addinDir, 'install-local.ps1'), 'utf8');

    expect(project).toContain('<TargetFramework>net10.0-windows</TargetFramework>');
    expect(project).toContain('<RevitVersion Condition="\'$(RevitVersion)\' == \'\'">2027</RevitVersion>');
    expect(manifest).toContain('<FullClassName>Nova.RevitAddin.App</FullClassName>');
    expect(manifest).toContain('{{ASSEMBLY_PATH}}');
    expect(installScript).toContain('dotnet build');
    expect(installScript).toContain('Autodesk\\Revit\\Addins');
    expect(installScript).toContain('net10.0-windows');
  });
});
