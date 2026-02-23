import { useCallback, useEffect, useMemo, useState } from "react";

type SkillScope = "system" | "personal" | "project";

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
  scope: SkillScope;
  enabled: boolean;
};

type SidebarSkillsProps = {
  workspacePath?: string | null;
  variant?: "sidebar" | "page";
  onTrySkill?: (skill: { name: string; prompt?: string }) => void;
};

const SETTINGS_DISABLED_KEY = "skills.disabled";

const parseSkillMarkdown = (content: string, fallbackName: string) => {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const heading = lines.find((line) => line.startsWith("# "));
  const title = heading ? heading.slice(2).trim() : fallbackName;
  const description = lines.find((line) => line.length > 0 && !line.startsWith("#")) || "No description available.";
  return { title, description };
};

const detectScope = (skillPath: string, workspacePath?: string | null): SkillScope => {
  if (skillPath.includes("/.codex/skills/.system/")) return "system";
  if (workspacePath && skillPath.startsWith(workspacePath)) return "project";
  return "personal";
};

const extractExamplePrompt = (content: string): string | undefined => {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const exampleLine =
    lines.find((line) => /^(-|\*)\s+/.test(line) && /prompt|example|try/i.test(line)) ||
    lines.find((line) => line.length > 0 && !line.startsWith("#") && line.length > 20);
  if (!exampleLine) return undefined;
  return exampleLine.replace(/^(-|\*)\s+/, "").slice(0, 500);
};

export function SidebarSkills({ workspacePath, variant = "sidebar", onTrySkill }: SidebarSkillsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState("");
  const [installScope, setInstallScope] = useState<"personal" | "project">("personal");
  const [installing, setInstalling] = useState(false);

  const saveDisabled = useCallback(async (disabledPaths: string[]) => {
    await window.codex?.db?.settings.set(SETTINGS_DISABLED_KEY, JSON.stringify(disabledPaths));
  }, []);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const homePath = await window.codex?.getHomePath?.();
      if (!homePath) {
        setError("Unable to resolve home path for skills discovery.");
        setLoading(false);
        return;
      }

      const roots = [`${homePath}/.codex/skills`];
      if (workspacePath) {
        roots.push(`${workspacePath}/.codex/skills`);
      }

      const disabledRaw = await window.codex?.db?.settings.get(SETTINGS_DISABLED_KEY);
      const disabledPaths: string[] = disabledRaw ? JSON.parse(disabledRaw) : [];
      const disabledSet = new Set(disabledPaths);

      const discovered = new Map<string, SkillRecord>();

      for (const root of roots) {
        const rootList = await window.codex?.fs.listDirectory(root);
        if (!rootList?.success || !rootList.nodes) continue;

        const queue = rootList.nodes.filter((node) => node.type === "directory").map((node) => node.path);
        while (queue.length > 0) {
          const dirPath = queue.shift()!;
          const children = await window.codex?.fs.listDirectory(dirPath);
          if (!children?.success || !children.nodes) continue;

          const skillFile = children.nodes.find((node) => node.type === "file" && node.name.toUpperCase() === "SKILL.MD");
          if (skillFile) {
            const file = await window.codex?.fs.readFile(skillFile.path);
            if (file?.success && file.content) {
              const fallbackName = dirPath.split("/").pop() || "Unnamed Skill";
              const parsed = parseSkillMarkdown(file.content, fallbackName);
              discovered.set(dirPath, {
                id: dirPath,
                name: parsed.title,
                description: parsed.description,
                path: dirPath,
                content: file.content,
                scope: detectScope(dirPath, workspacePath),
                enabled: !disabledSet.has(dirPath),
              });
            }
            continue;
          }

          // Recurse one more level to support .system/<category>/<skill> layouts
          for (const child of children.nodes) {
            if (child.type === "directory") {
              queue.push(child.path);
            }
          }
        }
      }

      const next = Array.from(discovered.values()).sort((a, b) => {
        if (a.scope !== b.scope) {
          const order: Record<SkillScope, number> = { system: 0, personal: 1, project: 2 };
          return order[a.scope] - order[b.scope];
        }
        return a.name.localeCompare(b.name);
      });

      setSkills(next);
      if (next.length > 0 && !selectedSkillId) {
        setSelectedSkillId(next[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, selectedSkillId]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.path.toLowerCase().includes(q)
      );
    });
  }, [skills, query]);

  const toggleSkill = useCallback(async (id: string) => {
    let disabled: string[] = [];
    setSkills((prev) => {
      const next = prev.map((skill) => (skill.id === id ? { ...skill, enabled: !skill.enabled } : skill));
      disabled = next.filter((skill) => !skill.enabled).map((skill) => skill.path);
      return next;
    });
    await saveDisabled(disabled);
  }, [saveDisabled]);

  const installFromGit = useCallback(async () => {
    if (!installUrl.trim() || !window.codex?.skills?.installGit) return;
    setInstalling(true);
    setError(null);
    try {
      const result = await window.codex.skills.installGit({
        repoUrl: installUrl.trim(),
        workspacePath: workspacePath || null,
        scope: installScope,
      });
      if (!result.success) {
        setError(result.error || "Failed to install skill repo.");
      } else {
        if (result.warning) {
          setError(result.warning);
        } else {
          setInstallUrl("");
        }
        await loadSkills();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  }, [installUrl, installScope, loadSkills, workspacePath]);

  const enabledCount = filtered.filter((skill) => skill.enabled).length;
  const selectedSkill = filtered.find((skill) => skill.id === selectedSkillId) ?? filtered[0] ?? null;

  return (
    <div className={variant === "page" ? "skills-panel skills-panel-page" : "skills-panel"}>
      <div className="skills-header">
        <div>
          <div className="skills-title">Skills</div>
          <div className="skills-subtitle">{enabledCount}/{filtered.length} enabled</div>
        </div>
        <button className="ghost" onClick={() => void loadSkills()} disabled={loading}>
          Refresh
        </button>
      </div>

      <input
        className="skills-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search skills..."
      />

      <div className="skills-install">
        <input
          className="skills-install-input"
          type="text"
          value={installUrl}
          onChange={(event) => setInstallUrl(event.target.value)}
          placeholder="Install from git URL..."
        />
        <div className="skills-install-controls">
          <select
            className="skills-install-scope"
            value={installScope}
            onChange={(event) => setInstallScope(event.target.value as "personal" | "project")}
            disabled={!workspacePath}
          >
            <option value="personal">Personal</option>
            <option value="project">Project</option>
          </select>
          <button className="primary" onClick={() => void installFromGit()} disabled={installing || !installUrl.trim()}>
            {installing ? "Installing..." : "Install"}
          </button>
        </div>
      </div>

      {error ? <div className="skills-error">{error}</div> : null}

      <div className="skills-list">
        {loading ? (
          <div className="skills-empty">Scanning skills…</div>
        ) : filtered.length === 0 ? (
          <div className="skills-empty">No skills found.</div>
        ) : (
          filtered.map((skill) => (
            <div key={skill.id} className={skill.id === selectedSkill?.id ? "skills-item active" : "skills-item"}>
              <div className="skills-item-head">
                <button className="skills-item-name-btn" onClick={() => setSelectedSkillId(skill.id)}>
                  <div className="skills-item-name">{skill.name}</div>
                </button>
                <span className={`skills-scope scope-${skill.scope}`}>{skill.scope}</span>
              </div>
              <div className="skills-item-desc">{skill.description}</div>
              <div className="skills-item-footer">
                <code className="skills-item-path">{skill.path}</code>
                <div className="skills-item-actions">
                  <button
                    className="ghost"
                    onClick={() => onTrySkill?.({ name: skill.name, prompt: extractExamplePrompt(skill.content) })}
                  >
                    Try
                  </button>
                  <label className="skills-toggle">
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={() => void toggleSkill(skill.id)}
                    />
                    <span>{skill.enabled ? "Enabled" : "Disabled"}</span>
                  </label>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {variant === "page" ? (
        <div className="skills-detail">
          {!selectedSkill ? (
            <div className="skills-empty">Select a skill to inspect.</div>
          ) : (
            <>
              <div className="skills-detail-header">
                <div className="skills-detail-title">{selectedSkill.name}</div>
                <span className={`skills-scope scope-${selectedSkill.scope}`}>{selectedSkill.scope}</span>
              </div>
              <p className="skills-detail-desc">{selectedSkill.description}</p>
              <code className="skills-detail-path">{selectedSkill.path}</code>
              <pre className="skills-detail-content">{selectedSkill.content}</pre>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
