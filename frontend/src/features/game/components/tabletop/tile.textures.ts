import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { TileConfig } from '../../types/game.types';
import { GAME_CONSTANTS } from '../../types/game.types';
import { BAND_DEPTH, TILE_DEPTH } from './board.layout';

// Printed faces for the board, drawn once on canvases. Colours follow the 2D
// board so the two renderers read as the same game.
export const SPACE_COLOURS: Record<string, string> = {
  GO: '#d8f3dc',
  JAIL: '#ffe5d9',
  GO_TO_JAIL: '#ffcad4',
  LUCKY_BREAK: '#fff3b0',
  TAX: '#f8f9fa',
  CHALLENGE_CARD: '#efd9ff',
  REST: '#caf0f8',
  PROPERTY: '#fbf8ef',
};

const INK = '#17201b';
const RED = '#e63946';
const FONT = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";
const PX_PER_UNIT = 256;

type FaceTile = Pick<TileConfig, 'index' | 'type' | 'name' | 'colorGroup' | 'skillTheme' | 'price'>;

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  return { element, context };
}

function finish(element: HTMLCanvasElement) {
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Bold condensed text, shrunk to fit and wrapped onto at most two lines. */
function fitText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number) {
  const words = text.toUpperCase().split(' ');
  let lines = [words.join(' ')];
  context.font = `800 ${size}px ${FONT}`;
  if (context.measureText(lines[0]).width > maxWidth && words.length > 1) {
    const middle = Math.ceil(words.length / 2);
    lines = [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
  }
  let fontSize = size;
  const widest = () => Math.max(...lines.map((line) => context.measureText(line).width));
  while (widest() > maxWidth && fontSize > 18) {
    fontSize -= 2;
    context.font = `800 ${fontSize}px ${FONT}`;
  }
  const lineHeight = fontSize * 1.02;
  const top = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => context.fillText(line, x, top + index * lineHeight));
}

const SKILL_SYMBOLS: Record<string, string> = { Addition: '+', Subtraction: '−', Multiplication: '×', Division: '÷' };

function drawMedallion(context: CanvasRenderingContext2D, x: number, y: number, radius: number, symbol: string, colour: string) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = colour;
  context.stroke();
  context.fillStyle = colour;
  context.font = `900 ${radius * 1.5}px ${FONT}`;
  context.fillText(symbol, x, y + radius * 0.06);
}

function drawQuestionCard(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  context.save();
  context.translate(x, y);
  context.rotate(-0.12);
  context.fillStyle = '#ffffff';
  context.strokeStyle = INK;
  context.lineWidth = 7 * scale;
  const w = 150 * scale;
  const h = 200 * scale;
  context.beginPath();
  context.roundRect(-w / 2, -h / 2, w, h, 18 * scale);
  context.fill();
  context.stroke();
  context.fillStyle = '#8b5cf6';
  context.font = `900 ${150 * scale}px ${FONT}`;
  context.fillText('?', 0, 6 * scale);
  context.restore();
}

function drawCoins(context: CanvasRenderingContext2D, x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    context.beginPath();
    context.ellipse(x, y - i * 26, 78, 30, 0, 0, Math.PI * 2);
    context.fillStyle = i === 2 ? '#ffd166' : '#f4b400';
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = INK;
    context.stroke();
  }
  context.fillStyle = INK;
  context.font = `900 34px ${FONT}`;
  context.fillText('RM', x, y - 52);
}

function drawClover(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = '#2e8b57';
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + Math.PI / 4;
    context.beginPath();
    context.arc(x + Math.cos(angle) * size * 0.42, y + Math.sin(angle) * size * 0.42, size * 0.42, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = '#1d6b41';
  context.lineWidth = size * 0.12;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x, y);
  context.quadraticCurveTo(x + size * 0.3, y + size * 0.9, x + size * 0.75, y + size * 1.05);
  context.stroke();
}

function drawBars(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = '#ff9f6e';
  context.strokeStyle = INK;
  context.lineWidth = 9;
  context.beginPath();
  context.roundRect(x - size / 2, y - size / 2, size, size, 16);
  context.fill();
  context.stroke();
  context.lineWidth = 12;
  for (let i = 1; i < 5; i++) {
    const bx = x - size / 2 + (size * i) / 5;
    context.beginPath();
    context.moveTo(bx, y - size / 2 + 6);
    context.lineTo(bx, y + size / 2 - 6);
    context.stroke();
  }
}

function drawWhistle(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#3d5a80';
  context.strokeStyle = INK;
  context.lineWidth = 8;
  context.beginPath();
  context.arc(x - 30, y + 10, 70, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.roundRect(x - 10, y - 60, 140, 60, 12);
  context.fill();
  context.stroke();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x - 30, y + 10, 26, 0, Math.PI * 2);
  context.fill();
}

function drawArrow(context: CanvasRenderingContext2D, x: number, y: number, length: number) {
  context.fillStyle = RED;
  context.strokeStyle = INK;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(x + length / 2, y - 22);
  context.lineTo(x - length / 2 + 80, y - 22);
  context.lineTo(x - length / 2 + 80, y - 62);
  context.lineTo(x - length / 2, y);
  context.lineTo(x - length / 2 + 80, y + 62);
  context.lineTo(x - length / 2 + 80, y + 22);
  context.lineTo(x + length / 2, y + 22);
  context.closePath();
  context.fill();
  context.stroke();
}

function taxAmount(tile: FaceTile): number {
  return tile.name === 'Cukai Mewah' ? GAME_CONSTANTS.LUXURY_TAX_AMOUNT : GAME_CONSTANTS.TAX_AMOUNT;
}

function drawSideFace(context: CanvasRenderingContext2D, tile: FaceTile, width: number, height: number, groupColour: string | null) {
  const bandBottom = (BAND_DEPTH / TILE_DEPTH) * height;
  context.fillStyle = SPACE_COLOURS[tile.type] ?? SPACE_COLOURS.PROPERTY;
  context.fillRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = INK;

  if (tile.type === 'PROPERTY') {
    fitText(context, tile.name, width / 2, bandBottom + 92, width - 56, 68);
    if (tile.skillTheme) drawMedallion(context, width / 2, height * 0.6, 58, SKILL_SYMBOLS[tile.skillTheme] ?? '+', groupColour ?? INK);
    context.font = `800 58px ${FONT}`;
    context.fillStyle = INK;
    context.fillText(`RM${tile.price}`, width / 2, height - 70);
    return;
  }

  fitText(context, tile.name, width / 2, 96, width - 56, 62);
  if (tile.type === 'CHALLENGE_CARD') drawQuestionCard(context, width / 2, height * 0.55, 1.15);
  if (tile.type === 'TAX') {
    drawCoins(context, width / 2, height * 0.58);
    context.fillStyle = INK;
    context.font = `800 54px ${FONT}`;
    context.fillText(`PAY RM${taxAmount(tile)}`, width / 2, height - 70);
  }
}

function drawCornerFace(context: CanvasRenderingContext2D, tile: FaceTile, size: number) {
  context.fillStyle = SPACE_COLOURS[tile.type] ?? SPACE_COLOURS.PROPERTY;
  context.fillRect(0, 0, size, size);
  context.save();
  // Corner art faces outwards along the board's diagonal, as on a printed board.
  context.translate(size / 2, size / 2);
  context.rotate(-Math.PI / 4);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = INK;

  if (tile.type === 'GO') {
    context.font = `900 170px ${FONT}`;
    context.fillStyle = RED;
    context.fillText('MULA', 0, -40);
    context.fillStyle = INK;
    context.font = `800 40px ${FONT}`;
    context.fillText(`COLLECT RM${GAME_CONSTANTS.GO_SALARY} AS YOU PASS`, 0, 70);
    drawArrow(context, 0, 175, 420);
  } else if (tile.type === 'JAIL') {
    drawBars(context, 0, -10, 250);
    context.font = `900 84px ${FONT}`;
    context.fillText('PENJARA', 0, -210);
    context.font = `800 40px ${FONT}`;
    context.fillText('JUST VISITING', 0, 190);
  } else if (tile.type === 'GO_TO_JAIL') {
    drawWhistle(context, -20, -5);
    context.font = `900 84px ${FONT}`;
    context.fillText('KE PENJARA', 0, -200);
    context.font = `800 40px ${FONT}`;
    context.fillText('GO DIRECTLY TO JAIL', 0, 190);
  } else {
    drawClover(context, -10, -40, 120);
    context.font = `900 88px ${FONT}`;
    context.fillText(tile.name.toUpperCase(), 0, -215);
    context.font = `800 40px ${FONT}`;
    context.fillText('A GIFT FROM THE BANK', 0, 200);
  }
  context.restore();
}

export function makeTileTexture(tile: FaceTile, corner: boolean, groupColour: string | null): CanvasTexture {
  const size = corner ? [TILE_DEPTH * PX_PER_UNIT, TILE_DEPTH * PX_PER_UNIT] : [2 * PX_PER_UNIT, TILE_DEPTH * PX_PER_UNIT];
  const { element, context } = canvas(size[0], size[1]);
  if (context) {
    if (corner) drawCornerFace(context, tile, size[0]);
    else drawSideFace(context, tile, size[0], size[1], groupColour);
  }
  return finish(element);
}

/** The open centre: pale green field, diagonal red banner and the strapline. */
export function makeCentreTexture(): CanvasTexture {
  const size = 2048;
  const { element, context } = canvas(size, size);
  if (context) {
    context.fillStyle = '#dcedc8';
    context.fillRect(0, 0, size, size);
    // A faint grid of maths symbols gives the field texture up close.
    context.fillStyle = 'rgba(46, 107, 64, 0.08)';
    context.font = `900 88px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const symbols = ['+', '−', '×', '÷'];
    for (let row = 0; row < 12; row++) {
      for (let column = 0; column < 12; column++) {
        context.fillText(symbols[(row + column) % 4], column * 176 + (row % 2) * 88 + 44, row * 176 + 88);
      }
    }
    context.save();
    context.translate(size / 2, size / 2);
    context.rotate(-Math.PI / 4);
    context.fillStyle = RED;
    context.strokeStyle = INK;
    context.lineWidth = 18;
    context.beginPath();
    context.roundRect(-760, -170, 1520, 340, 28);
    context.fill();
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = `900 250px ${FONT}`;
    context.fillText('MATHOPOLY', 0, 12);
    context.fillStyle = INK;
    context.font = `800 84px ${FONT}`;
    context.fillText('ROLL  •  SOLVE  •  OWN', 0, 290);
    context.restore();
  }
  return finish(element);
}

/** Soft cloth for the table, tiled. */
export function makeFeltTexture(): CanvasTexture {
  const size = 256;
  const { element, context } = canvas(size, size);
  if (context) {
    context.fillStyle = '#1c4a37';
    context.fillRect(0, 0, size, size);
    const image = context.getImageData(0, 0, size, size);
    let seed = 7;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const grain = ((seed % 1000) / 1000 - 0.5) * 18;
      image.data[i] += grain;
      image.data[i + 1] += grain;
      image.data[i + 2] += grain;
    }
    context.putImageData(image, 0, 0);
  }
  const texture = finish(element);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(24, 24);
  return texture;
}

/** The face of the Challenge Card deck in the centre. */
export function makeCardBackTexture(): CanvasTexture {
  const { element, context } = canvas(384, 512);
  if (context) {
    context.fillStyle = '#8b5cf6';
    context.fillRect(0, 0, 384, 512);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 14;
    context.strokeRect(22, 22, 340, 468);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.font = `900 260px ${FONT}`;
    context.fillText('?', 192, 230);
    context.font = `800 46px ${FONT}`;
    context.fillText('CHALLENGE', 192, 420);
  }
  return finish(element);
}
