import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  type ClickAction,
  type ClickerConfig,
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

export default function App() {
  const [config, setConfig] = useState<ClickerConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<StatusPayload>({
    running: false,
    count: 0,
    actual_cps: 0,
  });

  const [cpsDraft, setCpsDraft] = useState<string>(() =>
    String(intervalMsToCps(DEFAULT_CONFIG.interval_ms)),
  );
  const [msDraft, setMsDraft] = useState<string>(() =>
    String(DEFAULT_CONFIG.interval_ms),
  );
  const [limitInput, setLimitInput] = useState<string>("100");
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [capture, setCapture] = useState<CaptureKind>(null);

  const configRef = useRef(config);
  configRef.current = config;

  // --- bootstrap: load config + subscribe to status events ---
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

    const unsubStatus = listen<StatusPayload>("blitzclick://status", (ev) =>
      setStatus(ev.payload),
    );
    const poll = window.setInterval(() => {
      invoke<StatusPayload>("get_status").then(setStatus).catch(() => {});
    }, 150);

    return () => {
      unsubStatus.then((fn) => fn());
      window.clearInterval(poll);
    };
  }, []);

  // --- push config to Rust on every change ---
  useEffect(() => {
    invoke("set_config", { config }).catch((e) =>
      console.error("set_config failed:", e),
    );
  }, [config]);

  // --- key-capture handler (hooked onto window only while capturing) ---
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

  // --- derived ---
  const targetCps = intervalMsToCps(config.interval_ms);
  const actualCps = Math.round(status.actual_cps);
  const activePreset = CPS_PRESETS.find((p) => p.cps === targetCps);

  // --- handlers ---
  const setMouseAction = useCallback((action: ClickAction) => {
    setConfig((c) => ({ ...c, action }));
  }, []);

  const commitCps = useCallback(() => {
    const n = Number(cpsDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(1000, Math.max(1, Math.round(n)));
    const ms = cpsToIntervalMs(clamped);
    setConfig((c) => ({ ...c, interval_ms: ms }));
    setCpsDraft(String(clamped));
    setMsDraft(String(ms));
  }, [cpsDraft]);

  const commitMs = useCallback(() => {
    const n = Number(msDraft);
    if (!Number.isFinite(n) || n <= 0) return;
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

  const targetLabel = useMemo(() => describeAction(config.action), [config.action]);
  const hotkeyLabel = useMemo(() => describeHotkey(config.hotkey), [config.hotkey]);

  return (
    <div className="min-h-screen w-full px-6 py-8 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <Header running={status.running} />
        <HeroMeter
          running={status.running}
          actualCps={actualCps}
          targetCps={targetCps}
          totalClicks={status.count}
        />
        <PresetRow active={activePreset?.cps ?? -1} onPick={applyPreset} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TargetCard
            action={config.action}
            onMouse={setMouseAction}
            onCaptureKey={() => setCapture("target")}
            capturing={capture === "target"}
            targetLabel={targetLabel}
          />
          <SpeedCard
            cpsDraft={cpsDraft}
            msDraft={msDraft}
            setCpsDraft={setCpsDraft}
            setMsDraft={setMsDraft}
            commitCps={commitCps}
            commitMs={commitMs}
          />
          <LimitCard
            enabled={limitEnabled}
            value={limitInput}
            onToggle={onLimitToggle}
            onChange={onLimitInput}
          />
          <HotkeyCard
            hotkeyLabel={hotkeyLabel}
            onCapture={() => setCapture("hotkey")}
            capturing={capture === "hotkey"}
          />
        </div>

        <StartButton running={status.running} onClick={onStartStop} hotkeyLabel={hotkeyLabel} />
      </div>

      {capture && <CaptureOverlay kind={capture} onCancel={() => setCapture(null)} />}
    </div>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function Header({ running }: { running: boolean }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="bc-title text-4xl md:text-5xl font-head tracking-widest">
          BLITZCLICK
        </h1>
        <p className="text-[10px] md:text-xs font-head mt-2 text-muted-foreground tracking-widest">
          v0.2.0 · hyperfast clicker · retro ui
        </p>
      </div>
      <div
        className={
          "bc-live-badge font-head text-xs md:text-sm uppercase tracking-widest px-3 py-2 " +
          (running ? "bc-live-badge--on" : "bc-live-badge--off")
        }
      >
        <span className="bc-live-dot" /> {running ? "LIVE" : "IDLE"}
      </div>
    </div>
  );
}

function HeroMeter({
  running,
  actualCps,
  targetCps,
  totalClicks,
}: {
  running: boolean;
  actualCps: number;
  targetCps: number;
  totalClicks: number;
}) {
  const display = running ? actualCps : targetCps;
  return (
    <div className={"bc-hero " + (running ? "bc-hero--live" : "")}>
      <div className="bc-hero__label font-head text-[10px] md:text-xs tracking-[0.4em] uppercase">
        {running ? "actual cps" : "target cps"}
      </div>
      <div className="bc-hero__number font-head leading-none">
        {display.toLocaleString()}
      </div>
      <div className="bc-hero__meta font-head text-[10px] md:text-xs tracking-widest">
        <span>target {targetCps.toLocaleString()}</span>
        <span className="bc-hero__sep">·</span>
        <span>{totalClicks.toLocaleString()} total clicks</span>
      </div>
    </div>
  );
}

function PresetRow({ active, onPick }: { active: number; onPick: (cps: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {CPS_PRESETS.map((p, i) => (
        <button
          key={p.cps}
          onClick={() => onPick(p.cps)}
          className={
            "bc-chip font-head text-[10px] md:text-xs tracking-widest px-3 py-2 " +
            `bc-chip--${i} ` +
            (active === p.cps ? "bc-chip--on" : "")
          }
        >
          {p.label} · {p.cps}
        </button>
      ))}
    </div>
  );
}

function TargetCard({
  action,
  onMouse,
  onCaptureKey,
  capturing,
  targetLabel,
}: {
  action: ClickAction;
  onMouse: (a: ClickAction) => void;
  onCaptureKey: () => void;
  capturing: boolean;
  targetLabel: string;
}) {
  const activeMouse = action.kind !== "Key" ? action.kind : null;
  const keyLabel = action.kind === "Key" ? codeLabel(action.value.code) : null;
  return (
    <Card className="bc-card bc-card--pink">
      <CardHeading hue="pink" title="TARGET" subtitle={targetLabel} />
      <div className="flex flex-col gap-3 p-5 pt-0">
        <div className="grid grid-cols-3 gap-2">
          {MOUSE_ACTIONS.map((m) => (
            <button
              key={m.value}
              onClick={() => onMouse(m.action)}
              className={
                "bc-pill font-head text-[11px] tracking-widest py-3 " +
                (activeMouse === m.action.kind ? "bc-pill--on-pink" : "")
              }
            >
              <div className="text-base leading-none">{m.glyph}</div>
              <div className="text-[9px] mt-1 opacity-80">{m.label.split(" ")[0].toUpperCase()}</div>
            </button>
          ))}
        </div>
        <button
          onClick={onCaptureKey}
          className={
            "bc-capture font-head text-xs tracking-widest py-3 " +
            (keyLabel ? "bc-capture--active-pink" : "") +
            (capturing ? " bc-capture--listening" : "")
          }
        >
          {capturing ? "LISTENING…" : keyLabel ? `KEY · ${keyLabel}` : "+ BIND ANY KEY"}
        </button>
      </div>
    </Card>
  );
}

function SpeedCard({
  cpsDraft,
  msDraft,
  setCpsDraft,
  setMsDraft,
  commitCps,
  commitMs,
}: {
  cpsDraft: string;
  msDraft: string;
  setCpsDraft: (v: string) => void;
  setMsDraft: (v: string) => void;
  commitCps: () => void;
  commitMs: () => void;
}) {
  return (
    <Card className="bc-card bc-card--cyan">
      <CardHeading hue="cyan" title="SPEED" subtitle={`${cpsDraft || "?"} cps`} />
      <div className="flex flex-col gap-3 p-5 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-head text-[9px] tracking-[0.3em] opacity-70 uppercase">
              CPS
            </label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={cpsDraft}
              onChange={(e) => setCpsDraft(e.target.value)}
              onBlur={commitCps}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="font-head bc-input"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-head text-[9px] tracking-[0.3em] opacity-70 uppercase">
              ms
            </label>
            <Input
              type="number"
              min={1}
              value={msDraft}
              onChange={(e) => setMsDraft(e.target.value)}
              onBlur={commitMs}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="font-head bc-input"
            />
          </div>
        </div>
        <p className="font-head text-[9px] opacity-60 tracking-widest">
          type a number · press enter or tab out
        </p>
      </div>
    </Card>
  );
}

function LimitCard({
  enabled,
  value,
  onToggle,
  onChange,
}: {
  enabled: boolean;
  value: string;
  onToggle: (b: boolean) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Card className="bc-card bc-card--yellow">
      <CardHeading
        hue="yellow"
        title="STOP AFTER"
        subtitle={enabled ? `${value} clicks` : "forever"}
      />
      <div className="flex flex-col gap-3 p-5 pt-0">
        <div className="flex items-center justify-between">
          <span className="font-head text-[10px] tracking-widest uppercase opacity-80">
            Limit on
          </span>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
        {enabled ? (
          <Input
            type="number"
            min={1}
            value={value}
            onChange={onChange}
            placeholder="100"
            className="font-head bc-input"
          />
        ) : (
          <p className="font-head text-[10px] opacity-60 tracking-widest">
            runs until you hit the hotkey
          </p>
        )}
      </div>
    </Card>
  );
}

function HotkeyCard({
  hotkeyLabel,
  onCapture,
  capturing,
}: {
  hotkeyLabel: string;
  onCapture: () => void;
  capturing: boolean;
}) {
  return (
    <Card className="bc-card bc-card--orange">
      <CardHeading hue="orange" title="HOTKEY" subtitle={hotkeyLabel} />
      <div className="flex flex-col gap-3 p-5 pt-0">
        <button
          onClick={onCapture}
          className={
            "bc-capture font-head text-sm tracking-widest py-4 bc-capture--active-orange " +
            (capturing ? " bc-capture--listening" : "")
          }
        >
          {capturing ? "LISTENING…" : hotkeyLabel}
        </button>
        <p className="font-head text-[9px] opacity-60 tracking-widest">
          click, then press any chord · esc cancels
        </p>
      </div>
    </Card>
  );
}

function StartButton({
  running,
  onClick,
  hotkeyLabel,
}: {
  running: boolean;
  onClick: () => void;
  hotkeyLabel: string;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3">
      <Button
        size="lg"
        onClick={onClick}
        className={
          "bc-launch font-head text-base md:text-lg tracking-[0.3em] py-7 " +
          (running ? "bc-launch--stop" : "bc-launch--start")
        }
      >
        {running ? "■  STOP" : "▶  START"}
      </Button>
      <p className="text-center font-head text-[10px] md:text-xs opacity-70 tracking-widest">
        or press <span className="bc-mini-chip">{hotkeyLabel}</span> anywhere
      </p>
    </div>
  );
}

function CardHeading({
  hue,
  title,
  subtitle,
}: {
  hue: "pink" | "cyan" | "yellow" | "orange";
  title: string;
  subtitle: string;
}) {
  return (
    <div className={`bc-card__head bc-card__head--${hue}`}>
      <div className="font-head text-[11px] tracking-[0.3em] uppercase">{title}</div>
      <div className="font-head text-[10px] opacity-70 tracking-widest truncate">
        {subtitle}
      </div>
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
      <div className="bc-overlay__box font-head">
        <div className="bc-overlay__title text-xl tracking-widest">
          PRESS ANY {kind === "hotkey" ? "CHORD" : "KEY"}
        </div>
        <div className="bc-overlay__sub text-[10px] tracking-widest opacity-70 mt-3">
          esc or click outside to cancel
        </div>
      </div>
    </div>
  );
}
