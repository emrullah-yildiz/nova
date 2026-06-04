using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Nova.RevitAddin;

/// <summary>
/// Produces the connection-state icons (a filled red or green dot) entirely in
/// code so no binary image assets have to be committed to the repo. Each color
/// is rendered once at the two sizes the Revit ribbon asks for — 32x32 for
/// <c>PushButton.LargeImage</c> and 16x16 for <c>PushButton.Image</c> — and the
/// resulting <see cref="ImageSource"/> instances are cached and frozen so they
/// can be handed to the ribbon from any thread.
/// </summary>
internal static class DotIcons
{
    // Solid, high-contrast dots. The off (disconnected) state is red; the on
    // (connected) state is green.
    private static readonly Color OffColor = Color.FromRgb(0xD3, 0x2F, 0x2F);   // red
    private static readonly Color OnColor = Color.FromRgb(0x2E, 0x7D, 0x32);    // green
    private static readonly Color NovaColor = Color.FromRgb(0x3B, 0x82, 0xF6);  // Nova blue

    private static ImageSource? _redLarge;
    private static ImageSource? _redSmall;
    private static ImageSource? _greenLarge;
    private static ImageSource? _greenSmall;
    private static ImageSource? _novaLarge;
    private static ImageSource? _novaSmall;

    /// <summary>32x32 red dot for the disconnected state's LargeImage.</summary>
    public static ImageSource RedLarge => _redLarge ??= CreateDot(OffColor, 32);

    /// <summary>16x16 red dot for the disconnected state's Image.</summary>
    public static ImageSource RedSmall => _redSmall ??= CreateDot(OffColor, 16);

    /// <summary>32x32 green dot for the connected state's LargeImage.</summary>
    public static ImageSource GreenLarge => _greenLarge ??= CreateDot(OnColor, 32);

    /// <summary>16x16 green dot for the connected state's Image.</summary>
    public static ImageSource GreenSmall => _greenSmall ??= CreateDot(OnColor, 16);

    /// <summary>32x32 Nova-blue dot for the Open Nova button's LargeImage.</summary>
    public static ImageSource NovaLarge => _novaLarge ??= CreateDot(NovaColor, 32);

    /// <summary>16x16 Nova-blue dot for the Open Nova button's Image.</summary>
    public static ImageSource NovaSmall => _novaSmall ??= CreateDot(NovaColor, 16);

    /// <summary>
    /// Renders a single filled circle of <paramref name="fill"/> on a transparent
    /// square of <paramref name="size"/> px and returns it as a frozen
    /// <see cref="BitmapSource"/>. A subtle darker rim is drawn so the dot reads
    /// clearly against both light and dark ribbon themes.
    /// </summary>
    private static BitmapSource CreateDot(Color fill, int size)
    {
        // Leave a 1px margin so the dot's edge is not clipped by the bitmap bounds.
        double margin = Math.Max(1.0, size / 16.0);
        double radius = (size / 2.0) - margin;
        var center = new Point(size / 2.0, size / 2.0);

        var rim = Color.FromArgb(0x66, 0x00, 0x00, 0x00);
        var pen = new Pen(new SolidColorBrush(rim), Math.Max(1.0, size / 24.0));
        pen.Freeze();
        var brush = new SolidColorBrush(fill);
        brush.Freeze();

        var visual = new DrawingVisual();
        using (var ctx = visual.RenderOpen())
        {
            ctx.DrawEllipse(brush, pen, center, radius, radius);
        }

        var bitmap = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return bitmap;
    }
}
