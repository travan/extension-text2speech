import { test, expect, scan } from "./fixture";
import type { Page } from "@playwright/test";

// Observe native events and forward every call to the actual browser engine.
// No synthetic voices, utterances or speech callbacks are used in this suite.
async function observeSpeech(page: Page) {
  await page.evaluate(() => {
    const records: any[] = [];
    (window as any).__nativeSpeechRecords = records;
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance) => {
      const record = { text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name, events: [] as any[] };
      records.push(record);
      for (const name of ["start", "end", "pause", "resume", "error"]) {
        utterance.addEventListener(name, (event) => record.events.push({
          type: event.type, error: (event as SpeechSynthesisErrorEvent).error,
          elapsedTime: (event as SpeechSynthesisEvent).elapsedTime,
        }));
      }
      speak(utterance);
    };
  });
}

test.afterEach(async ({ app }, testInfo) => {
  const evidence = await app.reader.evaluate(() => ({
    voices: speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, localService: v.localService })),
    records: (window as any).__nativeSpeechRecords ?? [],
    speaking: speechSynthesis.speaking, pending: speechSynthesis.pending,
    status: document.querySelector("footer p")?.textContent,
  }));
  await testInfo.attach("native-speech-events", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
});

async function selectNativeVoice(page: Page, language: string) {
  await expect.poll(() => page.evaluate((lang) => speechSynthesis.getVoices().filter((v) => v.localService && v.lang.startsWith(lang)).length, language), {
    timeout: 10000, message: `A real local ${language} voice must be installed`,
  }).toBeGreaterThan(0);
  const voice = await page.evaluate((lang) => speechSynthesis.getVoices().find((v) => v.localService && v.lang.startsWith(lang))!.name, language);
  await page.locator(".voice-select").selectOption(voice);
  return voice;
}

test("native English voice completes two queued articles", async ({ app }) => {
  await app.source.evaluate(() => {
    document.body.innerHTML = '<article>AI researchers build useful tools for processing natural language.</article><article>AI helps scientists study the weather and understand changes in the world.</article>';
  });
  await scan(app.reader);
  await selectNativeVoice(app.reader, "en-US");
  await observeSpeech(app.reader);
  await app.reader.getByRole("button", { name: "▶ All" }).click();
  await expect(app.reader.locator("footer p")).toHaveText("Read completed.", { timeout: 45000 });
  const records = await app.reader.evaluate(() => (window as any).__nativeSpeechRecords);
  expect(records).toHaveLength(2);
  for (const record of records) {
    expect(record.events.map((event: any) => event.type)).toEqual(["start", "end"]);
    expect(record.lang).toBe("en-US");
  }
  await expect(app.reader.locator(".is-reading")).toHaveCount(0);
});

test("native voice pauses resumes and stops without advancing the queue", async ({ app }) => {
  await app.source.evaluate(() => {
    document.body.innerHTML = "<article></article><article>AI SECOND_ITEM must not start after the stop button is pressed.</article>";
    document.querySelector("article")!.textContent = "AI researchers build useful tools for processing natural language. ".repeat(12);
  });
  await scan(app.reader);
  await selectNativeVoice(app.reader, "en-US");
  await observeSpeech(app.reader);
  await app.reader.getByRole("button", { name: "▶ All" }).click();
  await expect.poll(() => app.reader.evaluate(() => (window as any).__nativeSpeechRecords[0]?.events.some((e: any) => e.type === "start"))).toBe(true);
  await app.reader.getByRole("button", { name: "⏸", exact: true }).click();
  await expect.poll(() => app.reader.evaluate(() => speechSynthesis.paused)).toBe(true);
  await expect(app.reader.locator("footer p")).toHaveText("Paused.");
  await app.reader.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(() => app.reader.evaluate(() => speechSynthesis.paused)).toBe(false);
  await expect(app.reader.locator("footer p")).toHaveText("Resumed.");
  await app.reader.getByRole("button", { name: "⏹", exact: true }).click();
  await expect.poll(() => app.reader.evaluate(() => speechSynthesis.speaking || speechSynthesis.pending)).toBe(false);
  // Allow native cancellation callbacks to arrive before asserting no next item.
  await app.reader.waitForTimeout(1000);
  await expect(app.reader.locator("footer p")).toHaveText("Stopped speaking.");
  expect(await app.reader.evaluate(() => (window as any).__nativeSpeechRecords.length)).toBe(1);
  await expect(app.reader.locator(".is-reading")).toHaveCount(0);
});

test("native Vietnamese voice completes a Vietnamese article", async ({ app }) => {
  await app.source.evaluate(() => {
    document.body.innerHTML = "<article>AI hỗ trợ con người học tập và làm việc. Xin chào, đây là bài kiểm tra giọng đọc tiếng Việt.</article>";
  });
  await scan(app.reader);
  await selectNativeVoice(app.reader, "vi");
  await observeSpeech(app.reader);
  await app.reader.getByRole("button", { name: "▶ Read", exact: true }).click();
  await expect(app.reader.locator("footer p")).toHaveText("Read completed.", { timeout: 45000 });
  const records = await app.reader.evaluate(() => (window as any).__nativeSpeechRecords);
  expect(records).toHaveLength(1);
  expect(records[0].lang).toMatch(/^vi/);
  expect(records[0].events.map((event: any) => event.type)).toEqual(["start", "end"]);
});
