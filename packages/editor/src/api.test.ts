import { afterEach, describe, expect, it, vi } from "vitest";

import { generateVoiceover, getHostCapabilities, resolveHostHref } from "./api";

function stubFetch(impl: (...args: unknown[]) => Promise<Response>) {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        ...init,
    });
}

const VOICE = {
    id: "ashley",
    name: "Ashley",
    descriptor: "Warm female",
    country: "United States",
    previewUrl: "/voices/ashley.mp3",
    isDefault: true,
};

describe("getHostCapabilities", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("asks the host at /__demo/editor/capabilities without caching", async () => {
        const fetchMock = stubFetch(async () => jsonResponse({}));
        expect(await getHostCapabilities()).toEqual({});
        expect(fetchMock).toHaveBeenCalledWith("/__demo/editor/capabilities", {
            cache: "no-store",
        });
    });

    it("returns the voiceover offer when it lists voices", async () => {
        stubFetch(async () =>
            jsonResponse({ voiceover: { voices: [VOICE], maxChars: 800 } }),
        );
        expect(await getHostCapabilities()).toEqual({
            voiceover: { voices: [VOICE], maxChars: 800 },
        });
    });

    it("treats an older CLI's SPA fallback (200 text/html) as no capabilities", async () => {
        stubFetch(
            async () =>
                new Response("<!doctype html><div id=\"root\"></div>", {
                    status: 200,
                    headers: { "content-type": "text/html; charset=utf-8" },
                }),
        );
        expect(await getHostCapabilities()).toEqual({});
    });

    it("treats a 404 as no capabilities", async () => {
        stubFetch(async () => jsonResponse({ error: "not found" }, { status: 404 }));
        expect(await getHostCapabilities()).toEqual({});
    });

    it("treats a rejected fetch or unparseable JSON as no capabilities", async () => {
        stubFetch(async () => {
            throw new TypeError("Failed to fetch");
        });
        expect(await getHostCapabilities()).toEqual({});
        stubFetch(
            async () =>
                new Response("{not json", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        );
        expect(await getHostCapabilities()).toEqual({});
    });

    it("drops a voiceover offer without voices and malformed voices", async () => {
        stubFetch(async () => jsonResponse({ voiceover: { voices: [], maxChars: 800 } }));
        expect(await getHostCapabilities()).toEqual({});
        stubFetch(async () => jsonResponse({ voiceover: { voices: "ashley" } }));
        expect(await getHostCapabilities()).toEqual({});
        stubFetch(async () =>
            jsonResponse({ voiceover: { voices: [null, { name: "no id" }, VOICE], maxChars: 800 } }),
        );
        expect(await getHostCapabilities()).toEqual({
            voiceover: { voices: [VOICE], maxChars: 800 },
        });
    });
});

describe("host links", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps back and demo links that are host paths or http(s) URLs", async () => {
        stubFetch(async () =>
            jsonResponse({
                links: {
                    back: { href: "/demos/{slug}", label: "Back to demo" },
                    demo: { href: "https://app.example/demos/{slug}" },
                },
            }),
        );
        expect(await getHostCapabilities()).toEqual({
            links: {
                back: { href: "/demos/{slug}", label: "Back to demo" },
                demo: { href: "https://app.example/demos/{slug}" },
            },
        });
    });

    it("drops protocol-relative, javascript: and malformed links", async () => {
        stubFetch(async () =>
            jsonResponse({
                links: { back: { href: "//evil.example/" }, demo: { href: "javascript:alert(1)" } },
            }),
        );
        expect(await getHostCapabilities()).toEqual({});
        stubFetch(async () => jsonResponse({ links: { back: "/" } }));
        expect(await getHostCapabilities()).toEqual({});
    });

    it("fills {slug} with the encoded slug", () => {
        expect(resolveHostHref({ href: "/demos/{slug}" }, "a b/c")).toBe("/demos/a%20b/c");
        expect(resolveHostHref({ href: "/" }, "x")).toBe("/");
    });
});

describe("generateVoiceover", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs the step, text and voice to the demo's voiceover route", async () => {
        const asset = {
            path: "assets/voiceover-s1.mp3",
            publicUrl: "/tour/assets/voiceover-s1.mp3",
            contentType: "audio/mpeg",
            size: 10,
            kind: "audio",
        };
        const fetchMock = stubFetch(async () =>
            jsonResponse({ asset, sentences: ["Hello."] }),
        );
        const result = await generateVoiceover("tour", {
            stepId: "s1",
            text: "Hello.",
            voiceId: "ashley",
        });
        expect(result).toEqual({ asset, sentences: ["Hello."] });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/__demo/editor/demos/tour/voiceover");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            stepId: "s1",
            text: "Hello.",
            voiceId: "ashley",
        });
    });

    it("surfaces the host's error message", async () => {
        stubFetch(async () =>
            jsonResponse({ error: "Out of voice credits." }, { status: 402 }),
        );
        await expect(
            generateVoiceover("tour", { stepId: "s1", text: "Hi.", voiceId: "a" }),
        ).rejects.toThrow("Out of voice credits.");
    });
});
