import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  type ClickerConfig,
  type StatusPayload,
  HOTKEY_OPTIONS,
  KEY_OPTIONS,
  MOUSE_ACTIONS,
  actionToOptionValue,
  describeKey,
  keyBindingToOptionValue,
} from "@/types";
import "@/App.css";

export default function App() {
  const [config, setConfig] = useState<ClickerConfig>({
    action: { kind: "MouseLeft" },
    interval_ms: 50,
    stop_after: null,
    hotkey: { kind: "F", value: 6 },
  });
  const [status, setStatus] = useState<StatusPayload>({
    running: false,
    count: 0,
  });
  const [limitInput, setLimitInput] = useState<string>("");
  const [limitEnabled, setLimitEnabled] = useState(false);

  /* ---------- Load initial config + listen for events ---------- */
  useEffect(() => {
    invoke<ClickerConfig>("get_config").then((c) => {
      setConfig(c);
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
    }, 100);

    return () => {
      unsubStatus.then((fn) => fn());
      window.clearInterval(poll);
    };
  }, []);

  /* ---------- Push config changes to Rust (debounced is overkill here) ---------- */
  useEffect(() => {
    invoke("set_config", { config }).catch((e) =>
      console.error("set_config failed:", e),
    );
  }, [config]);

  /* ---------- Derived selectors ---------- */
  const actionIsMouse = config.action.kind !== "Key";
  const actionDropdownValue = useMemo(
    () => (actionIsMouse ? actionToOptionValue(config.action) : "keyboard"),
    [config.action, actionIsMouse],
  );
  const keyDropdownValue =
    config.action.kind === "Key"
      ? keyBindingToOptionValue(config.action.value)
      : "space";
  const hotkeyValue = keyBindingToOptionValue(config.hotkey);

  /* ---------- Handlers ---------- */
  function onActionTypeChange(value: string | null) {
    if (!value) return;
    if (value === "keyboard") {
      setConfig((c) => ({
        ...c,
        action: { kind: "Key", value: { kind: "Space" } },
      }));
      return;
    }
    const found = MOUSE_ACTIONS.find((m) => m.value === value);
    if (found) setConfig((c) => ({ ...c, action: found.action }));
  }

  function onKeyChange(value: string | null) {
    if (!value) return;
    const found = KEY_OPTIONS.find((k) => k.value === value);
    if (!found) return;
    setConfig((c) => ({
      ...c,
      action: { kind: "Key", value: found.binding },
    }));
  }

  function onHotkeyChange(value: string | null) {
    if (!value) return;
    const found = HOTKEY_OPTIONS.find((k) => k.value === value);
    if (!found) return;
    setConfig((c) => ({ ...c, hotkey: found.binding }));
  }

  function onIntervalChange(v: number | readonly number[]) {
    const next = Array.isArray(v) ? v[0] : (v as number);
    setConfig((c) => ({ ...c, interval_ms: Math.max(1, next) }));
  }

  function onLimitToggle(enabled: boolean) {
    setLimitEnabled(enabled);
    setConfig((c) => ({
      ...c,
      stop_after: enabled ? Number(limitInput || 100) : null,
    }));
    if (enabled && !limitInput) setLimitInput("100");
  }

  function onLimitInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setLimitInput(v);
    if (limitEnabled) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        setConfig((c) => ({ ...c, stop_after: n }));
      }
    }
  }

  async function onStartStop() {
    const result = await invoke<StatusPayload>(status.running ? "stop" : "start");
    setStatus(result);
  }

  const cps = config.interval_ms > 0 ? Math.round(1000 / config.interval_ms) : 1000;

  return (
    <div className="min-h-screen w-full p-6 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1
              className="font-head text-3xl tracking-widest text-primary"
              style={{ textShadow: "4px 4px 0 var(--border)" }}
            >
              BLITZCLICK
            </h1>
            <p className="text-xs text-muted-foreground font-head mt-1">
              v0.1.0 · fast click · retro feel
            </p>
          </div>
          <StatusBadge running={status.running} />
        </div>

        {/* Target */}
        <Card>
          <CardHeader>
            <CardTitle className="font-head text-sm text-accent uppercase tracking-wider">
              Target
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="font-head text-xs uppercase tracking-wider">
                What to spam
              </Label>
              <Select value={actionDropdownValue} onValueChange={onActionTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOUSE_ACTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="keyboard">Keyboard Key…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.action.kind === "Key" && (
              <div className="flex flex-col gap-2">
                <Label className="font-head text-xs uppercase tracking-wider">
                  Key
                </Label>
                <Select value={keyDropdownValue} onValueChange={onKeyChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEY_OPTIONS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Speed */}
        <Card>
          <CardHeader>
            <CardTitle className="font-head text-sm text-accent uppercase tracking-wider">
              Speed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label className="font-head text-xs uppercase tracking-wider">
                Interval
              </Label>
              <div className="font-head text-xs text-secondary">
                {config.interval_ms} ms · {cps} CPS
              </div>
            </div>
            <Slider
              min={1}
              max={1000}
              step={1}
              value={[config.interval_ms]}
              onValueChange={onIntervalChange}
            />
            <div className="flex justify-between text-[10px] font-head text-muted-foreground">
              <span>1 ms (max)</span>
              <span>1000 ms</span>
            </div>
          </CardContent>
        </Card>

        {/* Stop condition */}
        <Card>
          <CardHeader>
            <CardTitle className="font-head text-sm text-accent uppercase tracking-wider">
              Stop After
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="font-head text-xs uppercase tracking-wider">
                Limit clicks
              </Label>
              <Switch checked={limitEnabled} onCheckedChange={onLimitToggle} />
            </div>
            {limitEnabled && (
              <Input
                type="number"
                min={1}
                value={limitInput}
                onChange={onLimitInput}
                placeholder="e.g. 100"
                className="font-head"
              />
            )}
            {!limitEnabled && (
              <p className="text-xs text-muted-foreground font-head">
                Runs until you press the hotkey again.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Hotkey */}
        <Card>
          <CardHeader>
            <CardTitle className="font-head text-sm text-accent uppercase tracking-wider">
              Hotkey
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Label className="font-head text-xs uppercase tracking-wider shrink-0">
                Toggle on
              </Label>
              <Select value={hotkeyValue} onValueChange={onHotkeyChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOTKEY_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Start / Stop */}
        <div className="flex flex-col items-stretch gap-3">
          <Button
            size="lg"
            variant={status.running ? "destructive" : "default"}
            className="font-head text-base tracking-widest py-6"
            onClick={onStartStop}
          >
            {status.running ? "■ STOP" : "▶ START"}
          </Button>
          <div className="flex items-center justify-between font-head text-xs text-muted-foreground">
            <span>
              Press{" "}
              <span className="text-accent">{describeKey(config.hotkey)}</span>{" "}
              anywhere to toggle.
            </span>
            <span>
              Clicks:{" "}
              <span className="text-primary">{status.count.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ running }: { running: boolean }) {
  return (
    <Badge
      className={
        "font-head text-xs uppercase tracking-widest " +
        (running
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground")
      }
    >
      {running ? "● LIVE" : "○ IDLE"}
    </Badge>
  );
}
