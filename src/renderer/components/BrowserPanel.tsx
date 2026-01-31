import { useState, useRef, useCallback, useEffect, useMemo } from "react";

type BrowserPanelProps = {
  onNavigate?: (url: string) => void;
  onSnapshot?: (data: { url: string; title: string; html?: string }) => void;
};

export function BrowserPanel({ onNavigate, onSnapshot }: BrowserPanelProps) {
  const [url, setUrl] = useState("https://www.google.com");
  const [inputUrl, setInputUrl] = useState("https://www.google.com");
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  // Navigate to URL
  const navigate = useCallback((targetUrl: string) => {
    const webview = webviewRef.current;
    if (!webview) return;
    
    // Ensure URL has protocol
    let finalUrl = targetUrl;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      finalUrl = "https://" + targetUrl;
    }
    
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    webview.src = finalUrl;
    onNavigate?.(finalUrl);
  }, [onNavigate]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  }, [inputUrl, navigate]);

  // Navigation controls
  const goBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const goForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const reload = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // Take snapshot for Codex context
  const takeSnapshot = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview) return;

    try {
      // Get page HTML
      const html = await webview.executeJavaScript(`document.documentElement.outerHTML`);
      const currentTitle = await webview.executeJavaScript(`document.title`);
      
      onSnapshot?.({
        url: webview.src,
        title: currentTitle,
        html: html,
      });
    } catch (err) {
      console.error("Failed to take snapshot:", err);
    }
  }, [onSnapshot]);

  // Execute JavaScript in webview
  const executeJS = useCallback(async (code: string) => {
    const webview = webviewRef.current;
    if (!webview) return null;
    
    try {
      return await webview.executeJavaScript(code);
    } catch (err) {
      console.error("Failed to execute JS:", err);
      return null;
    }
  }, []);

  const screenshot = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview) {
      throw new Error("Webview not ready");
    }

    try {
      const image = await (webview as any).capturePage();
      return image.toDataURL();
    } catch (err) {
      console.error("Failed to capture screenshot:", err);
      throw err;
    }
  }, []);

  const click = useCallback(async (selector: string) => {
    const webview = webviewRef.current;
    if (!webview) return false;

    const script = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      if ("scrollIntoView" in el) {
        el.scrollIntoView({ block: "center", inline: "center" });
      }
      el.click();
      return true;
    })()`;

    try {
      return Boolean(await webview.executeJavaScript(script));
    } catch (err) {
      console.error("Failed to click element:", err);
      return false;
    }
  }, []);

  const type = useCallback(async (selector: string, text: string) => {
    const webview = webviewRef.current;
    if (!webview) return false;

    const script = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;

      const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (isInput) {
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      if (el.isContentEditable) {
        el.focus();
        el.textContent = ${JSON.stringify(text)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }

      return false;
    })()`;

    try {
      return Boolean(await webview.executeJavaScript(script));
    } catch (err) {
      console.error("Failed to type into element:", err);
      return false;
    }
  }, []);

  // Store callbacks in refs to keep stable references for window.browserPanel
  const callbacksRef = useRef({ navigate, goBack, goForward, reload, takeSnapshot, executeJS, screenshot, click, type, url, title });
  useEffect(() => {
    callbacksRef.current = { navigate, goBack, goForward, reload, takeSnapshot, executeJS, screenshot, click, type, url, title };
  });

  // Setup webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadStop = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
    const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      setTitle(e.title);
    };
    const handleNavigate = (e: Electron.DidNavigateEvent) => {
      setUrl(e.url);
      setInputUrl(e.url);
    };

    webview.addEventListener("did-start-loading", handleLoadStart);
    webview.addEventListener("did-stop-loading", handleLoadStop);
    webview.addEventListener("page-title-updated", handleTitleUpdate);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate as any);

    return () => {
      webview.removeEventListener("did-start-loading", handleLoadStart);
      webview.removeEventListener("did-stop-loading", handleLoadStop);
      webview.removeEventListener("page-title-updated", handleTitleUpdate);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate as any);
    };
  }, []);

  // Expose methods for external control
  // Uses ref to avoid recreating on every render
  useEffect(() => {
    window.browserPanel = {
      navigate: (...args) => callbacksRef.current.navigate(...args),
      goBack: () => callbacksRef.current.goBack(),
      goForward: () => callbacksRef.current.goForward(),
      reload: () => callbacksRef.current.reload(),
      takeSnapshot: () => callbacksRef.current.takeSnapshot(),
      executeJS: (...args) => callbacksRef.current.executeJS(...args),
      screenshot: () => callbacksRef.current.screenshot(),
      click: (...args) => callbacksRef.current.click(...args),
      type: (...args) => callbacksRef.current.type(...args),
      getUrl: () => callbacksRef.current.url,
      getTitle: () => callbacksRef.current.title,
    };
    
    return () => {
      delete window.browserPanel;
    };
  }, []);

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <div className="browser-nav">
          <button 
            className="browser-btn" 
            onClick={goBack} 
            disabled={!canGoBack}
            title="Back"
          >
            ←
          </button>
          <button 
            className="browser-btn" 
            onClick={goForward} 
            disabled={!canGoForward}
            title="Forward"
          >
            →
          </button>
          <button 
            className="browser-btn" 
            onClick={reload}
            title="Reload"
          >
            {isLoading ? "⏹" : "↻"}
          </button>
        </div>
        
        <form className="browser-url-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="browser-url-input"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL..."
          />
        </form>
        
        <div className="browser-actions">
          <button 
            className="browser-btn snapshot" 
            onClick={takeSnapshot}
            title="Snapshot for Codex"
          >
            📷
          </button>
        </div>
      </div>
      
      <div className="browser-content">
        <webview
          ref={webviewRef as any}
          src={url}
          className="browser-webview"
          // @ts-ignore - webview attributes
          allowpopups="true"
          // @ts-ignore
          webpreferences="contextIsolation=yes"
        />
      </div>
      
      {title && (
        <div className="browser-status">
          {title}
        </div>
      )}
    </div>
  );
}

export default BrowserPanel;
