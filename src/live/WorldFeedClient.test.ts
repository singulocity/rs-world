import { WorldFeedClient } from "./WorldFeedClient";

class Socket {
    static OPEN = 1;
    static instances: Socket[] = [];
    readyState = 1;
    send = jest.fn();
    close = jest.fn();
    onopen?: () => void;
    onclose?: (event: any) => void;
    onmessage?: (event: any) => void;
    constructor() {
        Socket.instances.push(this);
    }
}

const originalWebSocket = global.WebSocket;
beforeEach(() => {
    jest.useFakeTimers();
    Socket.instances = [];
    global.WebSocket = Socket as any;
});
afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
});
function client() {
    return new WorldFeedClient("ws://localhost/worldfeed", {
        onHello: jest.fn(),
        onTick: jest.fn(),
        onRoster: jest.fn(),
        onStatus: jest.fn(),
        onInspection: jest.fn(),
    });
}
test("restores the selected inspection after reconnecting", () => {
    const feed = client();
    feed.setInspection("Alice");
    feed.connect();
    const first = Socket.instances[0];
    first.onopen!();
    expect(first.send).toHaveBeenCalledWith(JSON.stringify({ t: "inspect", name: "Alice" }));
    first.onclose!({ code: 1006 });
    jest.advanceTimersByTime(1000);
    const second = Socket.instances[1];
    second.onopen!();
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ t: "inspect", name: "Alice" }));
    feed.close();
});
test("unsubscribes and does not restore a closed inspector", () => {
    const feed = client();
    feed.connect();
    const first = Socket.instances[0];
    first.onopen!();
    feed.setInspection("Alice");
    feed.setInspection(null);
    expect(first.send).toHaveBeenLastCalledWith(JSON.stringify({ t: "inspect", name: null }));
    first.onclose!({ code: 1006 });
    jest.advanceTimersByTime(1000);
    Socket.instances[1].onopen!();
    expect(Socket.instances[1].send).not.toHaveBeenCalled();
    feed.close();
});

test("ground item subscription survives reconnect and can be disabled", () => {
    const feed = client();
    feed.setItems(true);
    feed.connect();
    const first = Socket.instances[0];
    first.onopen!();
    expect(first.send).toHaveBeenCalledWith(JSON.stringify({ t: "items", on: true }));
    first.onclose!({ code: 1006 });
    jest.advanceTimersByTime(1000);
    const second = Socket.instances[1];
    second.onopen!();
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ t: "items", on: true }));
    feed.setItems(false);
    expect(second.send).toHaveBeenLastCalledWith(JSON.stringify({ t: "items", on: false }));
    second.onclose!({ code: 1006 });
    jest.advanceTimersByTime(2000);
    Socket.instances[2].onopen!();
    expect(Socket.instances[2].send).not.toHaveBeenCalled();
    feed.close();
});
