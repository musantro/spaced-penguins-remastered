#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

class Reader {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.byte = start;
    this.bit = 0;
    this.end = end;
  }

  align() {
    if (this.bit !== 0) {
      this.byte += 1;
      this.bit = 0;
    }
  }

  ub(count) {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.byte >= this.end) throw new Error("Lectura fuera del SWF.");
      value = value * 2 + ((this.bytes[this.byte] >> (7 - this.bit)) & 1);
      this.bit += 1;
      if (this.bit === 8) {
        this.bit = 0;
        this.byte += 1;
      }
    }
    return value;
  }

  sb(count) {
    if (count === 0) return 0;
    const value = this.ub(count);
    return value & (2 ** (count - 1)) ? value - 2 ** count : value;
  }

  u8() {
    this.align();
    return this.bytes[this.byte++];
  }

  u16() {
    this.align();
    const value = this.bytes.readUInt16LE(this.byte);
    this.byte += 2;
    return value;
  }

  s16() {
    this.align();
    const value = this.bytes.readInt16LE(this.byte);
    this.byte += 2;
    return value;
  }

  u32() {
    this.align();
    const value = this.bytes.readUInt32LE(this.byte);
    this.byte += 4;
    return value;
  }
}

function parseSwf(bytes) {
  if (bytes.subarray(0, 3).toString("ascii") !== "FWS") throw new Error("Solo se admiten los SWF FWS sin comprimir exportados por Director.");
  const reader = new Reader(bytes, 8);
  const frame = readRect(reader);
  const frameRate = reader.u16() / 256;
  const frameCount = reader.u16();
  const shapes = [];
  const placements = [];
  let background = { r: 255, g: 255, b: 255, a: 1 };
  while (reader.byte < bytes.length) {
    const header = reader.u16();
    const code = header >> 6;
    let length = header & 0x3f;
    if (length === 0x3f) length = reader.u32();
    const end = reader.byte + length;
    const tag = new Reader(bytes, reader.byte, end);
    if ([2, 22, 32, 83].includes(code)) shapes.push(readDefineShape(tag, code));
    else if (code === 4) placements.push(readPlaceObject(tag));
    else if (code === 9) background = readColor(tag, false);
    reader.byte = end;
    reader.bit = 0;
    if (code === 0) break;
  }
  return { version: bytes[3], frame, frameRate, frameCount, background, shapes, placements };
}

function readRect(reader) {
  const bits = reader.ub(5);
  const rect = { xMin: reader.sb(bits), xMax: reader.sb(bits), yMin: reader.sb(bits), yMax: reader.sb(bits) };
  reader.align();
  return rect;
}

function readMatrix(reader) {
  const matrix = { scaleX: 1, scaleY: 1, rotate0: 0, rotate1: 0, translateX: 0, translateY: 0 };
  if (reader.ub(1)) {
    const bits = reader.ub(5);
    matrix.scaleX = reader.sb(bits) / 65536;
    matrix.scaleY = reader.sb(bits) / 65536;
  }
  if (reader.ub(1)) {
    const bits = reader.ub(5);
    matrix.rotate0 = reader.sb(bits) / 65536;
    matrix.rotate1 = reader.sb(bits) / 65536;
  }
  const bits = reader.ub(5);
  matrix.translateX = reader.sb(bits);
  matrix.translateY = reader.sb(bits);
  reader.align();
  return matrix;
}

function readDefineShape(reader, tagCode) {
  const version = ({ 2: 1, 22: 2, 32: 3, 83: 4 })[tagCode];
  const id = reader.u16();
  const bounds = readRect(reader);
  if (version === 4) {
    readRect(reader);
    reader.ub(8);
    reader.align();
  }
  const fills = readFillStyles(reader, version);
  const lines = readLineStyles(reader, version);
  let fillBits = reader.ub(4);
  let lineBits = reader.ub(4);
  const fillEdges = new Map();
  const lineEdges = new Map();
  let x = 0;
  let y = 0;
  let fill0 = 0;
  let fill1 = 0;
  let line = 0;
  while (true) {
    const type = reader.ub(1);
    if (type === 0) {
      const newStyles = reader.ub(1);
      const lineChanged = reader.ub(1);
      const fill1Changed = reader.ub(1);
      const fill0Changed = reader.ub(1);
      const moved = reader.ub(1);
      if (!(newStyles || lineChanged || fill1Changed || fill0Changed || moved)) break;
      if (moved) {
        const bits = reader.ub(5);
        x = reader.sb(bits);
        y = reader.sb(bits);
      }
      if (fill0Changed) fill0 = reader.ub(fillBits);
      if (fill1Changed) fill1 = reader.ub(fillBits);
      if (lineChanged) line = reader.ub(lineBits);
      if (newStyles) {
        reader.align();
        fills.push(...readFillStyles(reader, version));
        lines.push(...readLineStyles(reader, version));
        fillBits = reader.ub(4);
        lineBits = reader.ub(4);
      }
      continue;
    }
    const straight = reader.ub(1);
    const bits = reader.ub(4) + 2;
    const from = { x, y };
    let edge;
    if (straight) {
      const general = reader.ub(1);
      let dx = 0;
      let dy = 0;
      if (general) {
        dx = reader.sb(bits);
        dy = reader.sb(bits);
      } else if (reader.ub(1)) dy = reader.sb(bits);
      else dx = reader.sb(bits);
      x += dx;
      y += dy;
      edge = { from, to: { x, y } };
    } else {
      const controlDx = reader.sb(bits);
      const controlDy = reader.sb(bits);
      const anchorDx = reader.sb(bits);
      const anchorDy = reader.sb(bits);
      const control = { x: x + controlDx, y: y + controlDy };
      x = control.x + anchorDx;
      y = control.y + anchorDy;
      edge = { from, control, to: { x, y } };
    }
    if (fill0) appendEdge(fillEdges, fill0, edge);
    if (fill1) appendEdge(fillEdges, fill1, reverseEdge(edge));
    if (line) appendEdge(lineEdges, line, edge);
  }
  reader.align();
  return { id, bounds, fills, lines, fillEdges, lineEdges };
}

function readFillStyles(reader, version) {
  let count = reader.u8();
  if (count === 0xff && version >= 2) count = reader.u16();
  return Array.from({ length: count }, () => readFillStyle(reader, version));
}

function readFillStyle(reader, version) {
  const type = reader.u8();
  if (type === 0) return { type: "solid", color: readColor(reader, version >= 3) };
  if ([0x10, 0x12, 0x13].includes(type)) {
    const matrix = readMatrix(reader);
    const spread = version >= 4 ? reader.ub(2) : (reader.ub(2), 0);
    const interpolation = version >= 4 ? reader.ub(2) : (reader.ub(2), 0);
    const count = reader.ub(4);
    const stops = Array.from({ length: count }, () => ({ offset: reader.u8() / 255, color: readColor(reader, version >= 3) }));
    const focalPoint = type === 0x13 ? reader.s16() / 256 : 0;
    return { type: type === 0x10 ? "linear" : "radial", matrix, spread, interpolation, stops, focalPoint };
  }
  throw new Error(`FILLSTYLE SWF no compatible: 0x${type.toString(16)}.`);
}

function readLineStyles(reader, version) {
  let count = reader.u8();
  if (count === 0xff && version >= 2) count = reader.u16();
  return Array.from({ length: count }, () => {
    const width = reader.u16();
    if (version < 4) return { width, color: readColor(reader, version >= 3) };
    throw new Error("LINESTYLE2 no es necesario para los assets de Director 8.");
  });
}

function readColor(reader, alpha) {
  const color = { r: reader.u8(), g: reader.u8(), b: reader.u8(), a: 1 };
  if (alpha) color.a = reader.u8() / 255;
  return color;
}

function readPlaceObject(reader) {
  const characterId = reader.u16();
  const depth = reader.u16();
  const matrix = readMatrix(reader);
  return { characterId, depth, matrix };
}

function appendEdge(map, style, edge) {
  if (!map.has(style)) map.set(style, []);
  map.get(style).push(edge);
}

function reverseEdge(edge) {
  return edge.control ? { from: edge.to, control: edge.control, to: edge.from } : { from: edge.to, to: edge.from };
}

function renderSvg(movie) {
  const width = (movie.frame.xMax - movie.frame.xMin) / 20;
  const height = (movie.frame.yMax - movie.frame.yMin) / 20;
  const defs = [];
  const body = [];
  for (const shape of movie.shapes) {
    const placement = movie.placements.find((item) => item.characterId === shape.id)?.matrix ?? identityMatrix();
    const parts = [];
    for (const [styleIndex, edges] of shape.fillEdges) {
      const style = shape.fills[styleIndex - 1];
      if (!style) continue;
      const fill = renderFill(style, `shape-${shape.id}-fill-${styleIndex}`, defs);
      parts.push(`<path d="${edgesToPath(edges)}" fill="${fill}" fill-rule="evenodd"/>`);
    }
    for (const [styleIndex, edges] of shape.lineEdges) {
      const style = shape.lines[styleIndex - 1];
      if (!style) continue;
      parts.push(`<path d="${edgesToPath(edges, false)}" fill="none" stroke="${color(style.color)}" stroke-opacity="${format(style.color.a)}" stroke-width="${format(style.width / 20)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    body.push(`<g transform="${matrixTransform(placement)}">${parts.join("")}</g>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${format(movie.frame.xMin / 20)} ${format(movie.frame.yMin / 20)} ${format(width)} ${format(height)}" width="${format(width)}" height="${format(height)}">` +
    `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${body.join("")}</svg>\n`;
}

function renderFill(style, id, defs) {
  if (style.type === "solid") return color(style.color);
  const stops = style.stops.map((stop) => `<stop offset="${format(stop.offset * 100)}%" stop-color="${color(stop.color)}" stop-opacity="${format(stop.color.a)}"/>`).join("");
  const spreadMethod = ({ 1: "reflect", 2: "repeat" })[style.spread] ?? "pad";
  const transform = matrixTransform(style.matrix);
  if (style.type === "linear") {
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-819.2" y1="0" x2="819.2" y2="0" spreadMethod="${spreadMethod}" gradientTransform="${transform}">${stops}</linearGradient>`);
  } else {
    defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" spreadMethod="${spreadMethod}" gradientTransform="${transform}">${stops}</radialGradient>`);
  }
  return `url(#${id})`;
}

function edgesToPath(edges, close = true) {
  const remaining = [...edges];
  const paths = [];
  while (remaining.length) {
    const chain = [remaining.shift()];
    while (true) {
      const end = chain.at(-1).to;
      const nextIndex = remaining.findIndex((edge) => samePoint(edge.from, end));
      if (nextIndex < 0) break;
      chain.push(remaining.splice(nextIndex, 1)[0]);
      if (samePoint(chain.at(-1).to, chain[0].from)) break;
    }
    let value = `M${point(chain[0].from)}`;
    for (const edge of chain) value += edge.control ? `Q${point(edge.control)} ${point(edge.to)}` : `L${point(edge.to)}`;
    if (close && samePoint(chain.at(-1).to, chain[0].from)) value += "Z";
    paths.push(value);
  }
  return paths.join("");
}

function identityMatrix() {
  return { scaleX: 1, scaleY: 1, rotate0: 0, rotate1: 0, translateX: 0, translateY: 0 };
}

function matrixTransform(matrix) {
  return `matrix(${format(matrix.scaleX)} ${format(matrix.rotate1)} ${format(matrix.rotate0)} ${format(matrix.scaleY)} ${format(matrix.translateX / 20)} ${format(matrix.translateY / 20)})`;
}

function point(value) {
  return `${format(value.x / 20)} ${format(value.y / 20)}`;
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function color(value) {
  return `#${[value.r, value.g, value.b].map((component) => component.toString(16).padStart(2, "0")).join("")}`;
}

function format(value) {
  return Number(value.toFixed(6));
}

const inputPaths = process.argv.slice(2).map((value) => path.resolve(value));
if (inputPaths.length === 0) {
  process.stderr.write("Uso: node tools/web/convert-swf-vectors.mjs <archivo.swf> [...]\n");
  process.exit(1);
}

for (const inputPath of inputPaths) {
  const movie = parseSwf(fs.readFileSync(inputPath));
  const outputPath = inputPath.replace(/\.swf$/i, ".svg");
  fs.writeFileSync(outputPath, renderSvg(movie), "utf8");
  process.stdout.write(`${path.basename(inputPath)} -> ${path.basename(outputPath)} (${movie.shapes.length} shape)\n`);
}
