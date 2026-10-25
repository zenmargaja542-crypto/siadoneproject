# ============================================================
#   Study Tracker — tiny local web server (nothing to install)
#   ------------------------------------------------------------
#   Serves this folder at http://localhost:8000 so the real
#   Google / Facebook / GitHub sign-in windows can work.
#   (Browsers block sign-in popups on file:// pages.)
#
#   Keep this window OPEN while using the app.
#   Stop: press Ctrl+C (or just close this window).
#   ============================================================

$root = $PSScriptRoot
$port = 8000

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  Port $port is busy - the server is probably already running." -ForegroundColor Yellow
    Write-Host "  Just open:  http://localhost:$port/index.html"
    exit
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Study Tracker is live!" -ForegroundColor Green
Write-Host "   Open:  http://localhost:$port/index.html" -ForegroundColor Green
Write-Host "   Keep this window open. Ctrl+C to stop." -ForegroundColor Gray
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

$mime = @{
    ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"; ".json" = "application/json"
    ".jpg"  = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"
    ".gif"  = "image/gif"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
    ".md"   = "text/plain; charset=utf-8"; ".txt" = "text/plain; charset=utf-8"
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path -replace "/", "\")
    try {
        if ((Test-Path $file -PathType Leaf) -and ((Resolve-Path $file).Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase))) {
            $ext  = [System.IO.Path]::GetExtension($file).ToLower()
            $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $ctx.Response.ContentType = $type
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - not found")
            $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
        }
    } catch { }
    finally { try { $ctx.Response.OutputStream.Close() } catch { } }
}