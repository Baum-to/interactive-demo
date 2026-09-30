import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Step } from "@inkly-org/interactive-demo";
import { StepSchema } from "@inkly-org/interactive-demo/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ generateVoiceover: vi.fn() }));
vi.mock("@/api", () => api);
// The asset picker dialog is irrelevant here and pulls in the whole
// inspector tree; the panel only mounts it when "Asset" is clicked.
vi.mock("./inspectors", () => ({ MediaAssetPickerDialog: () => null }));
// Base UI's positioned popover doesn't settle under jsdom; render the voice
// list inline so the grouping and selection can be exercised.
vi.mock("@/components/ui/popover", () => ({
    Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverTrigger: ({ children }: { children: ReactNode }) => (
        <button type="button">{children}</button>
    ),
    PopoverContent: ({ children }: { children: ReactNode }) => (
        <div role="listbox">{children}</div>
    ),
}));

import type { HostCapabilities } from "@/api";
import {
    VoiceoverInspector,
    buildCaptionCues,
    splitSentencesClient,
} from "./voiceover";

const STEP = {
    kind: "content",
    id: "s1",
    background: { type: "image", src: "assets/shot.png", naturalWidth: 1440, naturalHeight: 900 },
    advance: { trigger: "auto" },
    annotations: [],
    script: "Hello there. Welcome to the tour!",
} as unknown as Step;

const CAPABILITY: HostCapabilities["voiceover"] = {
    maxChars: 1000,
    voices: [
        { id: "dennis", name: "Dennis", descriptor: "Calm male", country: "United States", previewUrl: "/v/dennis.mp3" },
        { id: "ashley", name: "Ashley", descriptor: "Warm female", country: "United States", previewUrl: "/v/ashley.mp3", isDefault: true },
        { id: "olivia", name: "Olivia", descriptor: "Friendly female", country: "United Kingdom", previewUrl: "/v/olivia.mp3" },
    ],
};

/** jsdom never loads media; report a 4 s clip for every probe. */
class FakeAudio {
    duration = 4;
    preload = "";
    crossOrigin: string | null = null;
    private listeners: Record<string, Array<() => void>> = {};
    addEventListener(type: string, fn: () => void) {
        (this.listeners[type] ??= []).push(fn);
    }
    removeEventListener(type: string, fn: () => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    }
    set src(_value: string) {
        queueMicrotask(() => this.listeners.loadedmetadata?.forEach((fn) => fn()));
    }
}

function renderPanel(
    voiceoverCapability?: HostCapabilities["voiceover"],
    step: Step = STEP,
) {
    const onUpdateStep = vi.fn();
    const onAssetsChanged = vi.fn();
    const onAssetUploaded = vi.fn();
    render(
        <VoiceoverInspector
            steps={[step]}
            selectedStepId={step.id}
            onUpdateStep={onUpdateStep}
            slug="tour"
            demoId="tour"
            assets={[]}
            onAssetsChanged={onAssetsChanged}
            onAssetUploaded={onAssetUploaded}
            resolveAudioSrc={(src) => `/tour/${src}`}
            voiceoverCapability={voiceoverCapability}
        />,
    );
    return { onUpdateStep, onAssetsChanged, onAssetUploaded };
}

describe("VoiceoverInspector", () => {
    beforeEach(() => {
        api.generateVoiceover.mockReset();
        vi.stubGlobal("Audio", FakeAudio);
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("offers only Record and Asset when the host has no voiceover capability", () => {
        renderPanel();
        expect(screen.getByRole("button", { name: /record/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /asset/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
        expect(screen.queryByText("Voice")).toBeNull();
    });

    it("shows the voice picker, on the host's default voice, and Generate when offered", () => {
        renderPanel(CAPABILITY);
        expect(screen.getByText("Voice")).toBeTruthy();
        // The trigger shows the selected voice with its country + descriptor.
        const trigger = screen.getByText("United States · Warm female").closest("button")!;
        expect(trigger.textContent).toContain("Ashley · default");
        expect(screen.getByRole("button", { name: /generate/i })).toBeTruthy();
    });

    it("generates from the script and writes the voiceover and caption cues", async () => {
        const asset = {
            path: "assets/voiceover-s1.mp3",
            publicUrl: "/tour/assets/voiceover-s1.mp3",
            contentType: "audio/mpeg",
            size: 10,
            kind: "audio",
        };
        api.generateVoiceover.mockResolvedValue({
            asset,
            sentences: ["Hello there.", "Welcome to the tour!"],
        });
        const { onUpdateStep, onAssetsChanged, onAssetUploaded } = renderPanel(CAPABILITY);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /generate/i }));
        });

        expect(api.generateVoiceover).toHaveBeenCalledWith("tour", {
            stepId: "s1",
            text: "Hello there. Welcome to the tour!",
            voiceId: "ashley",
        });
        expect(onAssetUploaded).toHaveBeenCalledWith(asset);
        expect(onAssetsChanged).toHaveBeenCalled();
        const patch = onUpdateStep.mock.calls.at(-1)![1] as {
            voiceover?: { src: string; duration?: number };
            captions?: Array<{ id: string; start: number; end: number; text: string }>;
        };
        expect(patch.voiceover).toEqual({ src: "assets/voiceover-s1.mp3", duration: 4000 });
        expect(patch.captions).toEqual(
            buildCaptionCues("s1", ["Hello there.", "Welcome to the tour!"], 4000),
        );
        expect(patch.captions![0]).toMatchObject({ id: "s1_c1", start: 0, text: "Hello there." });
        expect(patch.captions!.at(-1)!.end).toBeCloseTo(4000);
        // What the panel writes is a valid step for the player.
        expect(() => StepSchema.parse({ ...STEP, ...patch })).not.toThrow();
    });

    it("groups voices by country and generates with the one picked", async () => {
        api.generateVoiceover.mockRejectedValue(new Error("stop here"));
        renderPanel(CAPABILITY);
        expect(screen.getByText("United Kingdom")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Preview Olivia" })).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByText("Olivia"));
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /generate/i }));
        });
        expect(api.generateVoiceover).toHaveBeenCalledWith(
            "tour",
            expect.objectContaining({ voiceId: "olivia" }),
        );
    });

    it("writes no captions on a cover step, which has none", async () => {
        api.generateVoiceover.mockResolvedValue({
            asset: { path: "assets/v.mp3", publicUrl: "/tour/assets/v.mp3", contentType: "audio/mpeg", size: 1 },
            sentences: ["Hi."],
        });
        const cover = {
            kind: "cover",
            id: "intro",
            widgets: [{ type: "headline", id: "h", title: "Hi" }],
            advance: { trigger: "click" },
            script: "Hi.",
        } as unknown as Step;
        const { onUpdateStep } = renderPanel(CAPABILITY, cover);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /generate/i }));
        });
        expect(onUpdateStep).toHaveBeenLastCalledWith("intro", {
            voiceover: { src: "assets/v.mp3", duration: 4000 },
        });
    });

    it("shows the host's error under the card", async () => {
        api.generateVoiceover.mockRejectedValue(new Error("Out of voice credits."));
        const { onUpdateStep } = renderPanel(CAPABILITY);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /generate/i }));
        });
        expect(screen.getByText("Out of voice credits.")).toBeTruthy();
        expect(onUpdateStep).not.toHaveBeenCalledWith("s1", expect.objectContaining({ voiceover: expect.anything() }));
    });

    it("refuses a script longer than the host's limit", async () => {
        renderPanel({ ...CAPABILITY!, maxChars: 10 });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /generate/i }));
        });
        expect(api.generateVoiceover).not.toHaveBeenCalled();
        expect(screen.getByText(/the limit for generating is 10/)).toBeTruthy();
    });
});

describe("splitSentencesClient", () => {
    it("splits on sentence punctuation and line breaks", () => {
        expect(splitSentencesClient("One. Two!\nThree")).toEqual(["One.", "Two!", "Three"]);
    });
});
