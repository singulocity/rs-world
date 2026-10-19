import { LiveWorld } from "./LiveWorld";

function world() {
    return new LiveWorld({} as any, {} as any, {} as any, undefined);
}
const item = { i: 7, t: 995, c: 25, x: 3210, z: 3211, l: 2 };

test("ground item deltas replace quantities and remove picked up or out-of-area objects", () => {
    const w = world();
    w.applyTick({ t: "tick", k: 1, ms: 600, o: [item] });
    w.applyTick({ t: "tick", k: 2, ms: 600 });
    expect(w.groundItems.get(7)).toEqual(item);
    w.applyTick({ t: "tick", k: 3, ms: 600, o: [{ ...item, c: 100 }] });
    expect(w.groundItems.size).toBe(1);
    expect(w.groundItems.get(7)?.c).toBe(100);
    w.applyTick({ t: "tick", k: 4, ms: 600, ro: [7] });
    expect(w.groundItems.size).toBe(0);
});

test("slow-client resets replace the scene and reconnect clears ground items", () => {
    const w = world();
    w.applyTick({ t: "tick", k: 1, ms: 600, o: [item] });
    w.applyTick({ t: "tick", k: 2, ms: 600, reset: 1, o: [{ ...item, i: 8 }] });
    expect([...w.groundItems.keys()]).toEqual([8]);
    w.clear();
    expect(w.groundItems.size).toBe(0);
});
