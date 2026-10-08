import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/speech/intent";
import { configureRecognition, PushToTalkController, type RecognitionLike } from "@/lib/speech/web-speech";
import { PRODUCT_LIMITS } from "@/lib/session-policy";

describe("speech", () => {
  it("understands short English and Tanglish replies", () => {
    expect(parseIntent("I'm ready")).toBe("ready");
    expect(parseIntent("ok let's go")).toBe("ready");
    expect(parseIntent("seri")).toBe("ready");
    expect(parseIntent("not now")).toBe("refusal");
    expect(parseIntent("vendam")).toBe("refusal");
    expect(parseIntent("no")).toBe("refusal");
    expect(parseIntent("I need help")).toBe("help");
    expect(parseIntent("help pannu")).toBe("help");
    expect(parseIntent("break please")).toBe("break");
    expect(parseIntent("I'm done")).toBe("done");
    expect(parseIntent("mudinchu")).toBe("done");
    expect(parseIntent("banana")).toBe("unknown");
    expect(parseIntent("  ")).toBe("unknown");
  });

  it("never leaves recognition running continuously", () => {
    const seen: RecognitionLike[] = [];
    const controller = new PushToTalkController(() => {
      const recognition: RecognitionLike = {
        continuous: true,
        interimResults: true,
        lang: "",
        start() {},
        stop() {},
      };
      seen.push(recognition);
      return recognition;
    });
    expect(controller.isListening).toBe(false);
    expect(controller.started).toBe(0);
    controller.press();
    expect(seen[0]?.continuous).toBe(false);
    expect(seen[0]?.interimResults).toBe(false);
    expect(controller.isListening).toBe(true);
    controller.release(true);
    expect(controller.isListening).toBe(true);
    controller.finishTap();
    expect(controller.isListening).toBe(false);
    expect(controller.stopped).toBe(1);
    const configured = configureRecognition({ continuous: true, interimResults: true, lang: "ta-IN", start() {}, stop() {} });
    expect(configured.continuous).toBe(false);
  });

  it("documents the product limits", () => {
    expect(PRODUCT_LIMITS.continuousMicrophone).toBe(false);
    expect(PRODUCT_LIMITS.freeChat).toBe(false);
    expect(PRODUCT_LIMITS.storesChildTranscripts).toBe(false);
    expect(PRODUCT_LIMITS.storesRawAudio).toBe(false);
    expect(PRODUCT_LIMITS.childCanStartSession).toBe(false);
    expect(PRODUCT_LIMITS.childCanRestartEndedSession).toBe(false);
    expect(PRODUCT_LIMITS.leaderboard).toBe(false);
    expect(PRODUCT_LIMITS.streakPressure).toBe(false);
  });
});
