import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {
  type ClickAction,
  type ClickerConfig,
  type Profile,
  type ProfilesFile,
  type StatusPayload,
  CPS_PRESETS,
  MOUSE_ACTIONS,
  codeLabel,
  cpsToIntervalMs,
  describeAction,
  describeHotkey,
  intervalMsToCps,
} from "@/types";
import "@/App.css";

const DEFAULT_CONFIG: ClickerConfig = {
  action: { kind: "MouseLeft" },
  interval_ms: 50,
  stop_after: null,
  hotkey: { code: "F6", shift: false, ctrl: false, alt: false, meta: false },
};

type CaptureKind = "target" | "hotkey" | null;
type Toast = { kind: "ok" | "err"; text: string } | null;
type ConfirmState = {
  title: string;
  body: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

export default function App() {
  const [config, setConfig] = useState<ClickerConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<StatusPayload>({
    running: false,
    count: 0,
    actual_cps: 0,
  });

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [cpsDraft, setCpsDraft] = useState<string>(() =>
    String(intervalMsToCps(DEFAULT_CONFIG.interval_ms)),
  );
  const [msDraft, setMsDraft] = useState<string>(() =>
    String(DEFAULT_CONFIG.interval_ms),
  );
  const [limitInput, setLimitInput] = useState<string>("100");
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [capture, setCapture] = useState<CaptureKind>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    invoke<ClickerConfig>("get_config").then((c) => {
      setConfig(c);
      setCpsDraft(String(intervalMsToCps(c.interval_ms)));
      setMsDraft(String(c.interval_ms));
      if (c.stop_after != null) {
        setLimitEnabled(true);
        setLimitInput(String(c.stop_after));
      }
    });
    invoke<StatusPayload>("get_status").then(setStatus);
    invoke<ProfilesFile>("list_profiles").then((p) => {
      setProfiles(p.profiles);
      setActiveId(p.active_id);
    });

    const unsubStatus = listen<StatusPayload>("blitzclick://status", (ev) =>
      setStatus(ev.payload),
    );
    const poll = window.setInterval(() => {
      invoke<StatusPayload>("get_status").then(setStatus).catch(() => {});
    }, 200);

    return () => {
      unsubStatus.then((fn) => fn());
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    invoke("set_config", { config }).catch((e) =>
      console.error("set_config failed:", e),
    );
  }, [config]);

  useEffect(() => {
    if (!capture) return;
    function onKeyDown(ev: KeyboardEvent) {
      ev.preventDefault();
      ev.stopPropagation();
      const code = ev.code;
      if (code === "Escape") {
        setCapture(null);
        return;
      }
      if (capture === "target") {
        setConfig((c) => ({ ...c, action: { kind: "Key", value: { code } } }));
      } else if (capture === "hotkey") {
        setConfig((c) => ({
          ...c,
          hotkey: {
            code,
            shift: ev.shiftKey,
            ctrl: ev.ctrlKey,
            alt: ev.altKey,
            meta: ev.metaKey,
          },
        }));
      }
      setCapture(null);
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [capture]);

  const targetCps = intervalMsToCps(config.interval_ms);
  const actualCps = Math.round(status.actual_cps);
  const activePreset = CPS_PRESETS.find((p) => p.cps === targetCps);
  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;

  const setMouseAction = useCallback((action: ClickAction) => {
    setConfig((c) => ({ ...c, action }));
  }, []);

  const commitCps = useCallback(() => {
    const n = Number(cpsDraft);
    if (!Number.isFinite(n) || n <= 0) {
      setCpsDraft(String(intervalMsToCps(configRef.current.interval_ms)));
      return;
    }
    const clamped = Math.min(1000, Math.max(1, Math.round(n)));
    const ms = cpsToIntervalMs(clamped);
    setConfig((c) => ({ ...c, interval_ms: ms }));
    setCpsDraft(String(clamped));
    setMsDraft(String(ms));
  }, [cpsDraft]);

  const commitMs = useCallback(() => {
    const n = Number(msDraft);
    if (!Number.isFinite(n) || n <= 0) {
      setMsDraft(String(configRef.current.interval_ms));
      return;
    }
    const clamped = Math.max(1, Math.round(n));
    setConfig((c) => ({ ...c, interval_ms: clamped }));
    setMsDraft(String(clamped));
    setCpsDraft(String(intervalMsToCps(clamped)));
  }, [msDraft]);

  const applyPreset = useCallback((cps: number) => {
    const ms = cpsToIntervalMs(cps);
    setConfig((c) => ({ ...c, interval_ms: ms }));
    setCpsDraft(String(cps));
    setMsDraft(String(ms));
  }, []);

  const onLimitToggle = useCallback(
    (enabled: boolean) => {
      setLimitEnabled(enabled);
      setConfig((c) => ({
        ...c,
        stop_after: enabled ? Number(limitInput || 100) : null,
      }));
      if (enabled && !limitInput) setLimitInput("100");
    },
    [limitInput],
  );

  const onLimitInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLimitInput(v);
      if (limitEnabled) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
          setConfig((c) => ({ ...c, stop_after: n }));
        }
      }
    },
    [limitEnabled],
  );

  const onStartStop = useCallback(async () => {
    const result = await invoke<StatusPayload>(status.running ? "stop" : "start");
    setStatus(result);
  }, [status.running]);

  const refreshProfiles = useCallback(async () => {
    const p = await invoke<ProfilesFile>("list_profiles");
    setProfiles(p.profiles);
    setActiveId(p.active_id);
  }, []);

  const createProfile = useCallback(
    async (name: string) => {
      try {
        const p = await invoke<Profile>("create_profile", { name });
        await refreshProfiles();
        flash("ok", `created · ${p.name}`);
      } catch (e) {
        flash("err", String(e));
      }
    },
    [flash, refreshProfiles],
  );

  const saveActive = useCallback(async () => {
    if (!activeId) return;
    try {
      const p = await invoke<Profile>("save_to_profile", { id: activeId });
      await refreshProfiles();
      flash("ok", `saved · ${p.name}`);
    } catch (e) {
      flash("err", String(e));
    }
  }, [activeId, flash, refreshProfiles]);

  const loadProfile = useCallback(
    async (id: string) => {
      try {
        const c = await invoke<ClickerConfig>("load_profile", { id });
        setConfig(c);
        setCpsDraft(String(intervalMsToCps(c.interval_ms)));
        setMsDraft(String(c.interval_ms));
        setLimitEnabled(c.stop_after != null);
        if (c.stop_after != null) setLimitInput(String(c.stop_after));
        await refreshProfiles();
        const name = profiles.find((p) => p.id === id)?.name ?? "profile";
        flash("ok", `loaded · ${name}`);
      } catch (e) {
        flash("err", String(e));
      }
    },
    [flash, profiles, refreshProfiles],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      try {
        await invoke<Profile>("rename_profile", { id, name });
        await refreshProfiles();
        flash("ok", `renamed · ${name}`);
      } catch (e) {
        flash("err", String(e));
      }
    },
    [flash, refreshProfiles],
  );

  const deleteProfile = useCallback(
    (id: string, name: string) => {
      setConfirm({
        title: "DELETE PROFILE",
        body: `Delete "${name}"? This cannot be undone.`,
        danger: true,
        onConfirm: async () => {
          try {
            await invoke("delete_profile", { id });
            await refreshProfiles();
            flash("ok", "deleted");
          } catch (e) {
            flash("err", String(e));
          }
          setConfirm(null);
        },
      });
    },
    [flash, refreshProfiles],
  );

  const exportProfile = useCallback(
    async (id: string) => {
      try {
        const json = await invoke<string>("export_profile", { id });
        await navigator.clipboard.writeText(json);
        flash("ok", "exported to clipboard");
      } catch (e) {
        flash("err", String(e));
      }
    },
    [flash],
  );

  const importProfile = useCallback(
    async (json: string) => {
      try {
        const p = await invoke<Profile>("import_profile", { json });
        await refreshProfiles();
        flash("ok", `imported · ${p.name}`);
      } catch (e) {
        flash("err", String(e));
      }
    },
    [flash, refreshProfiles],
  );

  const targetLabel = useMemo(() => describeAction(config.action), [config.action]);
  const hotkeyLabel = useMemo(() => describeHotkey(config.hotkey), [config.hotkey]);

  return (
    <div className="bc-root">
      <div className="bc-shell">
        <Header
          running={status.running}
          activeProfileName={activeProfile?.name ?? null}
        />

        {/* ROW 1 — main dash + launch panel */}
        <div className="bc-row-main">
          <MainDashboard
            running={status.running}
            actualCps={actualCps}
            targetCps={targetCps}
            totalClicks={status.count}
            targetMs={config.interval_ms}
            presetName={activePreset?.label ?? "CUSTOM"}
            targetLabel={targetLabel}
          />
          <LaunchPanel
            running={status.running}
            onStartStop={onStartStop}
            hotkeyLabel={hotkeyLabel}
            onCaptureHotkey={() => setCapture("hotkey")}
            capturing={capture === "hotkey"}
          />
        </div>

        {/* ROW 2 — presets strip */}
        <Card className="bc-card">
          <SectionHead title="SPEED PRESETS" subtitle={activePreset?.label ?? "custom speed"} />
          <div className="bc-presets">
            {CPS_PRESETS.map((p) => (
              <button
                key={p.cps}
                onClick={() => applyPreset(p.cps)}
                className={"bc-preset " + (targetCps === p.cps ? "bc-preset--on" : "")}
              >
                <span className="bc-preset__label">{p.label}</span>
                <span className="bc-preset__cps">{p.cps} CPS</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ROW 3 — settings + configurations */}
        <div className="bc-row-split">
          <ClickSettingsCard
            action={config.action}
            onMouse={setMouseAction}
            onCaptureTarget={() => setCapture("target")}
            capturing={capture}
            targetLabel={targetLabel}
          />
          <ConfigurationsCard
            profiles={profiles}
            activeId={activeId}
            onCreate={createProfile}
            onSave={saveActive}
            onLoad={loadProfile}
            onRename={renameProfile}
            onDelete={deleteProfile}
            onExport={exportProfile}
            onImport={importProfile}
          />
        </div>

        {/* ROW 4 — advanced */}
        <AdvancedSettings
          cpsDraft={cpsDraft}
          msDraft={msDraft}
          setCpsDraft={setCpsDraft}
          setMsDraft={setMsDraft}
          commitCps={commitCps}
          commitMs={commitMs}
          limitEnabled={limitEnabled}
          limitInput={limitInput}
          onLimitToggle={onLimitToggle}
          onLimitInput={onLimitInput}
        />
      </div>

      {capture && <CaptureOverlay kind={capture} onCancel={() => setCapture(null)} />}
      {confirm && <ConfirmModal state={confirm} onCancel={() => setConfirm(null)} />}
      {toast && <ToastBanner toast={toast} />}
    </div>
  );
}

/* ---------------------------- subcomponents ---------------------------- */

function Header({
  running,
  activeProfileName,
}: {
  running: boolean;
  activeProfileName: string | null;
}) {
  return (
    <header className="bc-header">
      <div className="bc-header__left">
        <h1 className="bc-title">BLITZCLICK</h1>
        <span className="bc-meta">v0.3.2</span>
      </div>
      <div className="bc-header__right">
        <span className="bc-pill bc-pill--profile">
          CONFIG · {activeProfileName ?? "unsaved"}
        </span>
        <span className={"bc-pill " + (running ? "bc-pill--on" : "bc-pill--off")}>
          <span className="bc-pill__dot" />
          {running ? "LIVE" : "IDLE"}
        </span>
      </div>
    </header>
  );
}

function MainDashboard({
  running,
  actualCps,
  targetCps,
  totalClicks,
  targetMs,
  presetName,
  targetLabel,
}: {
  running: boolean;
  actualCps: number;
  targetCps: number;
  totalClicks: number;
  targetMs: number;
  presetName: string;
  targetLabel: string;
}) {
  return (
    <Card className="bc-card">
      <SectionHead title="MAIN DASHBOARD" subtitle={`${presetName.toLowerCase()} · ${targetLabel.toLowerCase()}`} />
      <div className="bc-card__body" style={{ padding: 14 }}>
        <div className="bc-dash">
          <div className={"bc-dash__cell bc-dash__cell--actual " + (running ? "bc-dash__cell--on" : "")}>
            <div className="bc-dash__label">Actual CPS</div>
            <div className="bc-dash__value">{running ? actualCps.toLocaleString() : "—"}</div>
          </div>
          <div className="bc-dash__cell">
            <div className="bc-dash__label">Target CPS</div>
            <div className="bc-dash__value">{targetCps.toLocaleString()}</div>
          </div>
          <div className="bc-dash__cell">
            <div className="bc-dash__label">Interval</div>
            <div className="bc-dash__value">{targetMs} ms</div>
          </div>
          <div className="bc-dash__cell">
            <div className="bc-dash__label">Preset</div>
            <div className="bc-dash__value">{presetName}</div>
          </div>
          <div className="bc-dash__cell">
            <div className="bc-dash__label">Total Clicks</div>
            <div className="bc-dash__value">{totalClicks.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LaunchPanel({
  running,
  onStartStop,
  hotkeyLabel,
  onCaptureHotkey,
  capturing,
}: {
  running: boolean;
  onStartStop: () => void;
  hotkeyLabel: string;
  onCaptureHotkey: () => void;
  capturing: boolean;
}) {
  return (
    <Card className="bc-card">
      <SectionHead title="LAUNCH" subtitle={running ? "running" : "idle"} />
      <div className="bc-card__body bc-launch-panel">
        <Button
          onClick={onStartStop}
          className={"bc-launch " + (running ? "bc-launch--stop" : "bc-launch--start")}
        >
          {running ? "■  STOP" : "▶  START"}
        </Button>
        <div className="bc-hotkey-slot">
          <span className="bc-field__label">GLOBAL HOTKEY</span>
          <button
            onClick={onCaptureHotkey}
            className={"bc-field__btn " + (capturing ? "bc-field__btn--listening" : "")}
          >
            {capturing ? "LISTENING…" : hotkeyLabel}
          </button>
          <p style={{ fontFamily: "var(--font-head)", fontSize: 8, letterSpacing: "0.15em", color: "var(--muted)", margin: 0 }}>
            {hotkeyLabel} toggles start/stop from any window
          </p>
        </div>
      </div>
    </Card>
  );
}

function ClickSettingsCard({
  action,
  onMouse,
  onCaptureTarget,
  capturing,
  targetLabel,
}: {
  action: ClickAction;
  onMouse: (a: ClickAction) => void;
  onCaptureTarget: () => void;
  capturing: CaptureKind;
  targetLabel: string;
}) {
  const activeMouse = action.kind !== "Key" ? action.kind : null;
  const keyLabel = action.kind === "Key" ? codeLabel(action.value.code) : null;
  return (
    <Card className="bc-card">
      <SectionHead title="CLICK SETTINGS" subtitle={targetLabel} />
      <div className="bc-card__body" style={{ display: "grid", gap: 14 }}>
        <div>
          <div className="bc-field__label" style={{ marginBottom: 6 }}>
            MOUSE BUTTON
          </div>
          <div className="bc-tiles">
            {MOUSE_ACTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => onMouse(m.action)}
                className={"bc-tile " + (activeMouse === m.action.kind ? "bc-tile--on" : "")}
              >
                <span className="bc-tile__glyph">{m.glyph}</span>
                <span className="bc-tile__label">{m.label.split(" ")[0].toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bc-field">
          <span className="bc-field__label">OR BIND ANY KEY</span>
          <button
            onClick={onCaptureTarget}
            className={"bc-field__btn " + (capturing === "target" ? "bc-field__btn--listening" : "")}
          >
            {capturing === "target"
              ? "LISTENING…"
              : keyLabel
                ? `KEY · ${keyLabel}`
                : "+ BIND KEY"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function ConfigurationsCard({
  profiles,
  activeId,
  onCreate,
  onSave,
  onLoad,
  onRename,
  onDelete,
  onExport,
  onImport,
}: {
  profiles: Profile[];
  activeId: string | null;
  onCreate: (name: string) => void;
  onSave: () => void;
  onLoad: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onExport: (id: string) => void;
  onImport: (json: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;

  const submitCreate = () => {
    const n = newName.trim();
    if (!n) return;
    onCreate(n);
    setNewName("");
  };

  const submitRename = () => {
    if (!renaming) return;
    const n = renameDraft.trim();
    if (!n) {
      setRenaming(null);
      return;
    }
    onRename(renaming, n);
    setRenaming(null);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(onImport);
    e.target.value = "";
  };

  const subtitle =
    profiles.length === 0
      ? "no saved profiles"
      : `${profiles.length} saved · active · ${activeProfile?.name ?? "none"}`;

  return (
    <Card className="bc-card">
      <SectionHead title="CONFIGURATIONS" subtitle={subtitle} />
      <div className="bc-card__body" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            placeholder="New profile name…"
            className="bc-input"
            style={{ flex: 1, minWidth: 140 }}
          />
          <Button onClick={submitCreate} className="bc-btn bc-btn--primary">
            + CREATE
          </Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            onClick={onSave}
            disabled={!activeId}
            className="bc-btn bc-btn--ghost"
          >
            SAVE CURRENT
          </Button>
          <Button
            onClick={() => importRef.current?.click()}
            className="bc-btn bc-btn--ghost"
          >
            IMPORT…
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onImportFile}
            style={{ display: "none" }}
          />
        </div>

        {profiles.length === 0 ? (
          <div className="bc-empty">
            <div className="bc-empty__title">NO PROFILES YET</div>
            <div className="bc-empty__body">
              Tweak the speed, click target, and hotkey the way you like them,
              then type a name above and hit <span className="bc-kbd">+ CREATE</span>
              to save the setup. Load it back any time with one click.
            </div>
          </div>
        ) : (
          <ul className="bc-profile-list">
            {profiles.map((p) => (
              <li
                key={p.id}
                className={"bc-profile-row " + (p.id === activeId ? "bc-profile-row--active" : "")}
              >
                {renaming === p.id ? (
                  <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                    <Input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      autoFocus
                      className="bc-input"
                      style={{ flex: 1, minWidth: 100 }}
                    />
                    <Button onClick={submitRename} className="bc-btn bc-btn--primary">
                      OK
                    </Button>
                    <Button onClick={() => setRenaming(null)} className="bc-btn bc-btn--ghost">
                      ✕
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="bc-profile-row__name">
                      {p.id === activeId && <span className="bc-profile-row__dot" />}
                      {p.name}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button
                        className="bc-icon-btn"
                        onClick={() => onLoad(p.id)}
                        title="Load"
                      >
                        LOAD
                      </button>
                      <button
                        className="bc-icon-btn"
                        onClick={() => {
                          setRenaming(p.id);
                          setRenameDraft(p.name);
                        }}
                        title="Rename"
                      >
                        REN
                      </button>
                      <button
                        className="bc-icon-btn"
                        onClick={() => onExport(p.id)}
                        title="Export JSON"
                      >
                        EXP
                      </button>
                      <button
                        className="bc-icon-btn bc-icon-btn--danger"
                        onClick={() => onDelete(p.id, p.name)}
                        title="Delete"
                      >
                        DEL
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function AdvancedSettings({
  cpsDraft,
  msDraft,
  setCpsDraft,
  setMsDraft,
  commitCps,
  commitMs,
  limitEnabled,
  limitInput,
  onLimitToggle,
  onLimitInput,
}: {
  cpsDraft: string;
  msDraft: string;
  setCpsDraft: (v: string) => void;
  setMsDraft: (v: string) => void;
  commitCps: () => void;
  commitMs: () => void;
  limitEnabled: boolean;
  limitInput: string;
  onLimitToggle: (b: boolean) => void;
  onLimitInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Accordion className="bc-accordion">
      <AccordionItem value="advanced" className="bc-accordion-item">
        <AccordionTrigger className="bc-accordion-trigger">
          ADVANCED SETTINGS
        </AccordionTrigger>
        <AccordionContent className="bc-accordion-content">
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <div>
              <div className="bc-field__label" style={{ marginBottom: 6 }}>
                CUSTOM SPEED
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="bc-field">
                  <span className="bc-field__label">CPS</span>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={cpsDraft}
                    onChange={(e) => setCpsDraft(e.target.value)}
                    onBlur={commitCps}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                    className="bc-input"
                  />
                </div>
                <div className="bc-field">
                  <span className="bc-field__label">MS</span>
                  <Input
                    type="number"
                    min={1}
                    value={msDraft}
                    onChange={(e) => setMsDraft(e.target.value)}
                    onBlur={commitMs}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                    className="bc-input"
                  />
                </div>
              </div>
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span className="bc-field__label">STOP AFTER N CLICKS</span>
                <Switch checked={limitEnabled} onCheckedChange={onLimitToggle} />
              </div>
              {limitEnabled ? (
                <Input
                  type="number"
                  min={1}
                  value={limitInput}
                  onChange={onLimitInput}
                  placeholder="100"
                  className="bc-input"
                />
              ) : (
                <p
                  style={{
                    fontFamily: "var(--font-head)",
                    fontSize: 9,
                    letterSpacing: "0.2em",
                    color: "var(--muted)",
                    margin: 0,
                  }}
                >
                  runs until the hotkey is pressed again
                </p>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bc-card__head">
      <div className="bc-card__title">{title}</div>
      <div className="bc-card__sub">{subtitle}</div>
    </div>
  );
}

function CaptureOverlay({
  kind,
  onCancel,
}: {
  kind: "target" | "hotkey";
  onCancel: () => void;
}) {
  return (
    <div className="bc-overlay" onClick={onCancel}>
      <div className="bc-overlay__box" onClick={(e) => e.stopPropagation()}>
        <div className="bc-overlay__title">
          PRESS ANY {kind === "hotkey" ? "CHORD" : "KEY"}
        </div>
        <div className="bc-overlay__sub">esc or click outside to cancel</div>
      </div>
    </div>
  );
}

function ConfirmModal({
  state,
  onCancel,
}: {
  state: NonNullable<ConfirmState>;
  onCancel: () => void;
}) {
  return (
    <div className="bc-overlay" onClick={onCancel}>
      <div className="bc-overlay__box" onClick={(e) => e.stopPropagation()}>
        <div className="bc-overlay__title">{state.title}</div>
        <div className="bc-overlay__body">{state.body}</div>
        <div className="bc-overlay__actions">
          <Button onClick={onCancel} className="bc-btn bc-btn--ghost">
            CANCEL
          </Button>
          <Button
            onClick={state.onConfirm}
            className={"bc-btn " + (state.danger ? "bc-btn--danger" : "bc-btn--primary")}
          >
            CONFIRM
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToastBanner({ toast }: { toast: { kind: "ok" | "err"; text: string } }) {
  return (
    <div className={`bc-toast bc-toast--${toast.kind}`}>
      {toast.kind === "ok" ? "✓ " : "✗ "}
      {toast.text}
    </div>
  );
}
