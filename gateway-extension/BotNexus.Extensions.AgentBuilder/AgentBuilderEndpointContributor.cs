using System;
using System.IO;
using System.Text.RegularExpressions;
using BotNexus.Gateway.Abstractions.Extensions;
using BotNexus.Gateway.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

namespace BotNexus.Extensions.AgentBuilder;

/// <summary>
/// Serves the prebuilt Agent Builder SPA (static files bundled in <c>wwwroot/</c>) under
/// <c>/agent-builder</c>, and exposes a small deploy API the SPA uses to write an agent's
/// definition markdown into <c>~/.botnexus/agents/&lt;id&gt;/</c>. Because the app is served by
/// the gateway itself it is same-origin, so its read/deploy calls need no CORS configuration.
///
/// Registration of the agent (config.json + live registry) is done by the SPA against the
/// gateway's own atomic <c>POST /api/agents</c>; this extension only owns the one thing that
/// has no REST endpoint — writing the top-level SOUL/IDENTITY/AGENTS/TOOLS markdown files.
/// </summary>
public sealed class AgentBuilderEndpointContributor : IEndpointContributor
{
    private const string RoutePrefix = "/agent-builder";
    private static readonly Regex AgentIdPattern = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);

    public void MapEndpoints(WebApplication app)
    {
        MapDeployApi(app);
        MapStaticSpa(app);
    }

    /// <summary>POST /agent-builder/api/agents/{id}/files — write an agent's definition markdown.</summary>
    private static void MapDeployApi(WebApplication app)
    {
        app.MapPost($"{RoutePrefix}/api/agents/{{id}}/files",
            (string id, AgentFilesRequest body, BotNexusHome home,
             ILogger<AgentBuilderEndpointContributor> logger) =>
        {
            if (string.IsNullOrWhiteSpace(id) || !AgentIdPattern.IsMatch(id))
                return Results.BadRequest(new { error = "Invalid agent id (expected lowercase kebab-case)." });

            var dir = home.GetAgentDirectory(id);
            try
            {
                Directory.CreateDirectory(dir);
                var written = 0;
                written += WriteIfPresent(dir, "SOUL.md", body.Soul);
                written += WriteIfPresent(dir, "IDENTITY.md", body.Identity);
                written += WriteIfPresent(dir, "AGENTS.md", body.Agents);
                written += WriteIfPresent(dir, "TOOLS.md", body.Tools);
                written += WriteIfPresent(dir, "USER.md", body.User);
                return Results.Ok(new { id, directory = dir, filesWritten = written });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Agent Builder: failed to write definition files for {Id}", id);
                return Results.Problem($"Failed to write agent files: {ex.Message}");
            }
        });
    }

    private static int WriteIfPresent(string dir, string filename, string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return 0;
        File.WriteAllText(Path.Combine(dir, filename), content);
        return 1;
    }

    /// <summary>Serves the SPA's static files under the route prefix, with SPA fallback.</summary>
    private static void MapStaticSpa(WebApplication app)
    {
        var extensionDir = Path.GetDirectoryName(typeof(AgentBuilderEndpointContributor).Assembly.Location)!;
        var webRoot = Path.Combine(extensionDir, "wwwroot");
        var indexPath = Path.Combine(webRoot, "index.html");

        if (!File.Exists(indexPath))
        {
            app.Services.GetService<ILogger<AgentBuilderEndpointContributor>>()?.LogWarning(
                "Agent Builder web root not found at {Path} — skipping {Prefix} static registration.",
                indexPath, RoutePrefix);
            return;
        }

        var files = new PhysicalFileProvider(webRoot);

        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? string.Empty;
            if (!path.StartsWith(RoutePrefix, StringComparison.OrdinalIgnoreCase))
            {
                await next();
                return;
            }

            var relative = path[RoutePrefix.Length..];

            // Let the deploy API (and any future /agent-builder/api/* route) reach its endpoint
            // rather than being captured by the static/SPA-fallback handler below.
            if (relative.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                await next();
                return;
            }

            // "/agent-builder" (no trailing slash) → redirect so relative asset URLs resolve.
            if (relative.Length == 0)
            {
                context.Response.Redirect(RoutePrefix + "/", permanent: false);
                return;
            }

            if (relative == "/")
                relative = "/index.html";

            var fileInfo = files.GetFileInfo(relative);

            // Client-side path with no file on disk and no extension → serve the SPA document.
            if ((!fileInfo.Exists || fileInfo.IsDirectory) && !relative.Contains('.'))
            {
                relative = "/index.html";
                fileInfo = files.GetFileInfo(relative);
            }

            if (!fileInfo.Exists || fileInfo.IsDirectory)
            {
                await next();
                return;
            }

            context.Response.ContentType = GetContentType(relative);
            context.Response.Headers.CacheControl =
                relative.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase)
                    ? "public, max-age=31536000, immutable"
                    : "no-cache";

            await context.Response.SendFileAsync(fileInfo);
        });
    }

    private static string GetContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" or ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" or ".map" => "application/json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".ico" => "image/x-icon",
        ".woff2" => "font/woff2",
        ".woff" => "font/woff",
        ".ttf" => "font/ttf",
        ".wasm" => "application/wasm",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
}

/// <summary>The agent definition markdown the SPA sends to the deploy API (camelCase JSON).</summary>
/// <remarks>
/// There is deliberately no WORLD.md here. The gateway reads its world file from
/// <c>~/.botnexus/WORLD.md</c> - one file shared by every agent, injected ahead of everything
/// else - so a WORLD.md written into an agent's own directory is never loaded. Writing one
/// produced a file that looked right and did nothing. An older client that still sends a
/// <c>world</c> property is unaffected: unknown JSON properties are ignored.
/// </remarks>
public sealed record AgentFilesRequest(
    string? Soul,
    string? Identity,
    string? Agents,
    string? Tools,
    string? User);
