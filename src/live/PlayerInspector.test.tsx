import { fireEvent, render, screen } from "@testing-library/react";

import { PlayerInspector } from "./PlayerInspector";

function viewer() {
    return {
        live: {
            version: 1,
            url: "ws://localhost:8888/worldfeed",
            status: "open",
            inspectName: "Alice",
            inspectionSupported: true,
            inspection: {
                t: "inspect",
                k: 1,
                name: "alice",
                player: {
                    name: "Alice",
                    combatLevel: 3,
                    hp: [8, 10],
                    inventory: Array.from({ length: 28 }, (_, i) =>
                        i === 3 ? { id: 1511, name: "Logs", count: 12 } : null,
                    ),
                    skills: [
                        {
                            id: 8,
                            name: "Woodcutting",
                            level: 7,
                            baseLevel: 6,
                            xp: 1500,
                            levelXp: 1000,
                            nextLevelXp: 2000,
                        },
                    ],
                },
            },
            closeInspection: jest.fn(),
            goToPlayer: jest.fn(),
        },
        renderer: { canvas: { focus: jest.fn() } },
        camera: {},
    } as any;
}

test("keeps inventory slots, quantities and server icon origin", () => {
    const mapViewer = viewer();
    const { container } = render(<PlayerInspector mapViewer={mapViewer} />);
    expect(container.querySelectorAll(".inspect-slot")).toHaveLength(28);
    expect(container.querySelectorAll(".inspect-slot")[3]).toHaveAttribute(
        "aria-label",
        "Logs × 12",
    );
    expect(screen.getByRole("img", { name: "Logs" })).toHaveAttribute(
        "src",
        "http://localhost:8888/sprite/item/1511-12.png",
    );
    expect(screen.getByText("Combat 3 · HP 8/10")).toBeInTheDocument();
    expect(mapViewer.live.goToPlayer).not.toHaveBeenCalled();
});

test("shows current/base levels and the engine's XP thresholds", () => {
    render(<PlayerInspector mapViewer={viewer()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByText("7/6")).toBeInTheDocument();
    expect(screen.getByText("500 to next")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
});

test("close unsubscribes and restores camera focus; follow is explicit", () => {
    const mapViewer = viewer();
    render(<PlayerInspector mapViewer={mapViewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Follow character" }));
    expect(mapViewer.live.goToPlayer).toHaveBeenCalledWith("Alice", mapViewer.camera);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(mapViewer.live.closeInspection).toHaveBeenCalledTimes(1);
    expect(mapViewer.renderer.canvas.focus).toHaveBeenCalled();
});

test("hides stale data while disconnected and distinguishes offline players", () => {
    const mapViewer = viewer();
    mapViewer.live.status = "closed";
    const { rerender } = render(<PlayerInspector mapViewer={mapViewer} />);
    expect(screen.getByRole("status")).toHaveTextContent("Disconnected");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    mapViewer.live.status = "open";
    mapViewer.live.inspection.player = null;
    rerender(<PlayerInspector mapViewer={mapViewer} />);
    expect(screen.getByRole("status")).toHaveTextContent("offline or unavailable");
});

test("reports old servers without inspection support", () => {
    const mapViewer = viewer();
    mapViewer.live.inspectionSupported = false;
    render(<PlayerInspector mapViewer={mapViewer} />);
    expect(screen.getByRole("status")).toHaveTextContent("unavailable on this server");
});

test("the inspector title supports keyboard movement and stays inside the window", () => {
    const { container } = render(<PlayerInspector mapViewer={viewer()} />);
    const panel = screen.getByRole("dialog");
    const bounds = jest
        .spyOn(panel, "getBoundingClientRect")
        .mockReturnValue({ left: 100, top: 80, width: 292, height: 400 } as DOMRect);
    const handle = screen.getByRole("button", { name: "Move character inspector" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(panel).toHaveStyle({ left: "116px", top: "80px", right: "auto" });
    bounds.mockReturnValue({ left: -100, top: -100, width: 292, height: 400 } as DOMRect);
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(panel).toHaveStyle({ left: "8px", top: "8px" });
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));
    expect(container.querySelector(".inspect-skills")).toBeInTheDocument();
    expect(panel).toHaveStyle({ left: "8px", top: "8px" });
    bounds.mockRestore();
});

test("dragging captures the pointer, releases it and preserves position when switching characters", () => {
    class TestPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
        }
    }
    const original = window.PointerEvent;
    window.PointerEvent = TestPointerEvent as any;
    const mapViewer = viewer();
    const { rerender } = render(<PlayerInspector mapViewer={mapViewer} />);
    const panel = screen.getByRole("dialog");
    const bounds = jest
        .spyOn(panel, "getBoundingClientRect")
        .mockReturnValue({ left: 100, top: 80, width: 292, height: 400 } as DOMRect);
    const handle = screen.getByRole("button", { name: "Move character inspector" });
    handle.setPointerCapture = jest.fn();
    handle.releasePointerCapture = jest.fn();
    fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(handle, { clientX: 220, clientY: 150, pointerId: 3 });
    expect(handle.setPointerCapture).toHaveBeenCalledWith(3);
    expect(panel).toHaveStyle({ left: "200px", top: "130px" });
    fireEvent.pointerUp(handle, { pointerId: 3 });
    fireEvent.pointerMove(handle, { clientX: 600, clientY: 500, pointerId: 3 });
    expect(panel).toHaveStyle({ left: "200px", top: "130px" });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(3);
    mapViewer.live.inspectName = "Bob";
    rerender(<PlayerInspector mapViewer={mapViewer} />);
    expect(screen.getByRole("dialog", { name: "Inspect Bob" })).toHaveStyle({
        left: "200px",
        top: "130px",
    });
    bounds.mockRestore();
    window.PointerEvent = original;
});
