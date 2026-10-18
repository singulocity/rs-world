import { useEffect, useRef, useState } from "react";

import { MapViewer } from "../mapviewer/MapViewer";
import { useLiveVersion } from "./LivePanel";
import "./PlayerInspector.css";
import { InspectionItem, InspectionSkill } from "./protocol";

function ItemIcon({ item, origin }: { item: InspectionItem; origin: string }) {
    const [failed, setFailed] = useState(false);
    return failed ? (
        <span className="inspect-item-fallback">{item.name.slice(0, 3)}</span>
    ) : (
        <img
            src={`${origin}/sprite/item/${item.id}${item.count > 1 ? "-" + item.count : ""}.png`}
            alt={item.name}
            width={32}
            height={32}
            onError={() => setFailed(true)}
        />
    );
}

function SkillRow({ skill }: { skill: InspectionSkill }) {
    const remaining = skill.nextLevelXp === null ? 0 : Math.max(0, skill.nextLevelXp - skill.xp);
    const progress =
        skill.nextLevelXp === null
            ? 100
            : Math.max(
                  0,
                  Math.min(
                      100,
                      (100 * (skill.xp - skill.levelXp)) /
                          Math.max(1, skill.nextLevelXp - skill.levelXp),
                  ),
              );
    return (
        <div className="inspect-skill">
            <div className="inspect-skill-heading">
                <span>{skill.name}</span>
                <strong>
                    {skill.level}/{skill.baseLevel}
                </strong>
            </div>
            <div className="inspect-xp">
                {skill.xp.toLocaleString()} XP
                <span>
                    {skill.nextLevelXp === null
                        ? "Max level"
                        : `${remaining.toLocaleString()} to next`}
                </span>
            </div>
            <div
                className="inspect-progress"
                role="progressbar"
                aria-label={`${skill.name} level progress`}
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div style={{ width: `${progress}%` }} />
            </div>
        </div>
    );
}

export function PlayerInspector({ mapViewer }: { mapViewer: MapViewer }): JSX.Element | null {
    useLiveVersion(mapViewer);
    const live = mapViewer.live;
    const name = live?.inspectName;
    const [tab, setTab] = useState<"inventory" | "skills">("inventory");
    const panel = useRef<HTMLElement>(null);
    const close = () => {
        live?.closeInspection();
        mapViewer.renderer.canvas.focus();
    };
    useEffect(() => {
        setTab("inventory");
        if (name) panel.current?.focus();
    }, [name]);
    if (!live || !name) return null;
    const details = live.inspection?.player;
    const origin = new URL(live.url.replace(/^ws/, "http")).origin;
    const occupied = details?.inventory.filter(Boolean).length ?? 0;
    const message =
        live.status !== "open"
            ? "Disconnected. Waiting to reconnect…"
            : !live.inspectionSupported
            ? "Character details are unavailable on this server."
            : !live.inspection
            ? "Loading character…"
            : !details
            ? "Player is offline or unavailable."
            : undefined;
    return (
        <aside
            className="player-inspector rs-border rs-background"
            role="dialog"
            aria-label={`Inspect ${name}`}
            tabIndex={-1}
            ref={panel}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    close();
                }
            }}
        >
            <div className="inspect-header">
                <div>
                    <strong>{details?.name ?? name}</strong>
                    {details && (
                        <div className="inspect-muted">
                            Combat {details.combatLevel} · HP {details.hp[0]}/{details.hp[1]}
                        </div>
                    )}
                </div>
                <button
                    className="live-button"
                    aria-label="Close character inspector"
                    onClick={close}
                >
                    ×
                </button>
            </div>
            <button
                className="live-button inspect-follow"
                disabled={!details}
                onClick={() => live.goToPlayer(details!.name, mapViewer.camera)}
            >
                Follow character
            </button>
            <div className="inspect-tabs" role="tablist" aria-label="Character details">
                <button
                    role="tab"
                    id="inspect-inventory-tab"
                    aria-controls="inspect-content"
                    aria-selected={tab === "inventory"}
                    onClick={() => setTab("inventory")}
                >
                    Inventory
                </button>
                <button
                    role="tab"
                    id="inspect-skills-tab"
                    aria-controls="inspect-content"
                    aria-selected={tab === "skills"}
                    onClick={() => setTab("skills")}
                >
                    Skills
                </button>
            </div>
            <div
                className="inspect-content"
                id="inspect-content"
                role="tabpanel"
                aria-labelledby={`inspect-${tab}-tab`}
            >
                {message ? (
                    <p className="inspect-muted" role="status">
                        {message}
                    </p>
                ) : (
                    details &&
                    (tab === "inventory" ? (
                        <>
                            <div className="inspect-inventory-count">
                                {occupied}/28 slots occupied
                            </div>
                            <div className="inspect-inventory">
                                {Array.from({ length: 28 }, (_, slot) => {
                                    const item = details.inventory[slot];
                                    const label = item
                                        ? `${item.name} × ${item.count.toLocaleString()}`
                                        : `Empty slot ${slot + 1}`;
                                    return (
                                        <div
                                            className="inspect-slot"
                                            key={slot}
                                            title={label}
                                            aria-label={label}
                                        >
                                            {item && (
                                                <>
                                                    <ItemIcon
                                                        key={`${item.id}:${item.count}`}
                                                        item={item}
                                                        origin={origin}
                                                    />
                                                    {item.count > 1 && (
                                                        <span className="inspect-count">
                                                            {item.count.toLocaleString()}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="inspect-skills">
                            {details.skills.map((skill) => (
                                <SkillRow key={skill.id} skill={skill} />
                            ))}
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
