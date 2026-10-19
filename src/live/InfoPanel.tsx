import { useEffect, useState } from "react";

import { MapViewer } from "../mapviewer/MapViewer";
import "./InfoPanel.css";
import { useLiveVersion } from "./LivePanel";

type ProcessMemory = {
    service: string;
    botName?: string | null;
    pid: number;
    workingSetBytes: number;
    privateBytes: number;
};
type MemorySnapshot = {
    sampledAt: string;
    processes: ProcessMemory[];
    totals: { processCount: number; workingSetBytes: number; privateBytes: number };
    host: { totalBytes: number; availableBytes: number };
};

function memory(bytes: number): string {
    return bytes >= 1024 ** 3
        ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
        : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function metricsUrl(feedUrl?: string): string | null {
    if (!feedUrl) return null;
    try {
        const url = new URL(feedUrl.replace(/^ws/, "http"));
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
        url.port = "7780";
        url.pathname = "/local/metrics";
        url.search = "";
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

function serviceName(service: string): string {
    return service
        .replace(/^engine$/, "Game engine")
        .replace(/^gateway$/, "Gateway")
        .replace(/^viewer/, "Viewer")
        .replace(/^bot$/, "Client · original bot")
        .replace(/^routine$/, "Controller · original bot")
        .replace(/^bot-/, "Client · ")
        .replace(/^routine-/, "Controller · ");
}

type MemoryGroup = {
    key: string;
    service: string;
    bot: boolean;
    processes: ProcessMemory[];
    workingSetBytes: number;
    privateBytes: number;
};

function groupProcesses(processes: ProcessMemory[]): MemoryGroup[] {
    const groups = new Map<string, MemoryGroup>();
    for (const process of processes) {
        const bot = /^(?:bot|routine)(?:-([a-zA-Z0-9]{1,12}))?(?: \/ child)?$/.exec(
            process.service,
        );
        const name = bot
            ? process.botName ?? bot[1] ?? "Original bot"
            : serviceName(process.service);
        const key = bot ? `bot:${name.toLowerCase()}` : `process:${process.pid}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                service: name,
                bot: !!bot,
                processes: [],
                workingSetBytes: 0,
                privateBytes: 0,
            };
            groups.set(key, group);
        }
        group.processes.push(process);
        group.workingSetBytes += process.workingSetBytes;
        group.privateBytes += process.privateBytes;
    }
    return [...groups.values()];
}

function botProcessName(service: string): string {
    const name = service.startsWith("routine") ? "Controller" : "Client";
    return service.endsWith(" / child") ? `${name} / child` : name;
}

export function InfoPanel({ mapViewer }: { mapViewer: MapViewer }): JSX.Element {
    useLiveVersion(mapViewer);
    const endpoint = metricsUrl(mapViewer.live?.url);
    const [open, setOpen] = useState(false);
    const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedBots, setExpandedBots] = useState<Set<string>>(() => new Set());
    const toggleBot = (key: string) =>
        setExpandedBots((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const [sort, setSort] = useState<"workingSetBytes" | "privateBytes" | "service">(
        "workingSetBytes",
    );

    useEffect(() => {
        setSnapshot(null);
        setError(null);
        if (!open || !endpoint) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        let controller: AbortController;
        const refresh = async () => {
            controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch(endpoint, {
                    signal: controller.signal,
                    cache: "no-store",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const value: MemorySnapshot = await response.json();
                if (!Array.isArray(value.processes) || !value.totals || !value.host)
                    throw new Error("Invalid response");
                if (!disposed) {
                    setSnapshot(value);
                    setError(null);
                }
            } catch {
                if (!disposed)
                    setError(
                        "Memory update unavailable. Check that the updated SDK is running with local.cmd.",
                    );
            } finally {
                clearTimeout(timeout);
                if (!disposed) timer = setTimeout(refresh, 5000);
            }
        };
        void refresh();
        return () => {
            disposed = true;
            clearTimeout(timer);
            controller?.abort();
        };
    }, [open, endpoint]);

    const rows = groupProcesses(snapshot?.processes ?? []).sort((a, b) =>
        sort === "service" ? a.service.localeCompare(b.service) : b[sort] - a[sort],
    );
    const used = snapshot ? snapshot.host.totalBytes - snapshot.host.availableBytes : 0;
    const usedPercent = snapshot
        ? Math.max(0, Math.min(100, (100 * used) / snapshot.host.totalBytes))
        : 0;
    return (
        <div
            className="info-panel"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    setOpen(false);
                }
            }}
        >
            {open && (
                <section
                    className="info-popup rs-border rs-background"
                    role="dialog"
                    aria-label="Process memory dashboard"
                    id="process-memory-dashboard"
                >
                    <div className="info-title">
                        Process memory
                        <button
                            className="live-button"
                            aria-label="Close process dashboard"
                            onClick={() => setOpen(false)}
                        >
                            ×
                        </button>
                    </div>
                    {!endpoint && (
                        <p role="status">
                            Memory statistics are available for a local world started with
                            local.cmd.
                        </p>
                    )}
                    {endpoint && !snapshot && !error && (
                        <p role="status">Reading local process memory…</p>
                    )}
                    {error && (
                        <p role="status" className="memory-error">
                            {error}
                            {snapshot && " Showing the last successful sample."}
                        </p>
                    )}
                    {snapshot && (
                        <>
                            <div className="memory-totals">
                                <div>
                                    <span>Total working set</span>
                                    <strong>{memory(snapshot.totals.workingSetBytes)}</strong>
                                </div>
                                <div>
                                    <span>Total private</span>
                                    <strong>{memory(snapshot.totals.privateBytes)}</strong>
                                </div>
                            </div>
                            <div className="memory-system">
                                <span>System RAM</span>
                                <span>
                                    {memory(used)} / {memory(snapshot.host.totalBytes)}
                                </span>
                            </div>
                            <div
                                className="memory-bar"
                                role="progressbar"
                                aria-label="System RAM used"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(usedPercent)}
                            >
                                <div style={{ width: `${usedPercent}%` }} />
                            </div>
                            <div className="memory-sample">
                                {snapshot.totals.processCount} processes · Updated{" "}
                                {new Date(snapshot.sampledAt).toLocaleTimeString()}
                            </div>
                            <div className="memory-table-scroll">
                                <table className="memory-table">
                                    <thead>
                                        <tr>
                                            <th
                                                scope="col"
                                                aria-sort={
                                                    sort === "service" ? "ascending" : "none"
                                                }
                                            >
                                                <button onClick={() => setSort("service")}>
                                                    Bot / process
                                                </button>
                                            </th>
                                            <th scope="col">PID</th>
                                            <th
                                                scope="col"
                                                aria-sort={
                                                    sort === "workingSetBytes"
                                                        ? "descending"
                                                        : "none"
                                                }
                                            >
                                                <button onClick={() => setSort("workingSetBytes")}>
                                                    Working set
                                                </button>
                                            </th>
                                            <th
                                                scope="col"
                                                aria-sort={
                                                    sort === "privateBytes" ? "descending" : "none"
                                                }
                                            >
                                                <button onClick={() => setSort("privateBytes")}>
                                                    Private
                                                </button>
                                            </th>
                                        </tr>
                                    </thead>
                                    {rows.map((group) => (
                                        <tbody key={group.key}>
                                            <tr
                                                className={
                                                    group.bot ? "memory-bot-total" : undefined
                                                }
                                            >
                                                <td>
                                                    {group.bot ? (
                                                        <button
                                                            className="memory-group-toggle"
                                                            aria-label={`${group.service} processes`}
                                                            aria-expanded={expandedBots.has(
                                                                group.key,
                                                            )}
                                                            onClick={() => toggleBot(group.key)}
                                                        >
                                                            <span
                                                                className="memory-group-arrow"
                                                                aria-hidden="true"
                                                            >
                                                                {expandedBots.has(group.key)
                                                                    ? "▾"
                                                                    : "▸"}
                                                            </span>
                                                            {group.service}
                                                            <span className="memory-process-count">
                                                                {group.processes.length} processes
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        group.service
                                                    )}
                                                </td>
                                                <td>{group.bot ? "—" : group.processes[0].pid}</td>
                                                <td>{memory(group.workingSetBytes)}</td>
                                                <td>{memory(group.privateBytes)}</td>
                                            </tr>
                                            {group.bot &&
                                                expandedBots.has(group.key) &&
                                                [...group.processes]
                                                    .sort(
                                                        (a, b) =>
                                                            a.service.localeCompare(b.service) ||
                                                            a.pid - b.pid,
                                                    )
                                                    .map((process) => (
                                                        <tr
                                                            key={process.pid}
                                                            className="memory-bot-process"
                                                        >
                                                            <td>
                                                                {botProcessName(process.service)}
                                                            </td>
                                                            <td>{process.pid}</td>
                                                            <td>
                                                                {memory(process.workingSetBytes)}
                                                            </td>
                                                            <td>{memory(process.privateBytes)}</td>
                                                        </tr>
                                                    ))}
                                        </tbody>
                                    ))}
                                </table>
                            </div>
                            <p className="memory-note">
                                Expand a bot to see its client, controller and child processes.
                                Browser and GPU usage are excluded.
                            </p>
                            <p className="memory-note">
                                Working sets include shared pages, so their sum can double-count
                                RAM. Private is committed memory, which may be paged out.
                            </p>
                        </>
                    )}
                </section>
            )}
            <button
                className={"info-button rs-border rs-background" + (open ? " open" : "")}
                aria-expanded={open}
                aria-controls="process-memory-dashboard"
                onClick={() => setOpen(!open)}
            >
                Processes
            </button>
        </div>
    );
}
