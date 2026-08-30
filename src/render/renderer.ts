import { assetId, parseBehaviors } from "../content/load";
import type { AssetMember, Content, ScoreSprite } from "../content/types";
import { directorInteger, distanceBetween, findPoint, rotationAngle, subtract } from "../director-compat/math";
import { roundedLevelScore } from "../core/scoring";
import type { GameState } from "../core/types";
import { ImageStore } from "./assets";

export class Renderer {
  private readonly trailLayer: HTMLCanvasElement;
  private readonly trailContext: CanvasRenderingContext2D;
  private trailLevel = -1;
  private renderedTrailSegments = 0;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    private readonly content: Content,
    private readonly images: ImageStore,
  ) {
    context.imageSmoothingEnabled = true;
    this.trailLayer = document.createElement("canvas");
    this.trailLayer.width = 500;
    this.trailLayer.height = 400;
    const trailContext = this.trailLayer.getContext("2d");
    if (!trailContext) throw new Error("Canvas 2D no está disponible para la estela.");
    this.trailContext = trailContext;
  }

  render(state: GameState): void {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 500, 400);
    if (state.screen === "level") this.renderLevel(state);
    else this.renderScreen(state);
    ctx.restore();
  }

  private renderScreen(state: GameState) {
    const screenName = state.screen === "high-score-sending" ? "high-score-sending" : state.screen;
    const image = this.images.get(this.content.screens[screenName]);
    if (image) this.context.drawImage(image, 0, 0, 500, 400);
    const menuFrame = this.content.frames.get(state.menuFrame);
    for (const orbiter of state.menuOrbiters) {
      const authored = menuFrame?.sprites.find((sprite) => sprite.channel === orbiter.channel);
      if (authored) this.drawSprite(authored, { memberNum: orbiter.memberNum, locH: orbiter.point.x, locV: orbiter.point.y });
    }
    if (state.screen === "end-stats" && (state.score !== 0 || state.highScore !== 0)) {
      this.context.fillStyle = "#000";
      this.context.fillRect(130, 54, 45, 24);
      this.context.fillRect(402, 54, 45, 24);
      this.context.fillStyle = "#ffffcc";
      this.context.font = "bold 20px Arial, sans-serif";
      this.context.textBaseline = "top";
      this.context.fillText(String(Math.trunc(state.score)), 137, 57);
      this.context.fillText(String(Math.trunc(state.highScore)), 408, 57);
    }
    if (state.screen === "high-score-form") {
      this.context.fillStyle = "#ffffcc";
      this.context.fillRect(100, 145, 290, 90);
      this.context.fillStyle = "#ff6600";
      this.context.font = "bold 18px Arial, sans-serif";
      this.context.textAlign = "right";
      this.context.textBaseline = "middle";
      this.context.fillText("Nickname:", 198, 174);
      this.context.fillStyle = "#ffffcc";
      this.context.fillRect(135, 238, 245, 34);
      this.context.fillStyle = "#ff6600";
      this.context.font = "bold 24px Arial, sans-serif";
      this.context.textAlign = "left";
      this.context.textBaseline = "top";
      this.context.fillText(`Total Score ${Math.trunc(state.score)}`, 149, 243);
    }
    if (state.alert === "message" && state.message) this.drawMessageAlert(state.message);
  }

  private renderLevel(state: GameState) {
    const frame = this.content.frames.get(state.levelFrame);
    const gps = state.gps;
    if (!frame || !gps) return;
    const dynamicChannels = new Set([
      gps.targetChannel, gps.channel - 6, gps.channel - 5, gps.channel - 4, gps.channel - 3,
      gps.channel - 2, gps.channel - 1, gps.channel, gps.channel + 1, gps.channel + 2, 39,
      ...state.planets.map((planet) => planet.channel), ...state.bonuses.map((bonus) => bonus.channel),
    ]);

    this.drawTrail(state);

    for (const sprite of [...frame.sprites].sort((left, right) => left.channel - right.channel)) {
      if (!sprite.visible || parseBehaviors(sprite.scriptList).has(17) || (sprite.castLibNum === 1 && sprite.memberNum === 14)) continue;
      if (sprite.memberType === "text" || sprite.memberType === "field" || sprite.memberType === "button") {
        this.drawTextSprite(sprite, state);
        continue;
      }
      if (dynamicChannels.has(sprite.channel)) {
        this.drawDynamicSprite(sprite, state);
        continue;
      }
      this.drawSprite(sprite);
    }
    if (state.alert === "reallyquit") this.drawQuitAlert();
    else if (state.alert === "scoring") this.drawScoring(state);
    else if (state.alert === "message" && state.message) this.drawMessageAlert(state.message);
  }

  private drawDynamicSprite(authored: ScoreSprite, state: GameState) {
    const gps = state.gps!;
    const planet = state.planets.find((candidate) => candidate.channel === authored.channel);
    if (planet) {
      this.drawSprite(authored, { memberNum: planet.memberNum, locH: planet.point.x, locV: planet.point.y, rotation: planet.rotation });
      return;
    }
    const bonus = state.bonuses.find((candidate) => candidate.channel === authored.channel);
    if (bonus) {
      this.drawSprite(authored, { memberNum: bonus.memberNum, locH: bonus.point.x, locV: bonus.point.y, rotation: bonus.rotation });
      return;
    }
    if (authored.channel === gps.targetChannel) {
      this.drawSprite(authored, {
        memberNum: gps.targetOpen ? 2 : authored.memberNum,
        locH: gps.targetPoint.x,
        locV: gps.targetPoint.y,
      });
      return;
    }
    const slingVisible = gps.state === "iddle" || gps.state === "pullback" || gps.state === "snapping";
    if (authored.channel === gps.channel) {
      if (!gps.targetOpen && gps.state !== "scoring" && gps.state !== "next_level") {
        this.drawSprite(authored, { memberNum: gps.kevinMember, locH: gps.point.x, locV: gps.point.y, rotation: 0 });
      }
      return;
    }
    if ([gps.channel - 2, gps.channel + 2].includes(authored.channel)) {
      if (slingVisible) this.drawSprite(authored, { locH: gps.hoop.x, locV: gps.hoop.y, rotation: gps.hoopAngle });
      return;
    }
    if ([gps.channel - 1, gps.channel + 1].includes(authored.channel)) {
      if (slingVisible) {
        const top = authored.channel === gps.channel - 1;
        const radius = (this.levelSprite(state, gps.channel + 2)?.height ?? 46) / 2 - 3;
        const kevinDistance = distanceBetween(gps.point, gps.hoop);
        const point = findPoint(gps.hoop, gps.hoopAngle + (top ? -90 : 90), radius);
        const width = Math.sqrt(radius * radius + kevinDistance * kevinDistance);
        const difference = kevinDistance !== 0 ? Math.atan(radius / kevinDistance) * 57.29577951308232 : 90;
        this.drawSprite(authored, { locH: point.x, locV: point.y, width, rotation: gps.hoopAngle + (top ? difference : -difference) });
      }
      return;
    }
    if (authored.channel === gps.channel - 3) {
      if (gps.state === "soaring" && (gps.point.x < 0 || gps.point.x > 500 || gps.point.y < 0 || gps.point.y > 400)) {
        const point = { x: Math.max(0, Math.min(500, gps.point.x)), y: Math.max(0, Math.min(400, gps.point.y)) };
        this.drawSprite(authored, {
          locH: point.x, locV: point.y,
          rotation: rotationAngle(subtract(gps.point, point)),
          width: 20 + distanceBetween(gps.point, point) / 2,
        });
      }
      return;
    }
  }

  private drawSprite(sprite: ScoreSprite, override: Partial<ScoreSprite> = {}) {
    const value = { ...sprite, ...override };
    const asset = this.content.assets.get(assetId(value.castLibNum, value.memberNum));
    const image = this.images.get(asset?.image);
    if (!asset || !image || value.locH < -1000 || value.locH > 1500 || value.locV < -1000 || value.locV > 1500) return;
    const naturalWidth = image.naturalWidth || value.width || 1;
    const naturalHeight = image.naturalHeight || value.height || 1;
    const scaleX = value.width / naturalWidth;
    const scaleY = value.height / naturalHeight;
    this.context.save();
    this.context.globalAlpha *= value.blend / 100;
    this.context.translate(value.locH, value.locV);
    this.context.rotate(value.rotation * Math.PI / 180);
    this.context.drawImage(
      image,
      -asset.registrationPoint.x * scaleX,
      -asset.registrationPoint.y * scaleY,
      value.width,
      value.height,
    );
    this.context.restore();
  }

  private drawTextSprite(sprite: ScoreSprite, state: GameState) {
    if (sprite.locH > 900 || sprite.locV > 900 || sprite.channel === 39) return;
    const dynamic = dynamicText(sprite.memberName, state);
    const asset = this.content.assets.get(assetId(sprite.castLibNum, sprite.memberNum));
    const plain = dynamic ?? asset?.text?.plain ?? htmlToText(asset?.text?.html ?? "");
    if (!plain) return;
    const hud = ["fld_level", "fld_score", "fld_tries", "fld_distance", "fld_quit"].includes(sprite.memberName);
    this.context.save();
    this.context.textBaseline = "top";
    this.context.textAlign = "left";
    this.context.fillStyle = hud ? "#00ff00" : textColor(asset);
    this.context.font = hud ? "10px 'Courier New', monospace" : textFont(asset);
    const lineHeight = hud ? 11 : 13;
    if (sprite.memberName === "txt_dist_bon") {
      this.context.font = "bold 14px Arial, sans-serif";
      this.context.fillText("Distance Bonus", sprite.rectLeft, sprite.rectTop);
      this.context.font = "12px Arial, sans-serif";
      drawWrappedText(this.context, "adds to your distance which boosts your score!", sprite.rectLeft, sprite.rectTop + 16, sprite.rectRight - sprite.rectLeft, 13, sprite.rectBottom);
    } else {
      drawWrappedText(this.context, plain, sprite.rectLeft, sprite.rectTop, sprite.rectRight - sprite.rectLeft, lineHeight, sprite.rectBottom);
    }
    this.context.restore();
  }

  private drawQuitAlert() {
    const ctx = this.context;
    ctx.save();
    ctx.fillStyle = "#ff9933";
    roundedRect(ctx, 120, 100, 260, 170, 22);
    ctx.fill();
    ctx.fillStyle = "#000";
    roundedRect(ctx, 132, 112, 236, 102, 16);
    ctx.fill();
    ctx.fillStyle = "#ffffcc";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Really Quit?", 250, 150);
    ctx.fillStyle = "#ffffcc";
    roundedRect(ctx, 176, 220, 68, 34, 8); ctx.fill();
    roundedRect(ctx, 256, 220, 68, 34, 8); ctx.fill();
    ctx.fillStyle = "#ff6600";
    ctx.font = "bold 16px Arial";
    ctx.fillText("Yes", 210, 228);
    ctx.fillText("No", 290, 228);
    ctx.restore();
  }

  private drawMessageAlert(message: string) {
    const ctx = this.context;
    ctx.save();
    ctx.fillStyle = "#ff9933";
    roundedRect(ctx, 53, 85, 404, 212, 22); ctx.fill();
    ctx.fillStyle = "#ffffcc";
    roundedRect(ctx, 65, 92, 386, 198, 18); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    drawWrappedText(ctx, message, 82, 118, 352, 22, 205, "center");
    ctx.fillStyle = "#fff";
    ctx.fillRect(223, 236, 77, 30);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(223.5, 236.5, 76, 29);
    ctx.fillStyle = "#000";
    ctx.font = "16px Arial, sans-serif";
    ctx.fillText("OK", 261, 242);
    ctx.restore();
  }

  private drawScoring(state: GameState) {
    const gps = state.gps!;
    const values = scoringDisplayValues(state);
    const ctx = this.context;
    ctx.save();
    ctx.fillStyle = "#ff9933";
    roundedRect(ctx, 48, 72, 404, 226, 24); ctx.fill();
    ctx.fillStyle = "#ffffcc";
    roundedRect(ctx, 62, 88, 376, 150, 18); ctx.fill();
    ctx.fillStyle = "#ff6600";
    ctx.textAlign = "center";
    ctx.font = "bold 24px Arial";
    ctx.fillText(`Level ${state.level} of 25 Complete!`, 250, 104);
    ctx.fillStyle = "#000";
    ctx.font = "bold 16px 'Courier New'";
    ctx.fillText("Distance x Level / Tries = Score", 250, 153);
    ctx.font = "18px 'Courier New'";
    ctx.fillText(`${values.distance} x ${values.level} / ${values.tries} = ${formatDirectorNumber(values.equationScore)}`, 250, 184);
    ctx.fillStyle = "#ff6600";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`Total Score ${formatDirectorNumber(values.totalScore)}`, 250, 252);
    ctx.restore();
  }

  private drawTrail(state: GameState) {
    if (state.level !== this.trailLevel || state.trail.length < this.renderedTrailSegments) {
      this.trailContext.clearRect(0, 0, 500, 400);
      this.trailLevel = state.level;
      this.renderedTrailSegments = 0;
    }
    for (let index = this.renderedTrailSegments; index < state.trail.length; index += 1) {
      const segment = state.trail[index];
      this.trailContext.strokeStyle = segment.color;
      this.trailContext.lineWidth = 1;
      this.trailContext.beginPath();
      this.trailContext.moveTo(segment.from.x, segment.from.y);
      this.trailContext.lineTo(segment.to.x, segment.to.y);
      this.trailContext.stroke();
    }
    this.renderedTrailSegments = state.trail.length;
    this.context.drawImage(this.trailLayer, 0, 0);
  }

  private levelSprite(state: GameState, channel: number): ScoreSprite | undefined {
    return this.content.frames.get(state.levelFrame)?.sprites.find((sprite) => sprite.channel === channel);
  }
}

export function scoringDisplayValues(state: GameState) {
  const gps = state.gps!;
  const distanceTarget = directorInteger(gps.distance);
  const equationTarget = roundedLevelScore(gps.distance, state.level, gps.tries);
  const valueForPhase = (phase: number, target: number) => {
    if (gps.scorePhase < phase) return 0;
    return gps.scorePhase === phase ? gps.scoreCurrent : target;
  };
  return {
    distance: Math.trunc(valueForPhase(1, distanceTarget)),
    level: Math.trunc(valueForPhase(2, state.level)),
    tries: Math.trunc(valueForPhase(3, gps.tries)),
    equationScore: valueForPhase(4, equationTarget),
    totalScore: state.score + (gps.scorePhase === 4 ? gps.scoreCurrent : 0),
  };
}

function formatDirectorNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function dynamicText(name: string, state: GameState): string | null {
  if (name === "fld_level") return `Level: ${state.level}`;
  if (name === "fld_score") return `Score: ${Math.trunc(state.score)}`;
  if (name === "fld_tries") return `Tries: ${state.gps?.tries ?? 0}`;
  if (name === "fld_distance") return `Distance: ${directorInteger(state.gps?.distance ?? 0)}`;
  if (name === "fld_quit") return "Quit";
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#47;/g, "/")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function textColor(asset: AssetMember | undefined): string {
  const match = asset?.text?.html?.match(/color=["']?(#[0-9a-f]{6})/i);
  return match?.[1] ?? "#ffffcc";
}

function textFont(asset: AssetMember | undefined): string {
  const html = asset?.text?.html ?? "";
  const size = Number(html.match(/size=["']?(\d+)/i)?.[1] ?? 3);
  const pixels = ({ 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 } as Record<number, number>)[size] ?? 12;
  const bold = /<b>/i.test(html) ? "bold " : "";
  const family = /Courier New/i.test(html) ? "'Courier New', monospace" : "Arial, sans-serif";
  return `${bold}${pixels}px ${family}`;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  bottom: number,
  align: CanvasTextAlign = "left",
) {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words.shift()!;
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  lines.forEach((line, index) => {
    const top = y + index * lineHeight;
    if (top < bottom) {
      context.textAlign = align;
      context.fillText(line, align === "center" ? x + maxWidth / 2 : x, top);
    }
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
