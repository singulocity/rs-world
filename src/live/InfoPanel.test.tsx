import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

test("loads on demand and shows collapsed bot totals and system RAM", async () => {
    render(<InfoPanel mapViewer={viewer} />);
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    await screen.findByText("1.50 GiB");
    expect(screen.getByText("3.00 GiB")).toBeInTheDocument();
    const allBots = screen.getByRole("button", { name: "All bots" });
    expect(allBots).toHaveAttribute("aria-expanded", "false");
    expect(within(allBots.closest("tr")!).getByText("512.0 MiB")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ChefCora processes" })).not.toBeInTheDocument();
    fireEvent.click(allBots);
    const bot = screen.getByRole("button", { name: "ChefCora processes" });
    expect(bot).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    fireEvent.click(bot);
    expect(screen.getByText("Client")).toBeInTheDocument();
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

test("combines clients, controllers and descendants without changing overall totals", async () => {
    const processes = [
        { service: "bot-ChefCora", pid: 42, workingSetBytes: 200, privateBytes: 400 },
        { service: "bot-ChefCora / child", pid: 43, workingSetBytes: 20, privateBytes: 30 },
        { service: "routine-ChefCora", pid: 44, workingSetBytes: 300, privateBytes: 600 },
        { service: "routine-ChefCora / child", pid: 45, workingSetBytes: 10, privateBytes: 20 },
        { service: "bot", botName: "KuUzmeFTw", pid: 46, workingSetBytes: 100, privateBytes: 200 },
        {
            service: "routine",
            botName: "KuUzmeFTw",
            pid: 47,
            workingSetBytes: 150,
            privateBytes: 300,
        },
        {
            service: "routine / child",
            botName: "KuUzmeFTw",
            pid: 48,
            workingSetBytes: 10,
            privateBytes: 20,
        },
        { service: "engine", pid: 20, workingSetBytes: 400, privateBytes: 800 },
    ].map((p) => ({
        ...p,
        workingSetBytes: p.workingSetBytes * 1024 ** 2,
        privateBytes: p.privateBytes * 1024 ** 2,
    }));
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ ...snapshot, processes }),
    });
    const { container } = render(<InfoPanel mapViewer={viewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    const allBots = await screen.findByRole("button", { name: "All bots" });
    fireEvent.click(allBots);
    const chef = screen.getByRole("button", { name: "ChefCora processes" });
    const summary = chef.closest("tr")!;
    expect(within(summary).getByText("530.0 MiB")).toBeInTheDocument();
    expect(within(summary).getByText("1.03 GiB")).toBeInTheDocument();
    expect(within(summary).getByText("4 processes")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    const fleet = allBots.closest("tr")!;
    // Bot-only totals exclude the shared engine and count each process once.
    expect(within(fleet).getByText("790.0 MiB")).toBeInTheDocument();
    expect(within(fleet).getByText("1.53 GiB")).toBeInTheDocument();
    expect(within(fleet).getByText("2 bots")).toBeInTheDocument();
    expect(container.querySelector("tbody tr")).toBe(fleet);
    expect(container.querySelectorAll(".memory-bot-total")[0]).toBe(summary);
    const primary = screen.getByRole("button", { name: "KuUzmeFTw processes" });
    expect(within(primary.closest("tr")!).getByText("260.0 MiB")).toBeInTheDocument();
    fireEvent.click(chef);
    for (const pid of [42, 43, 44, 45]) expect(screen.getByText(String(pid))).toBeInTheDocument();
    expect(screen.getByText("Client / child")).toBeInTheDocument();
    expect(screen.getByText("Controller / child")).toBeInTheDocument();
    expect(screen.queryByText("46")).not.toBeInTheDocument();
    fireEvent.click(allBots);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ChefCora processes" })).not.toBeInTheDocument();
    fireEvent.click(allBots);
    const reopened = screen.getByRole("button", { name: "ChefCora processes" });
    expect(reopened).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("42")).toBeInTheDocument();
    fireEvent.click(reopened);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(screen.getByText("1.50 GiB")).toBeInTheDocument();
});

test("keeps a bot expanded across live samples and updates its combined total", async () => {
    jest.useFakeTimers();
    render(<InfoPanel mapViewer={viewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Processes" }));
    const allBots = await screen.findByRole("button", { name: "All bots" });
    fireEvent.click(allBots);
    const chef = screen.getByRole("button", { name: "ChefCora processes" });
    fireEvent.click(chef);
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
            ...snapshot,
            processes: [
                ...snapshot.processes,
                {
                    service: "routine-ChefCora",
                    pid: 43,
                    workingSetBytes: 256 * 1024 ** 2,
                    privateBytes: 512 * 1024 ** 2,
                },
            ],
        }),
    });
    await act(async () => {
        jest.advanceTimersByTime(5000);
    });
    await waitFor(() =>
        expect(within(chef.closest("tr")!).getByText("768.0 MiB")).toBeInTheDocument(),
    );
    expect(chef).toHaveAttribute("aria-expanded", "true");
    expect(allBots).toHaveAttribute("aria-expanded", "true");
    expect(within(allBots.closest("tr")!).getByText("768.0 MiB")).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument();
});
