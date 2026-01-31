import { useState, useEffect, useCallback, useMemo } from "react";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
};

type FileTreeProps = {
  rootPath: string | null;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onAddToContext?: (path: string) => void;
};

// File icon based on extension
const getFileIcon = (name: string, type: "file" | "directory"): string => {
  if (type === "directory") return "📁";

  const ext = name.split(".").pop()?.toLowerCase() || "";

  const iconMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "📜",
    jsx: "⚛️",
    ts: "📘",
    tsx: "⚛️",
    mjs: "📜",
    cjs: "📜",

    // Web
    html: "🌐",
    htm: "🌐",
    css: "🎨",
    scss: "🎨",
    sass: "🎨",
    less: "🎨",

    // Data
    json: "📋",
    yaml: "📋",
    yml: "📋",
    xml: "📋",
    toml: "📋",

    // Documentation
    md: "📝",
    mdx: "📝",
    txt: "📄",
    rst: "📝",

    // Images
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    webp: "🖼️",
    ico: "🖼️",

    // Config
    env: "⚙️",
    gitignore: "⚙️",
    eslintrc: "⚙️",
    prettierrc: "⚙️",

    // Other languages
    py: "🐍",
    rb: "💎",
    go: "🔵",
    rs: "🦀",
    java: "☕",
    c: "📟",
    cpp: "📟",
    h: "📟",
    hpp: "📟",
    sh: "🖥️",
    bash: "🖥️",
    zsh: "🖥️",

    // Package
    lock: "🔒",
  };

  return iconMap[ext] || "📄";
};

function FileTreeNode({
  node,
  level,
  onToggle,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: {
  node: FileNode;
  level: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}) {
  const icon = getFileIcon(node.name, node.type);
  const indent = level * 16;

  const handleClick = () => {
    if (node.type === "directory") {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const handleDoubleClick = () => {
    if (node.type === "file") {
      onDoubleClick(node.path);
    }
  };

  return (
    <>
      <button
        className="file-tree-node"
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, node.path)}
        title={node.path}
      >
        {node.type === "directory" && (
          <span className="file-tree-expand">
            {node.isLoading ? "⏳" : node.isExpanded ? "▼" : "▶"}
          </span>
        )}
        <span className="file-tree-icon">{icon}</span>
        <span className="file-tree-name">{node.name}</span>
      </button>
      {node.type === "directory" && node.isExpanded && node.children && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FileTreeSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="file-tree-search">
      <input
        type="text"
        placeholder="Search files..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="file-tree-search-input"
      />
    </div>
  );
}

export function FileTree({
  rootPath,
  onFileSelect,
  onFileOpen,
  onAddToContext,
}: FileTreeProps) {
  const [rootNode, setRootNode] = useState<FileNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Map<string, FileNode[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!window.codex?.fs) return [];

    setLoadingPaths((prev) => new Set(prev).add(dirPath));

    try {
      const result = await window.codex.fs.listDirectory(dirPath);
      if (result.success && result.nodes) {
        const nodes: FileNode[] = result.nodes.map((n) => ({
          name: n.name,
          path: n.path,
          type: n.type,
        }));
        setChildrenCache((prev) => new Map(prev).set(dirPath, nodes));
        return nodes;
      }
    } catch (err) {
      console.error("Failed to load directory:", err);
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
    return [];
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ paths?: string[] }>).detail;
      const changedPaths = detail?.paths ?? [];
      if (changedPaths.length === 0) return;

      const parentPaths = new Set<string>();
      for (const changedPath of changedPaths) {
        const separatorIndex = Math.max(changedPath.lastIndexOf("/"), changedPath.lastIndexOf("\\"));
        if (separatorIndex > 0) {
          parentPaths.add(changedPath.slice(0, separatorIndex));
        }
      }

      if (parentPaths.size === 0) return;

      setChildrenCache((prev) => {
        const next = new Map(prev);
        for (const parentPath of parentPaths) {
          next.delete(parentPath);
        }
        return next;
      });

      parentPaths.forEach((parentPath) => {
        if (expandedPaths.has(parentPath)) {
          loadDirectory(parentPath);
        }
      });
    };

    window.addEventListener("chimera:fs-changed", handler as EventListener);
    return () => window.removeEventListener("chimera:fs-changed", handler as EventListener);
  }, [expandedPaths, loadDirectory]);

  // Initialize root directory
  useEffect(() => {
    if (!rootPath) {
      setRootNode(null);
      return;
    }

    const name = rootPath.split("/").pop() || rootPath;
    setRootNode({
      name,
      path: rootPath,
      type: "directory",
      isExpanded: true,
    });
    setExpandedPaths(new Set([rootPath]));
    loadDirectory(rootPath);
  }, [rootPath, loadDirectory]);

  // Toggle directory expansion
  const handleToggle = useCallback(
    async (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          // Load children if not cached
          if (!childrenCache.has(path)) {
            loadDirectory(path);
          }
        }
        return next;
      });
    },
    [childrenCache, loadDirectory]
  );

  // Build tree with expanded state
  const treeWithState = useMemo(() => {
    if (!rootNode) return null;

    const buildTree = (node: FileNode): FileNode => {
      const isExpanded = expandedPaths.has(node.path);
      const isLoading = loadingPaths.has(node.path);
      const children = childrenCache.get(node.path);

      return {
        ...node,
        isExpanded,
        isLoading,
        children: isExpanded && children ? children.map(buildTree) : undefined,
      };
    };

    return buildTree(rootNode);
  }, [rootNode, expandedPaths, loadingPaths, childrenCache]);

  // Filter tree based on search
  const filteredTree = useMemo(() => {
    if (!treeWithState || !searchQuery.trim()) return treeWithState;

    const query = searchQuery.toLowerCase();

    const filterNode = (node: FileNode): FileNode | null => {
      const nameMatches = node.name.toLowerCase().includes(query);

      if (node.type === "file") {
        return nameMatches ? node : null;
      }

      // For directories, check if any children match
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is FileNode => n !== null);

      if (nameMatches || (filteredChildren && filteredChildren.length > 0)) {
        return {
          ...node,
          isExpanded: true, // Auto-expand when searching
          children: filteredChildren,
        };
      }

      return null;
    };

    return filterNode(treeWithState);
  }, [treeWithState, searchQuery]);

  const handleSelect = useCallback(
    (path: string) => {
      onFileSelect?.(path);
    },
    [onFileSelect]
  );

  const handleDoubleClick = useCallback(
    (path: string) => {
      onFileOpen?.(path);
    },
    [onFileOpen]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => closeContextMenu();
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu, closeContextMenu]);

  if (!rootPath) {
    return (
      <div className="file-tree-empty">
        <p>No workspace selected</p>
      </div>
    );
  }

  return (
    <div className="file-tree">
      <FileTreeSearch value={searchQuery} onChange={setSearchQuery} />
      <div className="file-tree-content">
        {filteredTree ? (
          <FileTreeNode
            node={filteredTree}
            level={0}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <div className="file-tree-empty-search">No files match your search</div>
        )}
      </div>

      {contextMenu && (
        <div
          className="file-tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onAddToContext?.(contextMenu.path);
              closeContextMenu();
            }}
          >
            Add to context
          </button>
          <button
            onClick={() => {
              onFileOpen?.(contextMenu.path);
              closeContextMenu();
            }}
          >
            Open in editor
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.path);
              closeContextMenu();
            }}
          >
            Copy path
          </button>
        </div>
      )}
    </div>
  );
}

export default FileTree;
