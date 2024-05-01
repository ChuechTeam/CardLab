using System.ComponentModel;
using System.Reflection;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Razor.TagHelpers;
using Microsoft.Extensions.Options;
using Vite.AspNetCore;
using Vite.AspNetCore.Services;
using Vite.AspNetCore.TagHelpers;

namespace CardLab;

// This custom tag helper is necessary so we get correct dev server requests on clients that aren't
// localhost.
// It's very ugly, but it works.

[HtmlTargetElement("script", Attributes = "vite-src")]
[HtmlTargetElement("link", Attributes = "vite-href")]
[EditorBrowsable(EditorBrowsableState.Never)]
public sealed class CustomViteTagHelper : ViteTagHelper
{
#if DEBUG
    private readonly IOptions<ViteOptions> _viteOptions;

    private static readonly FieldInfo DevServerField = typeof(ViteTagHelper)
        .GetField("devServerStatus", BindingFlags.Instance | BindingFlags.NonPublic)!;

    public CustomViteTagHelper(ILogger<CustomViteTagHelper> logger, IViteManifest manifest,
        IViteDevServerStatus devServerStatus, ViteDevScriptMonitor helperService, IOptions<ViteOptions> viteOptions,
        IUrlHelperFactory urlHelperFactory) : base(logger, manifest, 
        new FakeDevServerStatus(devServerStatus), helperService, viteOptions,
        urlHelperFactory)
    {
        _viteOptions = viteOptions;
        var fakeStatus = (FakeDevServerStatus) DevServerField.GetValue(this)!;
        fakeStatus.me = this;
    }
    
    private sealed class FakeDevServerStatus(IViteDevServerStatus real) 
        : IViteDevServerStatus
    {
        public CustomViteTagHelper me = null!;
        
        // assuming base path is empty
        public string ServerUrlWithBasePath => ServUrl();

        public string ServerUrl => ServUrl();

        public bool IsMiddlewareEnable => real.IsMiddlewareEnable;

        public bool IsEnabled => real.IsEnabled;

        private string ServUrl()
        {
            var ctx = me.ViewContext.HttpContext;
            var port = me._viteOptions.Value.Server.Port ?? 5173;
            return ctx.Request.Scheme + "://" + ctx.Request.Host.Host + ":" + port;
        }
    }
#else
    public CustomViteTagHelper(ILogger<CustomViteTagHelper> logger, IViteManifest manifest,
        IViteDevServerStatus devServerStatus, ViteDevScriptMonitor helperService, IOptions<ViteOptions> viteOptions,
        IUrlHelperFactory urlHelperFactory) : base(logger, manifest, devServerStatus, helperService, viteOptions,
        urlHelperFactory)
    {
    }
#endif
}