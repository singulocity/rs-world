import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InfoPanel } from "./InfoPanel";

const snapshot = {
    sampledAt: "2026-10-19T12:00:00Z",
    processes: [
        {
            service: "bot-ChefCora",
            pid: 42,
            workingSetBytes: 512 * 1024 ** 2,
            privateBytes: 1024 ** 3,
        },
        { service: "engine", pid: 20, workingSetBytes: 1024 ** 3, privateBytes: 2 * 1024 ** 3 },
    ],
    totals: { processCount: 2, workingSetBytes: 1.5 * 1024 ** 3, privateBytes: 3 * 1024 ** 3 },
    host: { totalBytes: 32 * 1024 ** 3, availableBytes: 8 * 1024 ** 3 },
};
const viewer = { live: { url: "ws://localhost:8888/worldfeed", version: 1 } } as any;
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
});
afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
});

test("loads on demand and shows totals, every PID and system RAM", async () => {
    render(<InfoPanel mapViewer={viewer} />);
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    await screen.findByText("1.50 GiB");
    expect(screen.getByText("3.00 GiB")).toBeInTheDocument();
    expect(screen.getByText("Client · ChefCora")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        "http://localhost:7780/local/metrics",
    );
});

test("keeps the last good reading on failure and stops polling when closed", async () => {
    jest.useFakeTimers();
    render(<InfoPanel mapViewer={viewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    await screen.findByText("1.50 GiB");
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    await act(async () => {
        jest.advanceTimersByTime(5000);
    });
    await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("last successful sample"),
    );
    expect(screen.getByText("1.50 GiB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close process dashboard" }));
    await act(async () => {
        jest.advanceTimersByTime(20000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("does not query a local machine for a remote world", () => {
    render(<InfoPanel mapViewer={{ live: { url: "wss://example.com/worldfeed" } } as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    expect(screen.getByRole("status")).toHaveTextContent("local world");
    expect(global.fetch).not.toHaveBeenCalled();
});
