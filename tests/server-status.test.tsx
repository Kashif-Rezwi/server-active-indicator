import * as axe from "axe-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __engineCount } from "../src/core/registry";
import { ServerStatus, ServerStatusProvider } from "../src/react/index";
import { STYLES } from "../src/react/styles";

const URL = "https://api.example.com/health";
const STYLE_ID = "server-active-indicator-styles";

function res(status: number, ok = status >= 200 && status < 300) {
  return { ok, status } as Response;
}

/** A fetch mock that resolves after `ms` with the given status. */
function fetchResolving(ms: number, status: number) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(res(status)), ms);
      }),
  );
}

/** A fetch mock that rejects after `ms` (network/CORS/DNS failure). */
function fetchRejecting(ms: number) {
  return vi.fn(
    () =>
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new TypeError("fetch failed")), ms);
      }),
  );
}

function styleTags(): HTMLElement[] {
  return Array.from(document.querySelectorAll(`style#${STYLE_ID}`));
}

describe("ServerStatus — default UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic jitter: 0.8 + 0.5 * 0.4 = 1.0 exactly.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Start every test without the injected stylesheet.
    styleTags().forEach((el) => el.remove());
  });

  it("renders nothing on a warm backend (silence on success)", async () => {
    vi.stubGlobal("fetch", fetchResolving(50, 200));
    const { container } = render(<ServerStatus healthUrl={URL} />);
    expect(container.querySelector(".sai-banner")).toBeNull(); // first commit: unknown
    expect(screen.queryByRole("status")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // check succeeds → active, wasCold=false
    });
    expect(screen.queryByRole("status")).toBeNull(); // warm start stays silent
  });

  it("shows the waking banner with locked copy, a live region, and the counter", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    render(<ServerStatus healthUrl={URL} revealDelay={30} offlineAfter={600_000} />);
    expect(screen.queryByRole("status")).toBeNull(); // checking is silent

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40); // first attempt fails; reveal fires
    });
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("class")).toBe("sai-banner");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("data-state")).toBe("waking");
    expect(banner.textContent).toContain(
      "The server is starting up — this can take up to a minute on first visit.",
    );
    expect(banner.querySelector("svg.sai-spinner")).not.toBeNull();

    const elapsed = banner.querySelector(".sai-elapsed");
    expect(elapsed).not.toBeNull();
    // Per-second ticks must not spam screen readers through the live region.
    expect(elapsed?.getAttribute("aria-hidden")).toBe("true");
    expect(elapsed?.textContent).toBe("0s");
  });

  it("ticks the elapsed counter and switches to the Mm Ss format past 60s", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    render(<ServerStatus healthUrl={URL} revealDelay={30} offlineAfter={600_000} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    }); // waking, ticker hasn't fired

    const readTime = () =>
      screen.getByRole("status").querySelector(".sai-elapsed")?.textContent ?? "";
    expect(readTime()).toBe("0s");

    // After ~3s the ticker has fired at least once; exact value depends on
    // microtask flushing — accept any single-digit seconds reading.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(readTime()).toMatch(/^[1-9]s$/);

    // Cross a minute. Total elapsed ~60s — the episode clock starts at the
    // first attempt's resolution (t=20), so accept the one-second boundary
    // depending on exact tick alignment.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(58_000);
    });
    expect(readTime()).toMatch(/^1m [01]s$/);
  });

  it("shows the ready confirmation after a cold start and auto-hides it", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(() => (call < 3 ? reject(new TypeError("down")) : resolve(res(200))), 20);
          }),
      ),
    );
    render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        pollInterval={5_000}
        backoffFactor={1}
        successDisplayMs={1_000}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40); // attempt 1 fails → waking
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020); // attempt 2 fails
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020); // attempt 3 succeeds → active
    });

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-state")).toBe("active");
    expect(banner.textContent).toContain("The server is ready.");
    expect(banner.querySelector("svg")).not.toBeNull(); // check icon
    expect(banner.querySelector(".sai-elapsed")).toBeNull(); // counter stays with waking
    expect(banner.querySelector(".sai-retry")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    }); // successDisplayMs
    expect(screen.queryByRole("status")).toBeNull(); // auto-hidden
  });

  it("re-shows the waking banner and re-arms the confirmation after re-sleep", async () => {
    let respond: "ok" | "fail" = "fail";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            setTimeout(
              () => (respond === "ok" ? resolve(res(200)) : reject(new TypeError("down"))),
              20,
            );
          }),
      ),
    );
    render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        pollInterval={5_000}
        backoffFactor={1}
        activeCheckInterval={2_000}
        successDisplayMs={10_000}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    }); // fail → waking
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020);
    }); // fail again
    respond = "ok";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020);
    }); // success → active
    // The confirmation is on screen now (successDisplayMs is 10s; no auto-dismiss yet).
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("active");

    // activeCheckInterval re-check while server has gone back to sleep.
    respond = "fail";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_020);
    });
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("waking");

    respond = "ok"; // next poll recovers → confirmation re-armed (ref + re-arm both reset)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020);
    });
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("active");
  });

  it("stays silent for a late-mounting consumer against an already-active monitor", async () => {
    // Same config on both: they share an engine; the second instance mounts after the first
    // has passed through waking and is now active.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            call += 1;
            setTimeout(() => (call < 2 ? reject(new TypeError("down")) : resolve(res(200))), 20);
          }),
      ),
    );
    const first = render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        pollInterval={5_000}
        backoffFactor={1}
        successDisplayMs={15_000}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    }); // waking
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_020);
    }); // active confirm
    expect(first.container.querySelector(".sai-banner")).not.toBeNull();

    // Late-mounter with the same config shares the engine; its dismissed initializer
    // suppresses the confirmation.
    const second = render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        pollInterval={5_000}
        backoffFactor={1}
        successDisplayMs={15_000}
      />,
    );
    expect(second.container.querySelector(".sai-banner")).toBeNull();
    first.unmount();
    second.unmount();
  });

  it("shows the offline banner with a working Retry button", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(res(404))); // → fast-path offline (http-error)
    vi.stubGlobal("fetch", fetchMock);
    render(<ServerStatus healthUrl={URL} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-state")).toBe("offline");
    expect(banner.getAttribute("data-offline-kind")).toBe("server");
    expect(banner.textContent).toContain("The server appears to be unavailable.");
    const retry = banner.querySelector("button.sai-retry") as HTMLButtonElement;
    expect(retry.textContent).toBe("Retry");
    expect(retry.getAttribute("type")).toBe("button");

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore); // refresh → new attempt
  });

  it("shows the browser-offline message when the browser itself is offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", fetchResolving(20, 200));
    render(<ServerStatus healthUrl={URL} revealDelay={30} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-state")).toBe("offline");
    expect(banner.getAttribute("data-offline-kind")).toBe("browser");
    expect(banner.textContent).toContain("You appear to be offline — check your connection.");
    expect(banner.querySelector(".sai-retry")).not.toBeNull();
    onLine.mockRestore();
  });

  it("renders the pill variant and merges className onto the root", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        variant="pill"
        className="my-indicator"
        offlineAfter={600_000}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    const pill = screen.getByRole("status");
    expect(pill.getAttribute("class")).toBe("sai-pill my-indicator");
    expect(pill.getAttribute("data-state")).toBe("waking");
    expect(pill.querySelector("svg.sai-spinner")).not.toBeNull();
    expect(pill.textContent).toContain("starting up");
  });

  it("honors i18n overrides for both waking and offline messages", async () => {
    // Waking override on its own:
    vi.stubGlobal("fetch", fetchRejecting(20));
    const { unmount: unmountA } = render(
      <ServerStatus
        healthUrl={URL}
        revealDelay={30}
        offlineAfter={600_000}
        messages={{ waking: "Le serveur démarre…" }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(screen.getByRole("status").textContent).toContain("Le serveur démarre");
    unmountA();

    // Offline + retry override on its own:
    styleTags().forEach((el) => el.remove());
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(res(404))),
    );
    render(
      <ServerStatus
        healthUrl={URL}
        messages={{ offline: "Serveur indisponible.", retry: "Réessayer" }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Serveur indisponible.");
    expect(banner.querySelector("button.sai-retry")?.textContent).toBe("Réessayer");
  });

  it("delegates entirely to the children render prop and skips stylesheet injection", async () => {
    const before = styleTags().length;
    vi.stubGlobal("fetch", fetchRejecting(20));
    const seen: string[] = [];
    const { container } = render(
      <ServerStatus healthUrl={URL} revealDelay={30} offlineAfter={600_000}>
        {(s) => {
          seen.push(s.status);
          return s.status === "waking" ? <i data-testid="rp">custom {s.elapsedSeconds}</i> : null;
        }}
      </ServerStatus>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    // Render prop is raw — receives even `unknown` (no internal silence-on-success layer).
    expect(seen).toContain("unknown");
    expect(screen.getByTestId("rp").textContent).toMatch(/^custom /);
    expect(screen.queryByRole("status")).toBeNull(); // no sai- root
    expect(container.querySelector(".sai-banner")).toBeNull();
    expect(container.querySelector(".sai-pill")).toBeNull();
    expect(styleTags().length).toBe(before); // no stylesheet injected
  });

  it("injects exactly one stylesheet with sai- rules, 320px-safety, and motion/color tokens", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    const first = render(<ServerStatus healthUrl={URL} revealDelay={30} />);
    const second = render(<ServerStatus healthUrl={URL} revealDelay={30} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    const third = render(<ServerStatus healthUrl={URL} revealDelay={30} />);
    third.unmount();
    expect(styleTags().length).toBe(1);

    const css = styleTags()[0]?.textContent ?? "";
    expect(css).toBe(STYLES); // injector uses the exported stylesheet verbatim
    expect(css).toContain(".sai-banner");
    expect(css).toContain(".sai-pill");
    expect(css).toContain(".sai-retry");
    expect(css).toContain(".sai-spinner");
    expect(css).toContain(".sai-icon");
    // 320px safeguards: long messages wrap rather than overflow.
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("max-width: 100%");
    // No hard-pixel widths on the sai- root classes (fluid only).
    expect(css).not.toMatch(/\.sai-(banner|pill)\b[^}]*\bwidth:\s*\d+px/);
    // Motion + theme.
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("--sai-waking-bg");
    expect(css).toContain("--sai-active-text");
    expect(css).toContain("--sai-offline-accent");
    first.unmount();
    second.unmount();
  });

  it("uses the provider's monitor when no check source is on the props", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    render(
      <ServerStatusProvider healthUrl={URL} revealDelay={30} offlineAfter={600_000}>
        <ServerStatus />
      </ServerStatusProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(__engineCount()).toBe(1); // one shared engine
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("waking");
  });

  it("creates exactly one engine for its own config and destroys it on unmount", async () => {
    vi.stubGlobal("fetch", fetchResolving(20, 200));
    const { unmount } = render(<ServerStatus healthUrl={URL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(__engineCount()).toBe(1);
    unmount();
    expect(__engineCount()).toBe(0);
  });

  it("surfaces the hook's usage error without a check source and without a provider", () => {
    // React 19 logs propagation through console.error — silence for the assertion noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ServerStatus variant="pill" />)).toThrow(/ServerStatusProvider/);
    spy.mockRestore();
  });

  it("releases its engine on unmount mid-waking", async () => {
    vi.stubGlobal("fetch", fetchRejecting(20));
    const { unmount } = render(
      <ServerStatus healthUrl={URL} revealDelay={30} offlineAfter={600_000} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(__engineCount()).toBe(1);
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("waking");
    unmount();
    expect(__engineCount()).toBe(0);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ServerStatus — accessibility (axe-core)", () => {
  beforeEach(() => {
    // html-has-lang applies at the page level; axe-core flags missing/default lang otherwise.
    document.documentElement.lang = "en";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    styleTags().forEach((el) => el.remove());
  });

  async function assertNoViolations(container: Element) {
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  }

  // axe.run() processes the sync rule tree; with jsdom + ~100 enabled rules this can
  // take a couple of seconds. Keep the block out of the default 5s budget.
  it("waking banner has no axe violations", async () => {
    const { container } = render(
      <ServerStatus check={() => new Promise<boolean>(() => {})} revealDelay={30} />,
    );
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    await assertNoViolations(container);
  }, 30_000);

  it("active confirmation has no axe violations", async () => {
    let resolve!: (v: boolean) => void;
    const check = () =>
      new Promise<boolean>((r) => {
        resolve = r;
      });
    const { container } = render(
      <ServerStatus check={check} revealDelay={30} successDisplayMs={15_000} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-state")).toBe("waking"),
    );
    await act(async () => {
      resolve(true);
    });
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-state")).toBe("active"),
    );
    await assertNoViolations(container);
  }, 30_000);

  it("offline (server) with the Retry button has no axe violations", async () => {
    const { container } = render(
      <ServerStatus check={async () => ({ ok: false, reason: "http-error", status: 404 })} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy());
    await assertNoViolations(container);
  }, 30_000);

  it("browser-offline has no axe violations", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { container } = render(<ServerStatus check={async () => true} />);
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-offline-kind")).toBe("browser"),
    );
    await assertNoViolations(container);
    onLine.mockRestore();
  }, 30_000);

  it("pill variant has no axe violations", async () => {
    const { container } = render(
      <ServerStatus variant="pill" check={() => new Promise<boolean>(() => {})} revealDelay={30} />,
    );
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    await assertNoViolations(container);
  }, 30_000);
});
