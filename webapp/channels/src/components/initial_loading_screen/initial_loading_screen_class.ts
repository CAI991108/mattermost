// @ts-nocheck
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isDesktopApp} from '@mattermost/shared/utils/user_agent';

import {Measure, measureAndReport} from 'utils/performance_telemetry';

const ANIMATION_CLASS_FOR_MATTERMOST_LOGO_HIDE = 'LoadingAnimation__compass-shrink';
const ANIMATION_CLASS_FOR_COMPLETE_LOADER_HIDE = 'LoadingAnimation__shrink';

const DESTROY_DELAY_AFTER_ANIMATION_END = 1000;
const MINIMUM_LOADING_TIME = 2200;

const LOADING_CLASS_FOR_SCREEN = 'LoadingScreen';
const LOADING_COMPLETE_CLASS_FOR_SCREEN = 'LoadingScreen LoadingScreen--loaded';
const STATIC_CLASS_FOR_ANIMATION = 'LoadingAnimation';
const LOADING_CLASS_FOR_ANIMATION = 'LoadingAnimation LoadingAnimation--spinning LoadingAnimation--loading';
const LOADING_COMPLETE_CLASS_FOR_ANIMATION = 'LoadingAnimation LoadingAnimation--spinning LoadingAnimation--loaded';
const LOADING_MODES = ['particles', 'star', 'ascii', 'flip', 'growth', 'ray', 'binary', 'signal', 'aurora-field', 'star-ignite'];

function createShowcaseLogoLoading(canvas: HTMLCanvasElement, selectedMode: string): () => void {
const ctx = canvas.getContext('2d');
if (!ctx) {
    return () => undefined;
}
const buttons: any[] = [];
const replayButton = {addEventListener: () => undefined};

const LOGO_CANVAS_WIDTH = 260;
const LOGO_CANVAS_HEIGHT = 210;
const BLUE = '82, 95, 255';
const ORANGE = '255, 90, 31';
const RED = '255, 36, 66';
const ASCII_CHARS = ' .:-=+*#%@';
const GLITCH_CHARS = '01{}[]<>/\\\\|+=-*#%@!?AI';
const STAR_TERMS = ['TOKEN', 'MODEL', 'AGENT', 'PROMPT', 'VECTOR', 'NEURAL', 'VISION', 'RAG', 'LLM', 'SAI'];
const FLOW_SYMBOLS = ['>>', '<<', '01', '10', '[]', '{}', '//', '\\\\', '==', '**', '%%', '::', '--', '++', '!!', '0:25', '47:20'];
const FLOW_TRAIL_SYMBOLS = ['0', '1', '>', '<', '/', '\\\\', '%', '*', ':', '[', ']', '{', '}'];
const FLOW_RAILS = ['%%%%%%%%%%%%', '//////////', '************', '>>>>>>>>>>>>', '010101010101', '[][][][][][]', '{}{}{}{}{}', '::::::::::::'];
const FLIP_SYMBOLS = ['01', '10', '[]', '{}', '//', '%%', '::', '<>', '>>', '**'];
const BINARY_GLITCH_SYMBOLS = ['#', '%', '&', '@', '?', '/', '\\\\', '{', '}', '[', ']', '<', '>', '+', '*', '='];
const ORBIT_TERMS = ['TOKEN', 'MODEL', 'AGENT', 'PROMPT', 'VECTOR', 'REASONING', 'RAG', 'VISION', 'EMBEDDING', 'TRAINING', 'INFERENCE', 'TRANSFORMER', 'MULTIMODAL', 'ALIGNMENT', 'CUDA', 'DATASET'];
const NEW_LOGO_MODES = ['signal', 'aurora-field', 'star-ignite'];
const AI_WORDS = [
    'SAI', 'AI', 'MACHINE LEARNING', 'DEEP LEARNING', 'LLM', 'AGENT', 'TOKEN', 'PROMPT',
    'VISION', 'ROBOTICS', 'GRAPH', 'NEURAL NET', 'TRANSFORMER', 'EMBEDDING', 'DATASET',
    'INFERENCE', 'TRAINING', 'ALIGNMENT', 'MULTIMODAL', 'REASONING', 'COMPUTE', 'CUDA',
    'MODEL', 'DIFFUSION', 'RAG', 'VECTOR DB', 'KNOWLEDGE GRAPH', 'AUTO ML', 'AIOS',
    '智能体', '大模型', '多模态', '机器学习', '深度学习', '神经网络', '知识图谱', '推理',
    '训练', '数据集', '向量检索', '具身智能', '生成式AI', '智能感知', '模型对齐', '算法',
    '科学智能', '人机交互', '认知计算', '自动驾驶', '视觉理解', '自然语言', '世界模型',
];

const WORD_FIELD_TERMS = [
    'SAI', 'AI', 'AGENT', 'TOKEN', 'PROMPT', 'LLM', 'RAG', 'CUDA', 'MODEL', 'DATASET',
    'TRANSFORMER', 'EMBEDDING', 'VECTOR DB', 'NEURAL NET', 'MULTIMODAL', 'REASONING',
    'INFERENCE', 'TRAINING', 'ALIGNMENT', 'DIFFUSION', 'ROBOTICS', 'VISION', 'GRAPH',
    'MACHINE LEARNING', 'DEEP LEARNING', 'KNOWLEDGE GRAPH', 'AUTO ML', 'AIOS',
    '智能体', '大模型', '多模态', '机器学习', '深度学习', '神经网络', '知识图谱', '推理',
    '训练', '数据集', '向量检索', '具身智能', '生成式AI', '智能感知', '模型对齐', '算法',
    '科学智能', '人机交互', '认知计算', '视觉理解', '自然语言', '世界模型',
];

const WORD_FIELD_TERMS_CLEAN = [
    'SAI', 'AI', 'AGENT', 'TOKEN', 'PROMPT', 'LLM', 'RAG', 'CUDA', 'MODEL', 'DATASET',
    'TRANSFORMER', 'EMBEDDING', 'VECTOR DB', 'NEURAL NET', 'MULTIMODAL', 'REASONING',
    'INFERENCE', 'TRAINING', 'ALIGNMENT', 'DIFFUSION', 'ROBOTICS', 'VISION', 'GRAPH',
    'MACHINE LEARNING', 'DEEP LEARNING', 'KNOWLEDGE GRAPH', 'AUTO ML', 'AIOS',
    'GENERATIVE AI', 'WORLD MODEL', 'COGNITIVE COMPUTING', 'AI SAFETY', 'DATA ENGINE',
    'FOUNDATION MODEL', 'SPARSE ATTENTION', 'CHAIN OF THOUGHT', 'SYNTHETIC DATA',
    'COMPUTER VISION', 'NATURAL LANGUAGE', 'SCIENCE AI', 'HUMAN AI INTERFACE',
];

const initialMode = selectedMode;
let mode = ['particles', 'star', 'ascii', 'flip', 'growth', 'ray', 'binary', ...NEW_LOGO_MODES].includes(initialMode) ? initialMode : 'particles';
let animationStart = performance.now();
let animationFrame = 0;
let width = 0;
let height = 0;
let particleTargets = [];
let particles = [];
let starCells = [];
let flowBlocks = [];
let flipTiles = [];
let rayTargets = [];
let binaryCells = [];
let logoBands = [];
let logoCells = [];
let auroraShapes = [];
let starIgniteNodes = [];
let starIgniteLinks = [];
let orbitLogoCanvas = null;
let schoolLogoCanvas = null;
let logoMaskCanvas = null;
let wordRows = [];
let edgeGlyphs = [];

const resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
    resetAnimation();
});

resizeObserver.observe(canvas);


function setMode(nextMode) {
    mode = nextMode;
    buttons.forEach((item) => item.classList.toggle('is-active', item.dataset.mode === mode));
    resetAnimation();
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function resetAnimation() {
    animationStart = performance.now();
    particleTargets = createLogoTargets(3);
    particles = createParticles(particleTargets);
    starCells = createStarCells(4);
    flipTiles = createFlipTiles(8);
    rayTargets = createRayTargets(5);
    binaryCells = createBinaryCells(7);
    logoBands = createLogoBands(5);
    logoCells = createLogoTargets(5);
    auroraShapes = createAuroraShapes(132);
    starIgniteNodes = createStarIgniteNodes(8);
    starIgniteLinks = createStarIgniteLinks(starIgniteNodes);
    wordRows = createWordRows();
}

function drawSchoolAiLogo(context) {
    context.clearRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);
    context.lineCap = 'butt';
    context.lineJoin = 'miter';

    context.fillStyle = `rgb(${BLUE})`;
    context.beginPath();
    context.moveTo(18, 160);
    context.lineTo(79, 160);
    context.lineTo(106, 75);
    context.lineTo(91, 75);
    context.closePath();
    context.fill();

    [
        [118, 45],
        [126, 58],
        [135, 74],
        [144, 91],
        [153, 109],
        [162, 128],
        [171, 148],
    ].forEach(([endX, endY], index) => {
        context.strokeStyle = `rgb(${BLUE})`;
        context.lineWidth = index < 2 ? 7 : 6;
        context.beginPath();
        context.moveTo(42, 158);
        context.lineTo(endX, endY);
        context.stroke();
    });

    context.strokeStyle = `rgb(${BLUE})`;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(132, 159);
    context.lineTo(194, 159);
    context.stroke();

    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.moveTo(82, 160);
    context.lineTo(106, 96);
    context.lineTo(130, 160);
    context.lineTo(115, 160);
    context.lineTo(106, 134);
    context.lineTo(96, 160);
    context.closePath();
    context.fill();
    context.globalCompositeOperation = 'source-over';

    context.fillStyle = `rgb(${ORANGE})`;
    context.beginPath();
    context.moveTo(176, 54);
    context.lineTo(234, 20);
    context.lineTo(234, 57);
    context.lineTo(176, 91);
    context.closePath();
    context.fill();

    drawLogoBar(context, 176, 98, 58, 8, -14);
    drawLogoBar(context, 176, 116, 58, 8, -10);
    drawLogoBar(context, 176, 134, 58, 8, -7);
    drawLogoBar(context, 176, 152, 58, 8, -3);
}

function drawLogoBar(context, x, y, barWidth, barHeight, skew) {
    context.fillStyle = `rgb(${ORANGE})`;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + barWidth, y + skew);
    context.lineTo(x + barWidth, y + skew + barHeight);
    context.lineTo(x, y + barHeight);
    context.closePath();
    context.fill();
}

function createLogoTargets(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const targets = [];
    for (let y = 0; y < LOGO_CANVAS_HEIGHT; y += step) {
        for (let x = 0; x < LOGO_CANVAS_WIDTH; x += step) {
            const offset = (y * LOGO_CANVAS_WIDTH + x) * 4;
            if (image[offset + 3] < 120) {
                continue;
            }

            targets.push({
                x: x - LOGO_CANVAS_WIDTH / 2,
                y: y - LOGO_CANVAS_HEIGHT / 2,
                color: `${image[offset]}, ${image[offset + 1]}, ${image[offset + 2]}`,
                luminance: 0.2126 * image[offset] + 0.7152 * image[offset + 1] + 0.0722 * image[offset + 2],
            });
        }
    }
    return targets;
}

function createParticles(targets) {
    const scale = Math.min(width * 0.56 / LOGO_CANVAS_WIDTH, height * 0.58 / LOGO_CANVAS_HEIGHT);
    return targets.map((target, index) => {
        const angle = (index / Math.max(1, targets.length - 1)) * Math.PI * 8;
        const radius = (0.22 + Math.random() * 0.72) * Math.max(width, height);

        return {
            color: target.color,
            delay: Math.random() * 0.28,
            originX: Math.cos(angle) * radius,
            originY: (Math.random() - 0.5) * height * 1.35,
            originZ: Math.sin(angle) * radius + 420 + Math.random() * 320,
            orbitRadius: (18 + Math.random() * 80) * scale,
            phase: Math.random() * Math.PI * 2,
            size: 0.72 + Math.random() * 1.18,
            speed: 0.55 + Math.random() * 1.45,
            targetX: target.x * scale,
            targetY: target.y * scale,
            targetZ: (Math.sin(target.x * 0.08) + Math.cos(target.y * 0.07)) * 3 * scale,
            spreadX: (Math.random() - 0.5) * 58 * scale,
            spreadY: (Math.random() - 0.5) * 34 * scale,
            spreadZ: (Math.random() - 0.5) * 205 * scale,
        };
    });
}

function createStarCells(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const cells = [];
    for (let y = 0; y < LOGO_CANVAS_HEIGHT; y += step) {
        for (let x = 0; x < LOGO_CANVAS_WIDTH; x += step) {
            const offset = (y * LOGO_CANVAS_WIDTH + x) * 4;
            if (image[offset + 3] < 120) {
                continue;
            }

            const luminance = 0.2126 * image[offset] + 0.7152 * image[offset + 1] + 0.0722 * image[offset + 2];
            const charIndex = clamp(Math.floor((1 - luminance / 255) * ASCII_CHARS.length), 0, ASCII_CHARS.length - 1);
            const char = ASCII_CHARS[charIndex];
            const gridX = Math.floor(x / step);
            const gridY = Math.floor(y / step);
            cells.push({
                char,
                color: `${image[offset]}, ${image[offset + 1]}, ${image[offset + 2]}`,
                gridX,
                gridY,
                isTerm: false,
                label: char,
                x: x - LOGO_CANVAS_WIDTH / 2,
                y: y - LOGO_CANVAS_HEIGHT / 2,
            });
        }
    }
    return replaceStarOperators(cells);
}

function createFlowBlocks(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const blocks = [];
    for (let y = 0; y < LOGO_CANVAS_HEIGHT; y += step) {
        let x = 0;
        while (x < LOGO_CANVAS_WIDTH) {
            const offset = (y * LOGO_CANVAS_WIDTH + x) * 4;
            if (image[offset + 3] < 120) {
                x += step;
                continue;
            }

            const seed = y * 17.13 + x * 9.41;
            const maxCells = 1 + Math.floor(seededNoise(seed) * 3);
            const startX = x;
            let runCells = 0;
            let red = 0;
            let green = 0;
            let blue = 0;

            while (x < LOGO_CANVAS_WIDTH && runCells < maxCells) {
                const runOffset = (y * LOGO_CANVAS_WIDTH + x) * 4;
                if (image[runOffset + 3] < 120) {
                    break;
                }

                red += image[runOffset];
                green += image[runOffset + 1];
                blue += image[runOffset + 2];
                runCells += 1;
                x += step;
            }

            const centerX = startX + runCells * step * 0.5;
            const average = `${Math.round(red / runCells)}, ${Math.round(green / runCells)}, ${Math.round(blue / runCells)}`;
            const side = centerX < LOGO_CANVAS_WIDTH * 0.5 ? -1 : 1;
            blocks.push({
                color: average,
                delay: seededNoise(seed + 5.1) * 0.24 + Math.abs(centerX - LOGO_CANVAS_WIDTH / 2) / LOGO_CANVAS_WIDTH * 0.12,
                height: step * (0.92 + seededNoise(seed + 2.7) * 0.22),
                label: FLOW_SYMBOLS[Math.floor(seededNoise(seed + 11.3) * FLOW_SYMBOLS.length)],
                palette: Math.floor(seededNoise(seed + 19.7) * 3),
                seed,
                side,
                width: runCells * step * (1.04 + seededNoise(seed + 31.2) * 0.22),
                x: centerX - LOGO_CANVAS_WIDTH / 2,
                y: y - LOGO_CANVAS_HEIGHT / 2,
            });
        }
    }

    return blocks.sort((a, b) => a.y - b.y || a.x - b.x);
}

function createFlipTiles(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const tiles = [];
    for (let y = 16; y < LOGO_CANVAS_HEIGHT - 16; y += step) {
        for (let x = 8; x < LOGO_CANVAS_WIDTH - 8; x += step) {
            const offset = (y * LOGO_CANVAS_WIDTH + x) * 4;
            const seed = x * 31.7 + y * 17.9;
            const isLogo = image[offset + 3] > 110;
            const isAmbient = !isLogo && seededNoise(seed) > 0.944 && y > 30 && y < 172;

            if (!isLogo && !isAmbient) {
                continue;
            }

            const distance = Math.hypot(x - LOGO_CANVAS_WIDTH / 2, y - LOGO_CANVAS_HEIGHT / 2);
            tiles.push({
                color: isLogo ? `${image[offset]}, ${image[offset + 1]}, ${image[offset + 2]}` : (x > LOGO_CANVAS_WIDTH / 2 ? ORANGE : BLUE),
                delay: distance / 230 + seededNoise(seed + 5.3) * 0.22,
                isLogo,
                seed,
                size: step * (isLogo ? 0.94 : 0.72),
                symbol: FLIP_SYMBOLS[Math.floor(seededNoise(seed + 12.4) * FLIP_SYMBOLS.length)],
                x: x - LOGO_CANVAS_WIDTH / 2,
                y: y - LOGO_CANVAS_HEIGHT / 2,
            });
        }
    }

    return tiles.sort((a, b) => a.delay - b.delay);
}

function createRayTargets(step) {
    const originX = 42 - LOGO_CANVAS_WIDTH / 2;
    const originY = 158 - LOGO_CANVAS_HEIGHT / 2;
    const targets = createLogoTargets(step).map((target, index) => {
        const distance = Math.hypot(target.x - originX, target.y - originY);
        const angle = Math.atan2(target.y - originY, target.x - originX);
        const sweep = clamp((angle + 1.72) / 2.2, 0, 1);
        return {
            ...target,
            angle,
            delay: sweep * 0.28 + distance / 280 * 0.18 + seededNoise(index * 7.17 + target.x) * 0.08,
            distance,
            seed: index * 11.71 + target.x * 1.6 + target.y * 2.2,
        };
    });

    return targets.sort((a, b) => a.delay - b.delay);
}

function createBinaryCells(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const cells = [];
    for (let y = 0; y < LOGO_CANVAS_HEIGHT; y += step) {
        for (let x = 0; x < LOGO_CANVAS_WIDTH; x += step) {
            const offset = (y * LOGO_CANVAS_WIDTH + x) * 4;
            if (image[offset + 3] < 120) {
                continue;
            }

            const seed = x * 19.17 + y * 31.43;
            cells.push({
                bit: seededNoise(seed + 3.4) > 0.48 ? '1' : '0',
                color: `${image[offset]}, ${image[offset + 1]}, ${image[offset + 2]}`,
                delay: seededNoise(seed + 8.9) * 0.58,
                glitchSeed: seed,
                spawnX: (seededNoise(seed + 12.1) - 0.5) * LOGO_CANVAS_WIDTH * 1.32,
                spawnY: (seededNoise(seed + 16.7) - 0.5) * LOGO_CANVAS_HEIGHT * 1.08,
                x: x - LOGO_CANVAS_WIDTH / 2,
                y: y - LOGO_CANVAS_HEIGHT / 2,
            });
        }
    }

    return cells.sort((a, b) => a.delay - b.delay);
}

function createLogoBands(step) {
    const source = document.createElement('canvas');
    source.width = LOGO_CANVAS_WIDTH;
    source.height = LOGO_CANVAS_HEIGHT;
    const sourceContext = source.getContext('2d', {willReadFrequently: true});
    drawSchoolAiLogo(sourceContext);

    const image = sourceContext.getImageData(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT).data;
    const strips = [];
    for (let y = 0; y < LOGO_CANVAS_HEIGHT; y += step) {
        let minX = LOGO_CANVAS_WIDTH;
        let maxX = 0;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let x = 0; x < LOGO_CANVAS_WIDTH; x += 1) {
            for (let sampleY = y; sampleY < Math.min(LOGO_CANVAS_HEIGHT, y + step); sampleY += 1) {
                const offset = (sampleY * LOGO_CANVAS_WIDTH + x) * 4;
                if (image[offset + 3] < 100) {
                    continue;
                }
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                red += image[offset];
                green += image[offset + 1];
                blue += image[offset + 2];
                count += 1;
            }
        }

        if (count === 0) {
            continue;
        }

        const centerBias = Math.abs((y + step / 2) - LOGO_CANVAS_HEIGHT / 2) / (LOGO_CANVAS_HEIGHT / 2);
        strips.push({
            color: `${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)}`,
            delay: centerBias * 0.2 + seededNoise(y * 5.7) * 0.22,
            height: Math.min(step, LOGO_CANVAS_HEIGHT - y),
            maxX,
            minX,
            seed: y * 13.37,
            y,
        });
    }

    return strips.sort((a, b) => a.delay - b.delay);
}

function createAuroraShapes(count) {
    return Array.from({length: count}, (_, index) => {
        const seed = index * 37.17 + 4.9;
        return {
            alpha: 0.08 + seededNoise(seed + 11.2) * 0.12,
            color: seededNoise(seed + 6.2) > 0.5 ? BLUE : ORANGE,
            kind: Math.floor(seededNoise(seed + 17.6) * 5),
            nx: seededNoise(seed + 1.1),
            ny: seededNoise(seed + 2.3),
            phase: seededNoise(seed + 4.4) * Math.PI * 2,
            rotation: seededNoise(seed + 8.7) * Math.PI * 2,
            seed,
            size: 6 + seededNoise(seed + 5.5) * 29,
            spin: (seededNoise(seed + 9.5) - 0.5) * 0.72,
            vx: (seededNoise(seed + 12.8) - 0.5) * 46,
            vy: (seededNoise(seed + 13.9) - 0.5) * 32,
        };
    });
}

function createStarIgniteNodes(step) {
    const originX = 22;
    const originY = 10;
    const nodes = createLogoTargets(step)
        .filter((target, index) => seededNoise(index * 9.13 + target.y * 0.07) > 0.11)
        .map((target, index) => {
            const dx = target.x - originX;
            const dy = target.y - originY;
            const distance = Math.hypot(dx, dy);
            const verticalSpread = Math.abs(dy) / (LOGO_CANVAS_HEIGHT * 0.5);
            return {
                ...target,
                distance,
                index,
                jitterX: (seededNoise(index * 8.7 + target.x) - 0.5) * 2.2,
                jitterY: (seededNoise(index * 9.9 + target.y) - 0.5) * 2.2,
                seed: index * 19.41 + target.x * 0.31 + target.y * 0.53,
                side: dx < 0 ? -1 : 1,
                verticalSpread,
            };
        });
    const maxDistance = Math.max(...nodes.map((node) => node.distance), 1);

    return nodes
        .map((node) => {
            const radial = node.distance / maxDistance;
            const split = Math.abs(node.x - originX) / LOGO_CANVAS_WIDTH;
            return {
                ...node,
                delay: radial * 0.76 + node.verticalSpread * 0.055 + split * 0.045 + seededNoise(node.seed) * 0.035,
            };
        })
        .sort((a, b) => a.delay - b.delay)
        .map((node, index, sortedNodes) => ({
            ...node,
            order: index / Math.max(1, sortedNodes.length - 1),
        }));
}

function createStarIgniteLinks(nodes) {
    const links = [];
    const seen = new Set();

    nodes.forEach((node, index) => {
        const candidates = [];
        nodes.forEach((other, otherIndex) => {
            if (otherIndex === index || other.delay >= node.delay - 0.004) {
                return;
            }

            const distance = Math.hypot(node.x - other.x, node.y - other.y);
            if (distance < 5.8 || distance > 23) {
                return;
            }

            const timingGap = node.delay - other.delay;
            const sidePenalty = node.side === other.side ? 0 : 2.4;
            candidates.push({
                distance,
                from: otherIndex,
                score: distance + timingGap * 28 + sidePenalty,
                to: index,
            });
        });

        candidates
            .sort((a, b) => a.score - b.score)
            .slice(0, 1)
            .forEach((link) => {
                const from = Math.min(link.from, link.to);
                const to = Math.max(link.from, link.to);
                const key = `${from}:${to}`;
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
                links.push({
                    ...link,
                    color: nodes[link.to].color,
                    from,
                    seed: node.seed + link.distance * 3.7,
                    to,
                });
            });
    });

    return links;
}

function replaceStarOperators(cells) {
    const rows = new Map();
    cells.forEach((cell) => {
        if (!rows.has(cell.gridY)) {
            rows.set(cell.gridY, []);
        }
        rows.get(cell.gridY).push(cell);
    });

    rows.forEach((rowCells, gridY) => {
        rowCells.sort((a, b) => a.gridX - b.gridX);
        let index = 0;
        while (index < rowCells.length) {
            const cell = rowCells[index];
            if (!isStarOperator(cell.char)) {
                index += 1;
                continue;
            }

            const run = [];
            let cursor = index;
            while (
                cursor < rowCells.length &&
                isStarOperator(rowCells[cursor].char) &&
                (run.length === 0 || rowCells[cursor].gridX <= run[run.length - 1].gridX + 1)
            ) {
                run.push(rowCells[cursor]);
                cursor += 1;
            }

            const term = STAR_TERMS[positiveModulo(gridY * 5 + run[0].gridX * 3, STAR_TERMS.length)];
            run.forEach((runCell, runIndex) => {
                runCell.isTerm = true;
                runCell.label = term[runIndex % term.length];
            });
            index = cursor;
        }
    });

    return cells;
}

function isStarOperator(char) {
    return char === '+' || char === '=';
}

function createWordRows() {
    const rows = [];
    const rowCount = 18;
    for (let row = 0; row < rowCount; row++) {
        const words = [];
        for (let i = 0; i < 52; i++) {
            words.push({
                text: WORD_FIELD_TERMS_CLEAN[Math.floor(Math.random() * WORD_FIELD_TERMS_CLEAN.length)],
                bright: Math.random() > 0.82,
                phase: Math.random() * Math.PI * 2,
                seed: Math.random() * 1000,
            });
        }
        rows.push({
            direction: row % 2 === 0 ? -1 : 1,
            offset: Math.random() * 900,
            speed: 18 + Math.random() * 20,
            words,
        });
    }
    return rows;
}

function tick(now) {
    try {
        const elapsed = now - animationStart;
        ctx.clearRect(0, 0, width, height);
        drawStageHalo(now / 1000);

        if (mode === 'ascii') {
            drawAiAsciiGlitch(elapsed);
        } else if (mode === 'star') {
            drawAsciiSweep(elapsed);
        } else if (mode === 'flip') {
            drawFlipMatrix(elapsed);
        } else if (mode === 'growth') {
            drawLogoGrowth(elapsed);
        } else if (mode === 'ray') {
            drawRayBurstLogo(elapsed);
        } else if (mode === 'binary') {
            drawBinaryResolveLogo(elapsed);
        } else if (mode === 'signal') {
            drawSignalMoireLogo(elapsed);
        } else if (mode === 'aurora-field') {
            drawAuroraFieldLogo(elapsed);
        } else if (mode === 'star-ignite') {
            drawStarIgniteLogo(elapsed);
        } else {
            drawParticleLogo(elapsed);
        }
    } catch (error) {
        console.error(error);
    }

    animationFrame = requestAnimationFrame(tick);
}

function drawStageHalo(seconds) {
    if (mode === 'ascii' || mode === 'flip' || mode === 'growth' || mode === 'ray' || mode === 'binary' || NEW_LOGO_MODES.includes(mode)) {
        return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = Math.min(width * 0.32, 330);
    const radiusY = Math.min(height * 0.22, 150);

    ctx.save();
    ctx.translate(centerX, centerY + radiusY * 0.26);
    ctx.rotate(seconds * 0.26);
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = 'rgba(140, 150, 255, 0.46)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(-seconds * 0.52);
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(255, 140, 82, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX * 0.66, radiusY * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (mode === 'ascii') {
        drawHackathonFrame(seconds);
    }
}

function drawHackathonFrame(seconds) {
    const centerX = width / 2;
    const centerY = height / 2;
    const frameWidth = Math.min(width * 0.78, 860);
    const frameHeight = Math.min(height * 0.46, 360);
    const left = centerX - frameWidth / 2;
    const top = centerY - frameHeight / 2;
    const pulse = 0.5 + Math.sin(seconds * 5.8) * 0.5;

    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.08;
    ctx.strokeStyle = `rgba(${RED}, 0.72)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, frameWidth, frameHeight);

    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    for (let i = -5; i < 10; i++) {
        const x = left + i * 88 + (seconds * 26) % 88;
        ctx.moveTo(x, top + frameHeight);
        ctx.lineTo(x + 220, top);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.34;
    ctx.font = '11px "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = `rgba(${RED}, 0.82)`;
    ctx.fillText('48H BUILD // AI WORD FIELD', left + 16, top + 22);
    ctx.fillText('WORDS -> VOID -> SIGNAL', left + frameWidth - 210, top + frameHeight - 18);

    const sweepX = left + ((seconds * 180) % (frameWidth + 180)) - 90;
    const gradient = ctx.createLinearGradient(sweepX - 60, top, sweepX + 80, top + frameHeight);
    gradient.addColorStop(0, 'rgba(255, 36, 66, 0)');
    gradient.addColorStop(0.5, 'rgba(255, 36, 66, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 36, 66, 0)');
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sweepX, top);
    ctx.lineTo(sweepX + 120, top + frameHeight);
    ctx.stroke();
    ctx.restore();
}

function drawParticleLogo(elapsed) {
    const seconds = elapsed / 1000;
    const progress = easeOutCubic(clamp(elapsed / 980, 0, 1));
    const centerX = width / 2;
    const centerY = height / 2;
    const postSeconds = Math.max(0, seconds - 0.98);
    const rotationY = progress * postSeconds * 0.74;
    const rotationX = Math.sin(postSeconds * 0.46) * 0.05 * progress;
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);
    const sideAmount = Math.pow(Math.abs(Math.sin(rotationY)), 2.2) * progress;
    const projected = [];

    particles.forEach((particle) => {
        const localProgress = easeOutCubic(clamp((elapsed / 980 - particle.delay) / (1 - particle.delay), 0, 1));
        const focusPulse = 0.5 + Math.sin(seconds * 1.4) * 0.5;
        const orbitAmount = (1 - localProgress) * 1.08 + focusPulse * 0.008;
        const orbitAngle = particle.phase + seconds * particle.speed * 1.55;
        const orbitRadius = particle.orbitRadius * orbitAmount;
        const idleWave = Math.sin(seconds * 3.2 + particle.phase + particle.targetX * 0.015) * 4.5;
        const depthBloom = sideAmount * (0.78 + Math.sin(seconds * 2.3 + particle.phase) * 0.34);
        const colorSide = particle.color.startsWith('255') ? 1 : -1;
        const targetOrbitX = particle.targetX + Math.cos(orbitAngle) * orbitRadius + (particle.spreadX + colorSide * 26) * sideAmount;
        const targetOrbitY = particle.targetY + Math.sin(orbitAngle * 1.7) * orbitRadius * 0.22 + particle.spreadY * sideAmount;
        const targetOrbitZ = particle.targetZ + Math.sin(orbitAngle) * orbitRadius + idleWave + particle.spreadZ * depthBloom + colorSide * 34 * sideAmount;
        const x = mix(particle.originX, targetOrbitX, localProgress);
        const y = mix(particle.originY, targetOrbitY, localProgress);
        const z = mix(particle.originZ, targetOrbitZ, localProgress);

        const rotatedX = x * cosY - z * sinY;
        const rotatedZ = x * sinY + z * cosY;
        const rotatedY = y * cosX - rotatedZ * sinX;
        const depthZ = y * sinX + rotatedZ * cosX;
        const perspective = 680 / (680 + depthZ);

        projected.push({
            alpha: (0.16 + localProgress * 0.72) * (0.68 + progress * 0.28),
            color: particle.color,
            scale: perspective,
            size: particle.size,
            x: centerX + rotatedX * perspective,
            y: centerY + rotatedY * perspective,
            z: depthZ,
        });
    });

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 7 + sideAmount * 5;
    projected.sort((a, b) => b.z - a.z);
    projected.forEach((particle) => {
        const radius = Math.max(0.55, particle.size * particle.scale * (0.9 + progress * 0.28) * (1 + sideAmount * 0.22));
        ctx.shadowColor = `rgba(${particle.color}, ${particle.alpha * 0.7})`;
        ctx.fillStyle = `rgba(${particle.color}, ${particle.alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawLogoFlow(elapsed) {
    const seconds = elapsed / 1000;
    const build = clamp(elapsed / 2200, 0, 1);
    const settle = easeOutCubic(clamp((elapsed - 760) / 1320, 0, 1));
    const metrics = getFlowLogoMetrics();

    drawFlowDataRails(metrics, seconds, build);
    drawFlowAssemblyWindow(metrics, seconds, build);
    drawFlowSymbolBlocks(metrics, seconds, build, settle);
    drawFlowLogoPulse(metrics, seconds, settle);
}

function getFlowLogoMetrics() {
    const logoScale = Math.min(
        width * 0.76 / LOGO_CANVAS_WIDTH,
        height * 0.58 / LOGO_CANVAS_HEIGHT,
        1.72,
    );
    const logoWidth = LOGO_CANVAS_WIDTH * logoScale;
    const logoHeight = LOGO_CANVAS_HEIGHT * logoScale;
    const centerX = width / 2;
    const centerY = height / 2 - Math.min(height * 0.035, 24);

    return {
        centerX,
        centerY,
        height: logoHeight,
        left: centerX - logoWidth / 2,
        scale: logoScale,
        top: centerY - logoHeight / 2,
        width: logoWidth,
    };
}

function drawFlowDataRails(metrics, seconds, progress) {
    const fontSize = Math.max(9, metrics.scale * 8.2);
    const railCount = 9;
    const railGap = metrics.height * 0.16;

    ctx.save();
    ctx.font = `900 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
    ctx.textBaseline = 'middle';

    for (let row = 0; row < railCount; row += 1) {
        const centerOffset = row - (railCount - 1) / 2;
        const y = metrics.centerY + centerOffset * railGap;
        const bandHeight = fontSize * (1.55 + (row % 2) * 0.28);
        const pattern = `${FLOW_RAILS[row % FLOW_RAILS.length]}   `;
        const patternWidth = Math.max(1, ctx.measureText(pattern).width);
        const speed = (row % 2 === 0 ? 64 : -78) + centerOffset * 3;
        let x = -positiveModulo(seconds * speed + row * 71, patternWidth);
        const rowFade = 1 - Math.min(0.72, Math.abs(centerOffset) * 0.09);

        ctx.globalAlpha = 0.2 * rowFade;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, y - bandHeight / 2, width, bandHeight);

        while (x < width + patternWidth) {
            const local = clamp((x + width * 0.08) / (width * 0.84), 0, 1);
            const bluePulse = Math.sin(seconds * 2.4 + row) * 0.5 + 0.5;
            ctx.globalAlpha = (0.2 + progress * 0.18) * rowFade;
            ctx.fillStyle = row % 3 === 0
                ? `rgba(88, ${190 + bluePulse * 36}, 174, 0.9)`
                : row % 3 === 1
                    ? `rgba(${Math.round(mix(52, 124, local))}, ${Math.round(mix(112, 198, local))}, 255, 0.86)`
                    : 'rgba(220, 242, 255, 0.58)';
            ctx.fillText(pattern, x, y);
            x += patternWidth;
        }
    }

    ctx.font = `900 ${Math.max(12, metrics.scale * 12)}px "Cascadia Mono", Consolas, monospace`;
    ctx.globalAlpha = 0.52 + progress * 0.2;
    ctx.fillStyle = 'rgba(239, 245, 255, 0.82)';
    ctx.fillText(`47:${String(Math.floor(20 + seconds * 8) % 60).padStart(2, '0')}:${String(Math.floor(seconds * 77) % 100).padStart(2, '0')}`, metrics.centerX + metrics.width * 0.62, metrics.centerY + metrics.height * 0.04);
    ctx.restore();
}

function drawFlowAssemblyWindow(metrics, seconds, progress) {
    const left = metrics.left - metrics.width * 0.34;
    const top = metrics.top - metrics.height * 0.08;
    const frameWidth = metrics.width * 1.68;
    const frameHeight = metrics.height * 1.12;
    const centerGlow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, frameWidth * 0.48);

    centerGlow.addColorStop(0, `rgba(${BLUE}, ${0.08 + progress * 0.08})`);
    centerGlow.addColorStop(0.52, 'rgba(21, 38, 50, 0.16)');
    centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.fillStyle = centerGlow;
    ctx.fillRect(left, top, frameWidth, frameHeight);

    ctx.globalAlpha = 0.16 + progress * 0.12;
    ctx.strokeStyle = 'rgba(90, 230, 198, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, frameWidth, frameHeight);

    const scanX = left + ((seconds * 190) % (frameWidth + 140)) - 70;
    const scan = ctx.createLinearGradient(scanX - 80, top, scanX + 80, top + frameHeight);
    scan.addColorStop(0, 'rgba(255, 255, 255, 0)');
    scan.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
    scan.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = scan;
    ctx.lineWidth = Math.max(1, metrics.scale * 2.4);
    ctx.beginPath();
    ctx.moveTo(scanX, top);
    ctx.lineTo(scanX + 90, top + frameHeight);
    ctx.stroke();
    ctx.restore();
}

function drawFlowSymbolBlocks(metrics, seconds, build, settle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    flowBlocks.forEach((block) => {
        const localProgress = easeOutCubic(clamp((build - block.delay) / 0.5, 0, 1));
        if (localProgress <= 0) {
            return;
        }

        const targetX = metrics.centerX + block.x * metrics.scale;
        const targetY = metrics.centerY + block.y * metrics.scale;
        const startX = block.side < 0
            ? -metrics.width * (0.34 + seededNoise(block.seed + 3) * 0.18)
            : width + metrics.width * (0.34 + seededNoise(block.seed + 3) * 0.18);
        const overshoot = Math.sin(localProgress * Math.PI) * block.side * metrics.scale * (5 + seededNoise(block.seed + 13) * 11);
        const x = mix(startX, targetX, localProgress) + overshoot;
        const y = targetY + Math.sin(seconds * 22 + block.seed) * (1 - localProgress) * metrics.scale * 0.9;
        const finalWidth = Math.max(metrics.scale * 9, block.width * metrics.scale * 1.12);
        const entryExtension = metrics.scale * (34 + seededNoise(block.seed + 29) * 86);
        const blockWidth = finalWidth + entryExtension * Math.pow(1 - localProgress, 1.35);
        const blockHeight = Math.max(metrics.scale * 6.5, block.height * metrics.scale * 1.12);
        const palette = getFlowBlockPalette(block);

        if (localProgress < 0.98) {
            drawFlowMotionTail(x, y, blockWidth, blockHeight, block.side, localProgress, palette);
            drawFlowGreenFollowers(x, y, blockWidth, blockHeight, block.side, localProgress, block.seed);
        }
        drawFlowBlock(x - blockWidth / 2, y - blockHeight / 2, blockWidth, blockHeight, block.label, palette, localProgress);
    });
    ctx.restore();
}

function drawFlowMotionTail(x, y, blockWidth, blockHeight, side, progress, palette) {
    const tailLength = blockWidth * (0.92 + (1 - progress) * 1.15);
    const gradient = ctx.createLinearGradient(x - side * tailLength, y, x, y);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.7, palette.tail);
    gradient.addColorStop(1, palette.glow);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 + (1 - progress) * 0.28;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - blockWidth / 2 - side * tailLength, y - blockHeight * 0.28, tailLength, blockHeight * 0.56);
    ctx.restore();
}

function drawFlowGreenFollowers(x, y, blockWidth, blockHeight, side, progress, seed) {
    const count = 4 + Math.floor(seededNoise(seed + 41) * 5);
    const fontSize = Math.max(8, blockHeight * 0.72);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.font = `900 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
    ctx.fillStyle = `rgba(68, 255, 170, ${0.24 + (1 - progress) * 0.36})`;
    ctx.shadowColor = 'rgba(68, 255, 170, 0.5)';
    ctx.shadowBlur = 5;
    for (let index = 0; index < count; index += 1) {
        const symbol = FLOW_TRAIL_SYMBOLS[Math.floor(seededNoise(seed + index * 13.7) * FLOW_TRAIL_SYMBOLS.length)];
        const distance = blockWidth * 0.64 + index * blockHeight * (1.4 + seededNoise(seed + index) * 0.7);
        const offsetY = (seededNoise(seed + index * 5.3) - 0.5) * blockHeight * 2.2;
        ctx.fillText(symbol, x - side * distance, y + offsetY);
    }
    ctx.restore();
}

function drawFlowBlock(x, y, blockWidth, blockHeight, label, palette, progress) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 4 + progress * 3;
    ctx.shadowColor = palette.glow;
    ctx.fillStyle = palette.fill;
    ctx.fillRect(x, y, blockWidth, blockHeight);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = Math.max(1, blockHeight * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, blockWidth - 1), Math.max(0, blockHeight - 1));

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = palette.highlight;
    ctx.fillRect(x + blockWidth * 0.08, y + blockHeight * 0.16, blockWidth * 0.28, Math.max(1, blockHeight * 0.1));

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, Math.max(1, blockWidth - 2), Math.max(1, blockHeight - 2));
    ctx.clip();
    ctx.font = `900 ${Math.max(6, blockHeight * 0.58)}px "Cascadia Mono", Consolas, monospace`;
    ctx.fillStyle = palette.text;
    ctx.fillText(label, x + blockWidth / 2, y + blockHeight / 2 + blockHeight * 0.03);
    ctx.restore();
}

function drawFlowLogoPulse(metrics, seconds, settle) {
    if (settle <= 0) {
        return;
    }

    const layer = document.createElement('canvas');
    layer.width = LOGO_CANVAS_WIDTH;
    layer.height = LOGO_CANVAS_HEIGHT;
    const layerContext = layer.getContext('2d');
    const gradient = layerContext.createLinearGradient(18, 160, 234, 30);
    gradient.addColorStop(0, `rgba(${BLUE}, 0.72)`);
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.36)');
    gradient.addColorStop(1, `rgba(${ORANGE}, 0.72)`);
    layerContext.fillStyle = gradient;
    layerContext.fillRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(createLogoMaskCanvas(), 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08 + settle * (0.12 + Math.sin(seconds * 4.2) * 0.015);
    ctx.filter = `blur(${Math.max(0.8, metrics.scale * 1.3)}px)`;
    ctx.drawImage(layer, metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function getFlowBlockPalette(block) {
    const isOrange = block.color.startsWith('255');
    const palettes = [
        {
            fill: 'rgb(244, 247, 252)',
            glow: 'rgba(244, 247, 252, 0.46)',
            highlight: 'rgba(0, 0, 0, 0.55)',
            stroke: 'rgb(255, 255, 255)',
            tail: 'rgba(244, 247, 252, 0.2)',
            text: 'rgb(4, 7, 12)',
        },
        {
            fill: isOrange ? 'rgb(255, 90, 31)' : 'rgb(66, 125, 255)',
            glow: isOrange ? 'rgba(255, 90, 31, 0.48)' : 'rgba(66, 125, 255, 0.48)',
            highlight: 'rgba(255, 255, 255, 0.5)',
            stroke: isOrange ? 'rgb(255, 134, 78)' : 'rgb(126, 166, 255)',
            tail: isOrange ? 'rgba(255, 90, 31, 0.22)' : 'rgba(66, 125, 255, 0.22)',
            text: 'rgb(4, 7, 12)',
        },
        {
            fill: isOrange ? 'rgb(255, 118, 58)' : 'rgb(45, 75, 238)',
            glow: isOrange ? 'rgba(255, 118, 58, 0.4)' : 'rgba(45, 75, 238, 0.4)',
            highlight: 'rgba(255, 255, 255, 0.46)',
            stroke: isOrange ? 'rgb(255, 178, 132)' : 'rgb(94, 122, 255)',
            tail: isOrange ? 'rgba(255, 118, 58, 0.18)' : 'rgba(45, 75, 238, 0.18)',
            text: 'rgb(4, 7, 12)',
        },
    ];

    return palettes[block.palette % palettes.length];
}

function drawFlipMatrix(elapsed) {
    const seconds = elapsed / 1000;
    const progress = clamp(elapsed / 2300, 0, 1);
    const settle = easeOutCubic(clamp((elapsed - 980) / 1050, 0, 1));
    const metrics = getFlowLogoMetrics();

    drawFlipBackdrop(metrics, seconds);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    flipTiles.forEach((tile) => {
        const localProgress = clamp((progress - tile.delay * 0.45) / 0.38, 0, 1);
        if (localProgress <= 0) {
            return;
        }

        drawFlipTile(tile, metrics, seconds, localProgress, settle);
    });
    ctx.restore();

    drawFlipLogoBloom(metrics, settle);
}

function drawFlipBackdrop(metrics, seconds) {
    const radius = Math.max(metrics.width, metrics.height) * 0.9;
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, radius);
    glow.addColorStop(0, 'rgba(82, 95, 255, 0.16)');
    glow.addColorStop(0.5, 'rgba(255, 90, 31, 0.09)');
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - radius, metrics.centerY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    for (let index = 0; index < 6; index += 1) {
        const y = metrics.top + metrics.height * (index + 1) / 7;
        ctx.beginPath();
        ctx.moveTo(metrics.left - metrics.width * 0.18, y + Math.sin(seconds + index) * 1.4);
        ctx.lineTo(metrics.left + metrics.width * 1.18, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFlipTile(tile, metrics, seconds, localProgress, settle) {
    const centerX = metrics.centerX + tile.x * metrics.scale;
    const centerY = metrics.centerY + tile.y * metrics.scale;
    const size = Math.max(4, tile.size * metrics.scale);
    const flip = Math.max(0.08, Math.abs(Math.cos(localProgress * Math.PI)));
    const unresolved = localProgress < 0.72;
    const alpha = tile.isLogo ? 1 : (1 - settle) * 0.18;

    if (alpha <= 0.01) {
        return;
    }

    const color = tile.isLogo
        ? flipTileColor(tile, localProgress)
        : (tile.x > 0 ? `rgba(${ORANGE}, ${alpha})` : `rgba(${BLUE}, ${alpha})`);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(1, flip);
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = tile.isLogo ? 7 : 0;
    ctx.shadowColor = tile.x > 0 ? `rgba(${ORANGE}, 0.34)` : `rgba(${BLUE}, 0.34)`;
    ctx.fillStyle = color;
    ctx.fillRect(-size / 2, -size / 2, size * 0.92, size * 0.92);
    ctx.strokeStyle = 'rgba(3, 3, 6, 0.72)';
    ctx.lineWidth = Math.max(0.6, size * 0.08);
    ctx.strokeRect(-size / 2, -size / 2, size * 0.92, size * 0.92);

    if (unresolved) {
        ctx.shadowBlur = 0;
        ctx.font = `900 ${Math.max(5, size * 0.42)}px "Cascadia Mono", Consolas, monospace`;
        ctx.fillStyle = 'rgba(4, 7, 12, 0.72)';
        ctx.fillText(tile.symbol, 0, size * 0.03);
    }
    ctx.restore();

    if (tile.isLogo && localProgress > 0.82) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (localProgress - 0.82) / 0.18 * 0.12;
        ctx.fillStyle = tile.x > 0 ? `rgb(${ORANGE})` : `rgb(${BLUE})`;
        ctx.fillRect(centerX - size * 0.58, centerY - size * 0.58, size * 1.06, size * 1.06);
        ctx.restore();
    }
}

function flipTileColor(tile, localProgress) {
    const amount = clamp((tile.x + LOGO_CANVAS_WIDTH / 2) / LOGO_CANVAS_WIDTH, 0, 1);
    const resolve = easeOutCubic(clamp((localProgress - 0.22) / 0.74, 0, 1));
    const start = tile.x > 0 ? [112, 54, 24] : [30, 38, 108];
    const end = tile.color.split(',').map((value) => Number(value.trim()));
    const r = Math.round(mix(start[0], end[0], resolve));
    const g = Math.round(mix(start[1], end[1], resolve));
    const b = Math.round(mix(start[2], end[2], resolve));
    const glow = localProgress < 0.72 ? 0.14 * Math.sin(localProgress * Math.PI) : 0;
    return `rgb(${Math.round(r + (255 - r) * glow * (1 - amount * 0.3))}, ${Math.round(g + (255 - g) * glow)}, ${Math.round(b + (255 - b) * glow)})`;
}

function drawFlipLogoBloom(metrics, settle) {
    if (settle <= 0) {
        return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08 + settle * 0.14;
    ctx.filter = `blur(${Math.max(0.6, metrics.scale * 1.1)}px)`;
    ctx.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function drawLogoGrowth(elapsed) {
    const seconds = elapsed / 1000;
    const progress = easeInOutCubic(clamp(elapsed / 3000, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2150) / 720, 0, 1));
    const metrics = getFlowLogoMetrics();

    drawGrowthBackground(metrics, seconds, progress);
    drawGrowthOffshoots(metrics, seconds, progress);
    drawGrowthBranches(metrics, seconds, progress);
    drawGrowthRevealLogo(metrics, progress, settle);
    drawGrowthTips(metrics, seconds, progress);
}

function drawGrowthBackground(metrics, seconds, progress) {
    const left = metrics.left - metrics.width * 0.2;
    const top = metrics.top - metrics.height * 0.18;
    const frameWidth = metrics.width * 1.42;
    const frameHeight = metrics.height * 1.34;
    const radius = Math.max(frameWidth, frameHeight) * 0.7;
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, radius);
    glow.addColorStop(0, `rgba(${BLUE}, ${0.1 + progress * 0.08})`);
    glow.addColorStop(0.58, `rgba(${ORANGE}, ${0.05 + progress * 0.05})`);
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - radius, metrics.centerY - radius, radius * 2, radius * 2);

    ctx.globalAlpha = 0.08 + progress * 0.06;
    ctx.strokeStyle = 'rgba(124, 148, 255, 0.5)';
    ctx.lineWidth = 1;
    const grid = Math.max(10, metrics.scale * 16);
    for (let x = left; x <= left + frameWidth; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + frameHeight);
        ctx.stroke();
    }
    for (let y = top; y <= top + frameHeight; y += grid) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + frameWidth, y);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.22 + progress * 0.08;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.strokeRect(left, top, frameWidth, frameHeight);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = `rgba(${ORANGE}, 0.52)`;
    ctx.beginPath();
    ctx.moveTo(left, metrics.centerY);
    ctx.lineTo(left + frameWidth, metrics.centerY + Math.sin(seconds * 0.4) * metrics.scale * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${BLUE}, 0.46)`;
    ctx.beginPath();
    ctx.moveTo(metrics.centerX, top);
    ctx.lineTo(metrics.centerX, top + frameHeight);
    ctx.stroke();
    ctx.restore();
}

function drawGrowthBranches(metrics, seconds, progress) {
    const constructProgress = clamp(progress / 0.82, 0, 1);
    const segments = [
        [18, 160, 79, 160, BLUE, 0.02, 1.25],
        [79, 160, 106, 75, BLUE, 0.08, 1.25],
        [106, 75, 91, 75, BLUE, 0.14, 1.25],
        [91, 75, 18, 160, BLUE, 0.2, 1.25],
        [82, 160, 106, 96, BLUE, 0.26, 1],
        [106, 96, 130, 160, BLUE, 0.32, 1],
        [115, 160, 106, 134, BLUE, 0.38, 1],
        [106, 134, 96, 160, BLUE, 0.44, 1],
        [42, 158, 118, 45, BLUE, 0.16, 1.45],
        [42, 158, 126, 58, BLUE, 0.2, 1.45],
        [42, 158, 135, 74, BLUE, 0.24, 1.45],
        [42, 158, 144, 91, BLUE, 0.28, 1.45],
        [42, 158, 153, 109, BLUE, 0.32, 1.45],
        [42, 158, 162, 128, BLUE, 0.36, 1.45],
        [42, 158, 171, 148, BLUE, 0.4, 1.45],
        [132, 159, 194, 159, BLUE, 0.52, 1.35],
        [176, 54, 234, 20, ORANGE, 0.44, 1.4],
        [234, 20, 234, 57, ORANGE, 0.5, 1.4],
        [234, 57, 176, 91, ORANGE, 0.56, 1.4],
        [176, 91, 176, 54, ORANGE, 0.62, 1.4],
        [176, 102, 234, 88, ORANGE, 0.58, 1.35],
        [176, 110, 234, 96, ORANGE, 0.62, 1.35],
        [176, 120, 234, 110, ORANGE, 0.66, 1.35],
        [176, 128, 234, 118, ORANGE, 0.7, 1.35],
        [176, 138, 234, 131, ORANGE, 0.74, 1.35],
        [176, 146, 234, 139, ORANGE, 0.78, 1.35],
        [176, 156, 234, 153, ORANGE, 0.82, 1.35],
        [176, 164, 234, 161, ORANGE, 0.86, 1.35],
    ];

    ctx.save();
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'lighter';

    segments.forEach(([x1, y1, x2, y2, color, delay, weight]) => {
        const p = easeOutCubic(clamp((constructProgress - delay) / 0.24, 0, 1));
        drawGrowthLine(metrics, x1, y1, x2, y2, p, `rgba(${color}, ${0.42 + p * 0.34})`, Math.max(1, metrics.scale * weight));
    });

    ctx.restore();
}

function drawGrowthLine(metrics, x1, y1, x2, y2, progress, color, lineWidth) {
    if (progress <= 0) {
        return;
    }

    const startX = metrics.left + x1 * metrics.scale;
    const startY = metrics.top + y1 * metrics.scale;
    const endX = metrics.left + mix(x1, x2, progress) * metrics.scale;
    const endY = metrics.top + mix(y1, y2, progress) * metrics.scale;

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = lineWidth * 2.4;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

function drawGrowthOffshoots(metrics, seconds, progress) {
    const guideProgress = easeOutCubic(clamp(progress / 0.74, 0, 1));
    const guideLines = [
        [42, 158, 42, 45, BLUE, 0.05],
        [42, 158, 234, 158, BLUE, 0.08],
        [106, 75, 106, 164, BLUE, 0.12],
        [176, 20, 176, 164, ORANGE, 0.18],
        [234, 20, 234, 164, ORANGE, 0.24],
        [18, 160, 234, 20, BLUE, 0.3],
        [176, 91, 234, 20, ORANGE, 0.36],
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.setLineDash([Math.max(2, metrics.scale * 4), Math.max(3, metrics.scale * 5)]);
    guideLines.forEach(([x1, y1, x2, y2, color, delay]) => {
        const p = easeOutCubic(clamp((guideProgress - delay) / 0.28, 0, 1));
        drawGrowthLine(metrics, x1, y1, x2, y2, p, `rgba(${color}, ${0.12 + p * 0.18})`, Math.max(0.8, metrics.scale * 0.78));
    });
    ctx.setLineDash([]);

    drawGrowthCircle(metrics, 42, 158, 84, easeOutCubic(clamp((guideProgress - 0.12) / 0.36, 0, 1)), `rgba(${BLUE}, 0.34)`);
    drawGrowthCircle(metrics, 106, 160, 64, easeOutCubic(clamp((guideProgress - 0.22) / 0.36, 0, 1)), `rgba(${BLUE}, 0.28)`);
    drawGrowthCircle(metrics, 176, 91, 72, easeOutCubic(clamp((guideProgress - 0.34) / 0.34, 0, 1)), `rgba(${ORANGE}, 0.28)`);
    drawGrowthArc(metrics, 176, 160, 58, -Math.PI / 2.7, -0.08, easeOutCubic(clamp((guideProgress - 0.45) / 0.34, 0, 1)), `rgba(${ORANGE}, 0.34)`);
    drawGrowthArc(metrics, 42, 158, 58, -1.18, -0.16, easeOutCubic(clamp((guideProgress - 0.5) / 0.34, 0, 1)), `rgba(${BLUE}, 0.34)`);

    ctx.restore();
}

function drawGrowthCircle(metrics, x, y, radius, progress, color) {
    if (progress <= 0) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, metrics.scale * 0.9);
    ctx.beginPath();
    ctx.arc(metrics.left + x * metrics.scale, metrics.top + y * metrics.scale, radius * metrics.scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
}

function drawGrowthArc(metrics, x, y, radius, startAngle, endAngle, progress, color) {
    if (progress <= 0) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, metrics.scale * 1);
    ctx.beginPath();
    ctx.arc(metrics.left + x * metrics.scale, metrics.top + y * metrics.scale, radius * metrics.scale, startAngle, mix(startAngle, endAngle, progress));
    ctx.stroke();
}

function drawGrowthRevealLogo(metrics, progress, settle) {
    const logoLayer = document.createElement('canvas');
    logoLayer.width = LOGO_CANVAS_WIDTH;
    logoLayer.height = LOGO_CANVAS_HEIGHT;
    const logoContext = logoLayer.getContext('2d');
    drawSchoolAiLogo(logoContext);

    const revealProgress = easeOutCubic(clamp((progress - 0.38) / 0.62, 0, 1));
    const mask = createGrowthMaskCanvas(revealProgress);
    logoContext.globalCompositeOperation = 'destination-in';
    logoContext.drawImage(mask, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.16 + revealProgress * 0.76 + settle * 0.08;
    ctx.drawImage(logoLayer, metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = revealProgress * (0.08 + settle * 0.14);
    ctx.filter = `blur(${Math.max(0.5, metrics.scale * 0.8)}px)`;
    ctx.drawImage(logoLayer, metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function createGrowthMaskCanvas(progress) {
    const mask = document.createElement('canvas');
    mask.width = LOGO_CANVAS_WIDTH;
    mask.height = LOGO_CANVAS_HEIGHT;
    const maskContext = mask.getContext('2d');
    const bodyProgress = easeOutCubic(clamp(progress / 0.55, 0, 1));
    const fanProgress = easeOutCubic(clamp((progress - 0.08) / 0.68, 0, 1));
    const orangeProgress = easeOutCubic(clamp((progress - 0.32) / 0.58, 0, 1));

    maskContext.fillStyle = '#fff';
    maskContext.strokeStyle = '#fff';
    maskContext.lineCap = 'round';
    maskContext.lineJoin = 'round';

    maskContext.save();
    maskContext.beginPath();
    maskContext.moveTo(18, 160);
    maskContext.lineTo(79, 160);
    maskContext.lineTo(106, 75);
    maskContext.lineTo(91, 75);
    maskContext.closePath();
    maskContext.clip();
    maskContext.fillRect(0, mix(160, 70, bodyProgress), 130, 96);
    maskContext.restore();

    [
        [118, 45],
        [126, 58],
        [135, 74],
        [144, 91],
        [153, 109],
        [162, 128],
        [171, 148],
    ].forEach(([endX, endY], index) => {
        const p = easeOutCubic(clamp((fanProgress - index * 0.045) / 0.46, 0, 1));
        maskContext.lineWidth = index < 2 ? 13 : 11;
        drawPartialLineOnContext(maskContext, 42, 158, endX, endY, p);
    });

    maskContext.lineWidth = 11;
    drawPartialLineOnContext(maskContext, 132, 159, 194, 159, easeOutCubic(clamp((fanProgress - 0.42) / 0.32, 0, 1)));

    maskContext.save();
    maskContext.beginPath();
    maskContext.moveTo(176, 54);
    maskContext.lineTo(234, 20);
    maskContext.lineTo(234, 57);
    maskContext.lineTo(176, 91);
    maskContext.closePath();
    maskContext.clip();
    maskContext.fillRect(176, 20, 58 * orangeProgress, 74);
    maskContext.restore();

    [
        [176, 98, 58, 8, -14],
        [176, 116, 58, 8, -10],
        [176, 134, 58, 8, -7],
        [176, 152, 58, 8, -3],
    ].forEach(([x, y, barWidth, barHeight, skew], index) => {
        const p = easeOutCubic(clamp((orangeProgress - index * 0.08) / 0.52, 0, 1));
        maskContext.save();
        maskContext.beginPath();
        maskContext.moveTo(x, y);
        maskContext.lineTo(x + barWidth, y + skew);
        maskContext.lineTo(x + barWidth, y + skew + barHeight);
        maskContext.lineTo(x, y + barHeight);
        maskContext.closePath();
        maskContext.clip();
        maskContext.fillRect(x, y - 16, barWidth * p, barHeight + 34);
        maskContext.restore();
    });

    maskContext.globalCompositeOperation = 'destination-out';
    maskContext.beginPath();
    maskContext.moveTo(82, 160);
    maskContext.lineTo(106, 96);
    maskContext.lineTo(130, 160);
    maskContext.lineTo(115, 160);
    maskContext.lineTo(106, 134);
    maskContext.lineTo(96, 160);
    maskContext.closePath();
    maskContext.fill();
    maskContext.globalCompositeOperation = 'source-over';

    if (progress > 0.96) {
        maskContext.globalAlpha = clamp((progress - 0.96) / 0.04, 0, 1);
        maskContext.drawImage(createLogoMaskCanvas(), 0, 0);
    }

    return mask;
}

function drawPartialLineOnContext(context, x1, y1, x2, y2, progress) {
    if (progress <= 0) {
        return;
    }

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(mix(x1, x2, progress), mix(y1, y2, progress));
    context.stroke();
}

function drawGrowthTips(metrics, seconds, progress) {
    const tips = [
        [18, 160, BLUE, 0.02],
        [79, 160, BLUE, 0.08],
        [106, 75, BLUE, 0.14],
        [91, 75, BLUE, 0.2],
        [42, 158, BLUE, 0.12],
        [118, 45, BLUE, 0.18],
        [126, 58, BLUE, 0.24],
        [135, 74, BLUE, 0.3],
        [144, 91, BLUE, 0.36],
        [153, 109, BLUE, 0.42],
        [162, 128, BLUE, 0.48],
        [171, 148, BLUE, 0.54],
        [234, 20, ORANGE, 0.58],
        [234, 57, ORANGE, 0.64],
        [234, 110, ORANGE, 0.72],
        [234, 153, ORANGE, 0.8],
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    tips.forEach(([x, y, color, delay], index) => {
        const p = clamp((progress - delay) / 0.14, 0, 1);
        if (p <= 0) {
            return;
        }

        const radius = metrics.scale * (1.8 + Math.sin(seconds * 4.2 + index) * 0.18) * (0.35 + p * 0.65);
        const px = metrics.left + x * metrics.scale;
        const py = metrics.top + y * metrics.scale;
        ctx.strokeStyle = `rgba(${color}, ${0.38 + p * 0.34})`;
        ctx.fillStyle = 'rgba(3, 3, 6, 0.82)';
        ctx.shadowColor = `rgba(${color}, 0.5)`;
        ctx.shadowBlur = radius * 1.8;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.7, radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(0.8, metrics.scale * 0.8);
        ctx.stroke();

        if (p > 0.8) {
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = `rgba(${color}, 0.72)`;
            ctx.fillRect(px - radius * 0.45, py - radius * 0.45, radius * 0.9, radius * 0.9);
            ctx.globalAlpha = 1;
        }
    });
    ctx.restore();
}

function drawRayBurstLogo(elapsed) {
    const seconds = elapsed / 1000;
    const progress = easeInOutCubic(clamp(elapsed / 2700, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 1880) / 720, 0, 1));
    const metrics = getFlowLogoMetrics();
    const origin = {
        x: metrics.left + 42 * metrics.scale,
        y: metrics.top + 158 * metrics.scale,
    };

    drawRayBackground(metrics, origin, seconds, progress);
    drawRayWideFan(metrics, origin, seconds, progress, settle);
    drawRayBeams(metrics, origin, seconds, progress, settle);
    drawRayLogoProjection(metrics, progress, settle);
    drawRayAperture(origin, metrics.scale, seconds, progress, settle);
}

function drawRayBackground(metrics, origin, seconds, progress) {
    const radius = Math.max(metrics.width, metrics.height) * 1.1;
    const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
    glow.addColorStop(0, `rgba(${BLUE}, ${0.2 + progress * 0.12})`);
    glow.addColorStop(0.24, 'rgba(118, 72, 160, 0.14)');
    glow.addColorStop(0.55, `rgba(${ORANGE}, ${0.06 + progress * 0.05})`);
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(origin.x - radius, origin.y - radius, radius * 2, radius * 2);

    ctx.globalAlpha = 0.12 + progress * 0.08;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 5; index += 1) {
        const y = metrics.top + metrics.height * (0.15 + index * 0.18) + Math.sin(seconds * 0.8 + index) * metrics.scale * 1.5;
        ctx.beginPath();
        ctx.moveTo(metrics.left - metrics.width * 0.28, y);
        ctx.lineTo(metrics.left + metrics.width * 1.28, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawRayWideFan(metrics, origin, seconds, progress, settle) {
    const fanProgress = easeOutCubic(clamp(progress / 0.78, 0, 1));
    const fade = 1 - settle * 0.72;
    const endpoints = [
        [118, 45, BLUE, 0.3],
        [171, 148, BLUE, 0.22],
        [234, 20, ORANGE, 0.28],
        [234, 57, ORANGE, 0.22],
        [234, 153, ORANGE, 0.2],
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    endpoints.forEach(([x, y, color, alpha], index) => {
        const local = easeOutCubic(clamp((fanProgress - index * 0.06) / 0.62, 0, 1));
        if (local <= 0) {
            return;
        }

        const targetX = metrics.left + x * metrics.scale;
        const targetY = metrics.top + y * metrics.scale;
        const gradient = ctx.createLinearGradient(origin.x, origin.y, targetX, targetY);
        gradient.addColorStop(0, `rgba(${color}, ${alpha * 0.82 * fade})`);
        gradient.addColorStop(0.44, `rgba(${color}, ${alpha * 0.24 * fade})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = metrics.scale * (11 + index * 2.2) * Math.sin(local * Math.PI * 0.5);
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(mix(origin.x, targetX, local), mix(origin.y, targetY, local));
        ctx.stroke();
    });
    ctx.restore();
}

function drawRayBeams(metrics, origin, seconds, progress, settle) {
    const fade = 1 - settle * 0.62;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    rayTargets.forEach((target) => {
        const local = easeOutCubic(clamp((progress - target.delay) / 0.46, 0, 1));
        if (local <= 0) {
            return;
        }

        const targetX = metrics.centerX + target.x * metrics.scale;
        const targetY = metrics.centerY + target.y * metrics.scale;
        const rayEndX = mix(origin.x, targetX, local);
        const rayEndY = mix(origin.y, targetY, local);
        const pulse = 0.72 + Math.sin(seconds * 8 + target.seed) * 0.28;
        const alpha = (0.045 + local * 0.12) * fade * pulse;
        const gradient = ctx.createLinearGradient(origin.x, origin.y, rayEndX, rayEndY);

        gradient.addColorStop(0, `rgba(${target.color}, ${alpha * 0.9})`);
        gradient.addColorStop(0.72, `rgba(${target.color}, ${alpha * 0.34})`);
        gradient.addColorStop(1, `rgba(${target.color}, ${alpha * 0.04})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = Math.max(0.55, metrics.scale * (0.42 + seededNoise(target.seed) * 0.9));
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(rayEndX, rayEndY);
        ctx.stroke();

        if (local > 0.7) {
            const dotAlpha = (local - 0.7) / 0.3 * (0.24 + settle * 0.34);
            ctx.fillStyle = `rgba(${target.color}, ${dotAlpha})`;
            ctx.beginPath();
            ctx.arc(targetX, targetY, Math.max(0.55, metrics.scale * 0.72), 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.restore();
}

function drawRayLogoProjection(metrics, progress, settle) {
    const reveal = easeOutCubic(clamp((progress - 0.16) / 0.78, 0, 1));
    const layer = document.createElement('canvas');
    layer.width = LOGO_CANVAS_WIDTH;
    layer.height = LOGO_CANVAS_HEIGHT;
    const layerContext = layer.getContext('2d');
    drawSchoolAiLogo(layerContext);

    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(createRayRevealMask(reveal), 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.24 + reveal * 0.6 + settle * 0.16;
    ctx.drawImage(layer, metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = reveal * (0.16 + settle * 0.08);
    ctx.filter = `blur(${Math.max(0.6, metrics.scale * (1.35 - settle * 0.55))}px)`;
    ctx.drawImage(layer, metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function createRayRevealMask(progress) {
    const mask = document.createElement('canvas');
    mask.width = LOGO_CANVAS_WIDTH;
    mask.height = LOGO_CANVAS_HEIGHT;
    const maskContext = mask.getContext('2d');
    const originX = 42;
    const originY = 158;
    const radius = mix(8, 245, progress);
    const gradient = maskContext.createRadialGradient(originX, originY, Math.max(1, radius * 0.16), originX, originY, radius);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.96)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    maskContext.fillStyle = gradient;
    maskContext.fillRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);

    if (progress > 0.9) {
        maskContext.globalAlpha = clamp((progress - 0.9) / 0.1, 0, 1);
        maskContext.drawImage(createLogoMaskCanvas(), 0, 0);
    }

    return mask;
}

function drawRayAperture(origin, scale, seconds, progress, settle) {
    const pulse = 0.6 + Math.sin(seconds * 5.2) * 0.4;
    const radius = Math.max(3, scale * (5 + pulse * 1.7));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${BLUE}, ${0.48 + progress * 0.22})`;
    ctx.shadowColor = `rgba(${BLUE}, 0.72)`;
    ctx.shadowBlur = radius * 4;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.32 * (1 - settle * 0.4);
    ctx.strokeStyle = `rgba(${ORANGE}, 0.64)`;
    ctx.lineWidth = Math.max(1, scale * 1.2);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius * 2.1, -0.3, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
}

function drawTextOrbitLogo(elapsed) {
    const seconds = elapsed / 1000;
    const logoProgress = easeOutCubic(clamp(elapsed / 1450, 0, 1));
    const ringProgress = easeOutCubic(clamp((elapsed - 680) / 2200, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2300) / 620, 0, 1));
    const metrics = getOrbitLogoMetrics();
    const rings = [
        {offset: -0.15, radiusX: metrics.width * 0.76, radiusZ: metrics.width * 0.47, rotateZ: -0.16, speed: 0.13, tiltX: 1.05},
        {offset: 1.15, radiusX: metrics.width * 0.7, radiusZ: metrics.width * 0.43, rotateZ: 0.48, speed: -0.1, tiltX: -0.78},
    ];

    drawOrbitBackdrop(metrics, seconds, logoProgress, ringProgress);
    rings.forEach((ring, index) => {
        drawOrbitThread(metrics, seconds, ringProgress, ring, index, 'back');
        drawOrbitTerms(metrics, seconds, ringProgress, ring, index, 'back');
    });
    drawOrbitPlanet(metrics, logoProgress, settle);
    rings.forEach((ring, index) => {
        drawOrbitThread(metrics, seconds, ringProgress, ring, index, 'front');
        drawOrbitTerms(metrics, seconds, ringProgress, ring, index, 'front');
    });
}

function getOrbitLogoMetrics() {
    const logoScale = Math.min(
        width * 0.5 / LOGO_CANVAS_WIDTH,
        height * 0.44 / LOGO_CANVAS_HEIGHT,
        1.22,
    );
    const logoWidth = LOGO_CANVAS_WIDTH * logoScale;
    const logoHeight = LOGO_CANVAS_HEIGHT * logoScale;
    const centerX = width / 2;
    const centerY = height / 2 - Math.min(height * 0.035, 22);

    return {
        centerX,
        centerY,
        height: logoHeight,
        left: centerX - logoWidth / 2,
        scale: logoScale,
        top: centerY - logoHeight / 2,
        width: logoWidth,
    };
}

function drawOrbitBackdrop(metrics, seconds, logoProgress, ringProgress) {
    const radius = Math.max(metrics.width, metrics.height) * 1.45;
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, radius);
    glow.addColorStop(0, `rgba(${BLUE}, ${0.1 + logoProgress * 0.1})`);
    glow.addColorStop(0.44, 'rgba(104, 66, 160, 0.12)');
    glow.addColorStop(0.72, `rgba(${ORANGE}, ${0.05 + ringProgress * 0.08})`);
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - radius, metrics.centerY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 0.08 + ringProgress * 0.08;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    for (let index = 0; index < 4; index += 1) {
        const y = metrics.centerY + (index - 1.5) * metrics.height * 0.24 + Math.sin(seconds * 0.7 + index) * metrics.scale * 2;
        ctx.beginPath();
        ctx.moveTo(metrics.centerX - metrics.width * 1.28, y);
        ctx.lineTo(metrics.centerX + metrics.width * 1.28, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawOrbitPlanet(metrics, logoProgress, settle) {
    const layer = getOrbitLogoCanvas();
    const planetScale = 0.08 + easeOutCubic(clamp(logoProgress, 0, 1)) * 0.92;
    const scaledWidth = metrics.width * planetScale;
    const scaledHeight = metrics.height * planetScale;
    const left = metrics.centerX - scaledWidth / 2;
    const top = metrics.centerY - scaledHeight / 2;

    drawOrbitPlanetSphere(metrics, planetScale, logoProgress, settle);
    drawOrbitPlanetSeed(metrics, planetScale, logoProgress);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = logoProgress * (0.14 + settle * 0.08);
    ctx.filter = `blur(${Math.max(0.8, metrics.scale * 2.4)}px)`;
    ctx.drawImage(layer, left, top, scaledWidth, scaledHeight);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = logoProgress;
    ctx.filter = `drop-shadow(0 0 ${Math.max(3, metrics.scale * 7)}px rgba(82, 95, 255, 0.24)) drop-shadow(0 0 ${Math.max(3, metrics.scale * 8)}px rgba(255, 90, 31, 0.2))`;
    ctx.drawImage(layer, left, top, scaledWidth, scaledHeight);
    ctx.restore();
}

function getOrbitLogoCanvas() {
    if (orbitLogoCanvas) {
        return orbitLogoCanvas;
    }

    orbitLogoCanvas = document.createElement('canvas');
    orbitLogoCanvas.width = LOGO_CANVAS_WIDTH;
    orbitLogoCanvas.height = LOGO_CANVAS_HEIGHT;
    const logoContext = orbitLogoCanvas.getContext('2d');
    drawSchoolAiLogo(logoContext);

    logoContext.globalCompositeOperation = 'source-atop';
    const shade = logoContext.createLinearGradient(18, 40, 238, 178);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
    shade.addColorStop(0.38, 'rgba(255, 255, 255, 0.02)');
    shade.addColorStop(0.72, 'rgba(0, 0, 0, 0.08)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
    logoContext.fillStyle = shade;
    logoContext.fillRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);

    const glint = logoContext.createLinearGradient(22, 32, 176, 164);
    glint.addColorStop(0, 'rgba(255, 255, 255, 0)');
    glint.addColorStop(0.48, 'rgba(255, 255, 255, 0.18)');
    glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    logoContext.fillStyle = glint;
    logoContext.fillRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);
    logoContext.globalCompositeOperation = 'source-over';

    return orbitLogoCanvas;
}

function drawOrbitPlanetSeed(metrics, planetScale, logoProgress) {
    if (logoProgress >= 0.72) {
        return;
    }

    const seedAlpha = (1 - logoProgress / 0.72) * 0.64;
    const radius = Math.max(1.5, metrics.scale * (3 + planetScale * 8));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(245, 248, 255, ${seedAlpha})`;
    ctx.shadowColor = `rgba(${BLUE}, ${seedAlpha})`;
    ctx.shadowBlur = radius * 4;
    ctx.beginPath();
    ctx.arc(metrics.centerX, metrics.centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawOrbitPlanetSphere(metrics, planetScale, logoProgress, settle) {
    if (logoProgress <= 0) {
        return;
    }

    const radius = Math.max(metrics.width, metrics.height) * 0.5 * planetScale;
    const highlight = ctx.createRadialGradient(
        metrics.centerX - radius * 0.24,
        metrics.centerY - radius * 0.22,
        radius * 0.08,
        metrics.centerX,
        metrics.centerY,
        radius * 1.15,
    );

    highlight.addColorStop(0, `rgba(245, 248, 255, ${0.16 * logoProgress})`);
    highlight.addColorStop(0.36, `rgba(${BLUE}, ${0.16 * logoProgress})`);
    highlight.addColorStop(0.62, `rgba(${ORANGE}, ${0.07 * logoProgress})`);
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.ellipse(metrics.centerX, metrics.centerY, radius * 1.04, radius * 0.78, -0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18 * logoProgress;
    ctx.strokeStyle = 'rgba(245, 248, 255, 0.42)';
    ctx.lineWidth = Math.max(0.7, metrics.scale * 0.8);
    ctx.beginPath();
    ctx.ellipse(metrics.centerX, metrics.centerY, radius * 1.02, radius * 0.76, -0.14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createLinearGradient(metrics.centerX - radius, metrics.centerY - radius, metrics.centerX + radius, metrics.centerY + radius);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shade.addColorStop(0.58, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, `rgba(0, 0, 0, ${0.18 * logoProgress * (0.6 + settle * 0.4)})`);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(metrics.centerX, metrics.centerY, radius * 1.04, radius * 0.78, -0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawOrbitThread(metrics, seconds, progress, ring, ringIndex, pass) {
    const samples = 82;
    const revealAngle = Math.PI * 2 * (0.08 + progress * 1.02);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(0.7, metrics.scale * 0.72);
    ctx.strokeStyle = ringIndex === 0
        ? `rgba(${BLUE}, ${0.1 + progress * 0.22})`
        : `rgba(${ORANGE}, ${0.1 + progress * 0.2})`;

    let drawing = false;
    ctx.beginPath();
    for (let i = 0; i <= samples; i += 1) {
        const base = (i / samples) * Math.PI * 2;
        if (base > revealAngle) {
            if (drawing) {
                ctx.stroke();
            }
            drawing = false;
            continue;
        }

        const point = projectOrbitPoint(base + ring.offset + seconds * ring.speed, metrics, ring);
        const front = point.depth < 0;
        if ((pass === 'front') !== front) {
            if (drawing) {
                ctx.stroke();
            }
            drawing = false;
            continue;
        }

        if (!drawing) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            drawing = true;
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    if (drawing) {
        ctx.stroke();
    }
    ctx.restore();
}

function drawOrbitTerms(metrics, seconds, progress, ring, ringIndex, pass) {
    const baseFontSize = Math.max(6, metrics.scale * 6.4);
    const phrase = `${ORBIT_TERMS.join('  ')}  `;
    const circumference = Math.PI * 2 * Math.max(ring.radiusX, ring.radiusZ);
    const charCount = Math.max(66, Math.floor(circumference / (baseFontSize * 0.82)));
    const revealCount = Math.floor(charCount * (0.08 + progress * 0.98));
    const charStep = Math.PI * 2 / charCount;
    const phraseOffset = Math.floor(seconds * ring.speed * 36 + ringIndex * 17);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `760 ${baseFontSize}px "Cascadia Mono", Consolas, monospace`;
    ctx.globalCompositeOperation = 'lighter';

    for (let index = 0; index < revealCount; index += 1) {
        const letter = phrase[positiveModulo(index + phraseOffset, phrase.length)];
        if (letter === ' ') {
            continue;
        }

        const reveal = easeOutCubic(clamp((progress - index / charCount * 0.42) / 0.2, 0, 1));
        const angle = index * charStep + ring.offset + seconds * ring.speed;
        const point = projectOrbitPoint(angle, metrics, ring);
        const front = point.depth < 0;
        if ((pass === 'front') !== front) {
            continue;
        }

        const color = orbitTermColor(point.x, metrics, reveal * (front ? 0.86 : 0.32));
        const tangent = orbitTangentAngle(angle, metrics, ring);
        const scale = clamp(point.scale, 0.68, 1.22) * (front ? 1 : 0.82);

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(tangent);
        ctx.scale(scale, scale * (front ? 1 : 0.9));
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = front ? metrics.scale * 0.85 : 0;
        ctx.fillText(letter, 0, 0);
        ctx.restore();
    }
    ctx.restore();
}

function projectOrbitPoint(angle, metrics, ring) {
    const raw = projectOrbitCore(angle, metrics, ring);
    const perspective = 760 / (760 + raw.depth);
    return {
        depth: raw.depth,
        scale: perspective,
        x: metrics.centerX + raw.x * perspective,
        y: metrics.centerY + raw.y * perspective,
    };
}

function projectOrbitCore(angle, metrics, ring) {
    const x = Math.cos(angle) * ring.radiusX;
    const z = Math.sin(angle) * ring.radiusZ;
    const tiltedY = -z * Math.sin(ring.tiltX);
    const depth = z * Math.cos(ring.tiltX);
    const cosZ = Math.cos(ring.rotateZ);
    const sinZ = Math.sin(ring.rotateZ);

    return {
        depth,
        x: x * cosZ - tiltedY * sinZ,
        y: x * sinZ + tiltedY * cosZ,
    };
}

function orbitTangentAngle(angle, metrics, ring) {
    const prev = projectOrbitPoint(angle - 0.012, metrics, ring);
    const next = projectOrbitPoint(angle + 0.012, metrics, ring);
    return Math.atan2(next.y - prev.y, next.x - prev.x);
}

function orbitTermColor(x, metrics, alpha) {
    const amount = clamp((x - (metrics.centerX - metrics.width * 1.05)) / Math.max(1, metrics.width * 2.1), 0, 1);
    const r = Math.round(mix(82, 255, amount));
    const g = Math.round(mix(95, 90, amount));
    const b = Math.round(mix(255, 31, amount));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawAuroraFieldLogo(elapsed) {
    const seconds = elapsed / 1000;
    const reveal = easeOutCubic(clamp((elapsed - 120) / 1900, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2180) / 680, 0, 1));
    const metrics = getLoaderLogoMetrics();

    drawAuroraFieldBackdrop(metrics, seconds, reveal);
    drawAuroraGeometryField(ctx, metrics, seconds, reveal, false);
    drawAuroraLogoHighlight(metrics, seconds, reveal, settle);
}

function drawAuroraFieldBackdrop(metrics, seconds, reveal) {
    const centerGlow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, Math.max(metrics.width, metrics.height) * 1.3);
    centerGlow.addColorStop(0, `rgba(120, 128, 255, ${0.04 + reveal * 0.06})`);
    centerGlow.addColorStop(0.4, `rgba(255, 92, 31, ${0.025 + reveal * 0.035})`);
    centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + reveal * 0.12;
    for (let row = 0; row < 9; row += 1) {
        const y = positiveModulo(row * height / 8 + seconds * (8 + row * 0.9), height + 120) - 60;
        const gradient = ctx.createLinearGradient(0, y - 42, width, y + 42);
        gradient.addColorStop(0, 'rgba(82, 95, 255, 0)');
        gradient.addColorStop(0.44, `rgba(${row % 2 === 0 ? BLUE : ORANGE}, ${0.04 + reveal * 0.035})`);
        gradient.addColorStop(1, 'rgba(255, 90, 31, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, y - 42, width, 84);
    }
    ctx.restore();
}

function drawAuroraLogoHighlight(metrics, seconds, reveal, settle) {
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.ceil(width));
    layer.height = Math.max(1, Math.ceil(height));
    const layerContext = layer.getContext('2d');

    drawAuroraGeometryField(layerContext, metrics, seconds, reveal, true);
    layerContext.save();
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    layerContext.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.36 + reveal * 0.18;
    ctx.filter = `blur(${Math.max(1.2, metrics.scale * 2.5)}px) saturate(1.45)`;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.58 + reveal * 0.22;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.08 + reveal * 0.12) * (1 - settle * 0.2);
    ctx.filter = `blur(${Math.max(0.8, metrics.scale * 1.1)}px)`;
    ctx.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function drawAuroraGeometryField(context, metrics, seconds, reveal, highlighted) {
    context.save();
    context.globalCompositeOperation = highlighted ? 'lighter' : 'source-over';

    auroraShapes.forEach((shape, index) => {
        const pad = shape.size * 2.4;
        const waveX = Math.sin(seconds * 0.34 + shape.phase) * width * 0.035;
        const waveY = Math.cos(seconds * 0.28 + shape.phase * 0.7) * height * 0.03;
        const x = positiveModulo(shape.nx * width + shape.vx * seconds + waveX + pad, width + pad * 2) - pad;
        const y = positiveModulo(shape.ny * height + shape.vy * seconds + waveY + pad, height + pad * 2) - pad;
        const distance = Math.hypot((x - metrics.centerX) / Math.max(1, metrics.width), (y - metrics.centerY) / Math.max(1, metrics.height));
        const proximity = highlighted ? 1 : clamp(1 - distance * 1.25, 0, 1);
        const alpha = highlighted
            ? (0.24 + reveal * 0.48) * (0.74 + seededNoise(shape.seed) * 0.26)
            : shape.alpha * (0.42 + reveal * 0.58) + proximity * 0.08;
        const size = shape.size * (highlighted ? 0.92 + proximity * 0.35 : 0.75 + proximity * 0.42);
        const color = highlighted
            ? auroraMixColor(index, x, metrics, alpha)
            : `rgba(${shape.color}, ${alpha})`;

        context.save();
        context.translate(x, y);
        context.rotate(shape.rotation + seconds * shape.spin);
        context.strokeStyle = color;
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = highlighted ? size * 0.82 : size * 0.18;
        context.lineWidth = Math.max(0.7, size * (highlighted ? 0.12 : 0.055));
        drawAuroraGeometryShape(context, shape.kind, size, highlighted);
        context.restore();
    });

    context.restore();
}

function drawAuroraGeometryShape(context, kind, size, highlighted) {
    if (kind === 0) {
        context.beginPath();
        context.moveTo(0, -size * 0.72);
        context.lineTo(size * 0.68, size * 0.46);
        context.lineTo(-size * 0.68, size * 0.46);
        context.closePath();
        highlighted ? context.fill() : context.stroke();
        return;
    }

    if (kind === 1) {
        context.strokeRect(-size * 0.52, -size * 0.34, size * 1.04, size * 0.68);
        return;
    }

    if (kind === 2) {
        context.beginPath();
        context.moveTo(0, -size * 0.68);
        context.lineTo(size * 0.56, 0);
        context.lineTo(0, size * 0.68);
        context.lineTo(-size * 0.56, 0);
        context.closePath();
        highlighted ? context.fill() : context.stroke();
        return;
    }

    if (kind === 3) {
        context.beginPath();
        context.arc(0, 0, size * 0.44, 0, Math.PI * 2);
        context.stroke();
        return;
    }

    context.beginPath();
    context.moveTo(-size * 0.7, 0);
    context.lineTo(size * 0.7, 0);
    context.moveTo(0, -size * 0.45);
    context.lineTo(0, size * 0.45);
    context.stroke();
}

function auroraMixColor(index, x, metrics, alpha) {
    const amount = clamp((x - metrics.left) / Math.max(1, metrics.width), 0, 1);
    const pulse = 0.08 * Math.sin(index * 0.91);
    const r = Math.round(mix(98, 255, clamp(amount + pulse, 0, 1)));
    const g = Math.round(mix(116, 108, amount));
    const b = Math.round(mix(255, 42, clamp(amount - pulse, 0, 1)));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawStarIgniteLogo(elapsed) {
    const seconds = elapsed / 1000;
    const progress = clamp(elapsed / 3180, 0, 1);
    const reveal = easeOutCubic(clamp((elapsed - 70) / 2320, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2360) / 660, 0, 1));
    const metrics = getLoaderLogoMetrics();

    drawStarIgniteBackground(metrics, seconds, reveal, settle);
    drawStarIgniteWave(metrics, progress, reveal);
    drawStarIgniteConnections(metrics, reveal, settle);
    drawStarIgnitePoints(metrics, seconds, progress, settle);
}

function drawStarIgniteBackground(metrics, seconds, reveal, settle) {
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, Math.max(metrics.width, metrics.height) * 0.88);
    glow.addColorStop(0, `rgba(110, 120, 255, ${0.035 + reveal * 0.045})`);
    glow.addColorStop(0.48, `rgba(255, 90, 31, ${0.018 + reveal * 0.03})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - metrics.width, metrics.centerY - metrics.height, metrics.width * 2, metrics.height * 2);

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.018 + reveal * 0.028) * (1 - settle * 0.2);
    ctx.filter = `blur(${Math.max(1.2, metrics.scale * 2.4)}px)`;
    ctx.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);

    for (let ring = 0; ring < 2; ring += 1) {
        ctx.filter = 'none';
        ctx.globalAlpha = (0.026 + reveal * 0.034) * (1 - settle * 0.3);
        ctx.strokeStyle = ring === 0 ? `rgba(${BLUE}, 0.22)` : `rgba(${ORANGE}, 0.18)`;
        ctx.lineWidth = Math.max(0.45, metrics.scale * 0.38);
        ctx.beginPath();
        ctx.ellipse(
            metrics.centerX,
            metrics.centerY + metrics.height * 0.02,
            metrics.width * (0.54 + ring * 0.11),
            metrics.height * (0.24 + ring * 0.06),
            -0.2 + ring * 0.16 + Math.sin(seconds * 0.16) * 0.04,
            0,
            Math.PI * 2,
        );
        ctx.stroke();
    }
    ctx.restore();
}

function drawStarIgniteWave(metrics, progress, reveal) {
    const spread = easeOutCubic(clamp(progress / 0.86, 0, 1));
    const x = metrics.centerX + 22 * metrics.scale;
    const y = metrics.centerY + 10 * metrics.scale;
    const radius = metrics.width * mix(0.08, 0.74, spread);
    const gradient = ctx.createRadialGradient(x, y, Math.max(1, radius * 0.78), x, y, radius);

    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.48, `rgba(245, 248, 255, ${0.035 * reveal})`);
    gradient.addColorStop(0.68, `rgba(${BLUE}, ${0.055 * reveal})`);
    gradient.addColorStop(0.84, `rgba(${ORANGE}, ${0.04 * reveal})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    ctx.globalAlpha = 0.16 * reveal * (1 - spread * 0.2);
    ctx.strokeStyle = 'rgba(245, 248, 255, 0.48)';
    ctx.lineWidth = Math.max(0.45, metrics.scale * 0.44);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.94, -Math.PI * 0.78, Math.PI * 0.78);
    ctx.stroke();
    ctx.restore();
}

function drawStarIgniteConnections(metrics, reveal, settle) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(0.42, metrics.scale * 0.42);

    starIgniteLinks.forEach((starLink) => {
        const current = starIgniteNodes[starLink.from];
        const next = starIgniteNodes[starLink.to];
        const currentOn = clamp((reveal - current.delay) / 0.12, 0, 1);
        const nextOn = clamp((reveal - next.delay) / 0.12, 0, 1);
        const linkStrength = Math.min(currentOn, nextOn);
        if (linkStrength <= 0) {
            return;
        }

        const x1 = metrics.centerX + (current.x + current.jitterX) * metrics.scale;
        const y1 = metrics.centerY + (current.y + current.jitterY) * metrics.scale;
        const x2 = metrics.centerX + (next.x + next.jitterX) * metrics.scale;
        const y2 = metrics.centerY + (next.y + next.jitterY) * metrics.scale;
        ctx.strokeStyle = `rgba(${starLink.color}, ${linkStrength * (0.16 + settle * 0.05)})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });
    ctx.restore();
}

function drawStarIgnitePoints(metrics, seconds, progress, settle) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    starIgniteNodes.forEach((node) => {
        const local = easeOutBack(clamp((progress - node.delay) / 0.14, 0, 1));
        if (local <= 0) {
            return;
        }

        const amount = clamp(local, 0, 1);
        const x = metrics.centerX + (node.x + node.jitterX) * metrics.scale;
        const y = metrics.centerY + (node.y + node.jitterY) * metrics.scale;
        const ignition = clamp((0.035 - Math.abs(progress - node.delay)) / 0.035, 0, 1);
        const twinkle = 0.92 + seededNoise(node.seed + 17.2) * 0.08;
        const radius = Math.max(0.58, metrics.scale * (0.72 + seededNoise(node.seed) * 0.92)) * (0.76 + amount * 0.42 + ignition * 0.45);
        const alpha = (0.16 + amount * 0.7 + ignition * 0.24 + settle * 0.05) * twinkle;

        ctx.fillStyle = `rgba(${node.color}, ${alpha})`;
        if (ignition > 0.08) {
            ctx.shadowColor = `rgba(${node.color}, ${alpha * 0.68})`;
            ctx.shadowBlur = radius * (3.4 + ignition * 1.8);
        } else {
            ctx.shadowBlur = 0;
        }
        drawStarIgnitePoint(x, y, radius, amount, ignition);
    });

    ctx.restore();
}

function drawStarIgnitePoint(x, y, radius, amount, ignition) {
    const outer = radius * (1.45 + amount * 0.22 + ignition * 0.9);
    const inner = Math.max(0.42, radius * (0.34 + amount * 0.08));

    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    ctx.lineTo(x + inner, y - inner);
    ctx.lineTo(x + outer, y);
    ctx.lineTo(x + inner, y + inner);
    ctx.lineTo(x, y + outer);
    ctx.lineTo(x - inner, y + inner);
    ctx.lineTo(x - outer, y);
    ctx.lineTo(x - inner, y - inner);
    ctx.closePath();
    ctx.fill();

    if (ignition <= 0.03) {
        return;
    }

    ctx.save();
    ctx.globalAlpha *= 0.18 + ignition * 0.24;
    ctx.lineWidth = Math.max(0.25, radius * 0.18);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.moveTo(x - outer * 1.35, y);
    ctx.lineTo(x + outer * 1.35, y);
    ctx.moveTo(x, y - outer * 1.35);
    ctx.lineTo(x, y + outer * 1.35);
    ctx.stroke();
    ctx.restore();
}

function drawSignalMoireLogo(elapsed) {
    const seconds = elapsed / 1000;
    const progress = clamp(elapsed / 2800, 0, 1);
    const resolve = easeOutCubic(clamp((elapsed - 120) / 1800, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2080) / 620, 0, 1));
    const metrics = getLoaderLogoMetrics();

    drawLoaderBackdrop(metrics, seconds, resolve);
    drawSignalInterference(metrics, seconds, resolve, settle);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    logoCells.forEach((cell, index) => {
        const wave = Math.sin(cell.x * 0.08 + seconds * 2.8) + Math.cos(cell.y * 0.09 - seconds * 2.2);
        const threshold = mix(1.72, -1.9, resolve);
        if (wave < threshold && settle < 0.92) {
            return;
        }

        const local = easeOutCubic(clamp((resolve - seededNoise(index * 2.7) * 0.44) / 0.56, 0, 1));
        if (local <= 0) {
            return;
        }

        const x = metrics.centerX + cell.x * metrics.scale;
        const y = metrics.centerY + cell.y * metrics.scale;
        const length = metrics.scale * (2.8 + seededNoise(index * 9.1) * 5.8);
        const angle = Math.sin(seconds * 1.7 + cell.x * 0.03) * 0.5;
        const alpha = 0.22 + local * 0.68 + settle * 0.08;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = `rgba(${cell.color}, ${alpha})`;
        ctx.lineWidth = Math.max(0.6, metrics.scale * 0.9);
        ctx.beginPath();
        ctx.moveTo(-length * 0.5, 0);
        ctx.lineTo(length * 0.5, 0);
        ctx.stroke();
        ctx.restore();
    });
    ctx.restore();
}

function drawSignalInterference(metrics, seconds, resolve, settle) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i += 1) {
        const y = metrics.top + positiveModulo(i * metrics.height * 0.07 + seconds * metrics.height * 0.08, metrics.height * 1.08) - metrics.height * 0.04;
        const color = i % 2 === 0 ? BLUE : ORANGE;
        ctx.strokeStyle = `rgba(${color}, ${0.055 * resolve * (1 - settle * 0.5)})`;
        ctx.lineWidth = Math.max(0.5, metrics.scale * 0.55);
        ctx.beginPath();
        ctx.moveTo(metrics.left - metrics.width * 0.18, y);
        ctx.bezierCurveTo(metrics.centerX - metrics.width * 0.2, y + Math.sin(seconds + i) * metrics.scale * 10, metrics.centerX + metrics.width * 0.2, y - Math.cos(seconds + i) * metrics.scale * 10, metrics.left + metrics.width * 1.18, y);
        ctx.stroke();
    }
    ctx.restore();
}

function getLoaderLogoMetrics() {
    const logoScale = Math.min(
        width * 0.58 / LOGO_CANVAS_WIDTH,
        height * 0.52 / LOGO_CANVAS_HEIGHT,
        1.35,
    );
    const logoWidth = LOGO_CANVAS_WIDTH * logoScale;
    const logoHeight = LOGO_CANVAS_HEIGHT * logoScale;
    const centerX = width / 2;
    const centerY = height / 2 - Math.min(height * 0.035, 22);

    return {
        centerX,
        centerY,
        height: logoHeight,
        left: centerX - logoWidth / 2,
        scale: logoScale,
        top: centerY - logoHeight / 2,
        width: logoWidth,
    };
}

function drawLoaderBackdrop(metrics, seconds, progress) {
    const radius = Math.max(metrics.width, metrics.height) * 1.05;
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, radius);
    glow.addColorStop(0, `rgba(${BLUE}, ${0.08 + progress * 0.12})`);
    glow.addColorStop(0.55, `rgba(${ORANGE}, ${0.04 + progress * 0.08})`);
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - radius, metrics.centerY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 0.08 + progress * 0.08;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    for (let i = 0; i < 4; i += 1) {
        const y = metrics.centerY + (i - 1.5) * metrics.height * 0.24 + Math.sin(seconds * 0.75 + i) * metrics.scale * 1.5;
        ctx.beginPath();
        ctx.moveTo(metrics.left - metrics.width * 0.24, y);
        ctx.lineTo(metrics.left + metrics.width * 1.24, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawLogoGhost(metrics, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = 'grayscale(1) brightness(1.4)';
    ctx.drawImage(getSchoolLogoCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function drawBinaryResolveLogo(elapsed) {
    const seconds = elapsed / 1000;
    const progress = clamp(elapsed / 2850, 0, 1);
    const resolve = easeOutCubic(clamp((elapsed - 620) / 1880, 0, 1));
    const settle = easeOutCubic(clamp((elapsed - 2140) / 620, 0, 1));
    const metrics = getFlowLogoMetrics();

    drawBinaryBackdrop(metrics, seconds, progress, resolve);
    drawBinaryCells(metrics, seconds, progress, resolve, settle);
    drawBinaryScan(metrics, seconds, resolve, settle);
    drawBinaryFinalGlow(metrics, settle);
}

function drawBinaryBackdrop(metrics, seconds, progress, resolve) {
    const backgroundFade = easeOutCubic(clamp(progress / 0.34, 0, 1));
    const radius = Math.max(metrics.width, metrics.height) * 0.9;
    const glow = ctx.createRadialGradient(metrics.centerX, metrics.centerY, 0, metrics.centerX, metrics.centerY, radius);
    glow.addColorStop(0, `rgba(${BLUE}, ${(0.1 + resolve * 0.07) * backgroundFade})`);
    glow.addColorStop(0.58, `rgba(${ORANGE}, ${(0.05 + resolve * 0.04) * backgroundFade})`);
    glow.addColorStop(1, 'rgba(3, 3, 6, 0)');

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(metrics.centerX - radius, metrics.centerY - radius, radius * 2, radius * 2);
    ctx.font = `900 ${Math.max(8, metrics.scale * 5.8)}px "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (resolve < 0.96) {
        ctx.globalAlpha = backgroundFade * (0.06 + (1 - resolve) * 0.08);
        for (let row = 0; row < 5; row += 1) {
            for (let col = 0; col < 15; col += 1) {
            const seed = row * 97 + col * 31;
            const symbol = BINARY_GLITCH_SYMBOLS[Math.floor(seededNoise(seed + Math.floor(seconds * 6)) * BINARY_GLITCH_SYMBOLS.length)];
            const x = metrics.left - metrics.width * 0.08 + col * metrics.width / 13.5;
            const y = metrics.top + metrics.height * (0.18 + row * 0.14);
            ctx.fillStyle = binaryGradientColor(x, metrics, 0.42 + resolve * 0.12);
            ctx.fillText(symbol, x, y);
            }
        }
    }
    ctx.restore();
}

function drawBinaryCells(metrics, seconds, progress, resolve, settle) {
    const fontSize = Math.max(8, metrics.scale * 6.4);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(0.35, fontSize * 0.055);

    binaryCells.forEach((cell) => {
        const local = clamp((progress - cell.delay) / 0.42, 0, 1);
        const ghost = clamp((progress + 0.12 - cell.delay) / 0.18, 0, 1);
        if (ghost <= 0) {
            return;
        }

        const x = metrics.centerX + cell.x * metrics.scale;
        const y = metrics.centerY + cell.y * metrics.scale;
        const symbol = local < 0.78
            ? BINARY_GLITCH_SYMBOLS[Math.floor(seededNoise(cell.glitchSeed + Math.floor(seconds * 10)) * BINARY_GLITCH_SYMBOLS.length)]
            : cell.bit;
        const finalAlpha = 0.22 + local * 0.62 + settle * 0.22;
        const alpha = ghost * finalAlpha;
        const color = local < 0.78
            ? binaryGradientColor(x, metrics, alpha * (0.55 + resolve * 0.25))
            : binaryGradientColor(x, metrics, alpha);

        ctx.strokeStyle = binaryGradientColor(x, metrics, alpha * 0.54);
        ctx.fillStyle = color;
        ctx.strokeText(symbol, x, y);
        ctx.fillText(symbol, x, y);
    });
    ctx.restore();
}

function drawBinaryScan(metrics, seconds, resolve, settle) {
    const scanX = metrics.left + ((seconds * 130) % (metrics.width + 120)) - 60;
    const gradient = ctx.createLinearGradient(scanX - 72, metrics.top, scanX + 72, metrics.top + metrics.height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.48, `rgba(${BLUE}, ${0.18 + resolve * 0.18})`);
    gradient.addColorStop(0.58, `rgba(${ORANGE}, ${0.16 + resolve * 0.16})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 * (1 - settle * 0.35);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(1, metrics.scale * 2.2);
    ctx.beginPath();
    ctx.moveTo(scanX, metrics.top - metrics.height * 0.08);
    ctx.lineTo(scanX + 80 * metrics.scale, metrics.top + metrics.height * 1.08);
    ctx.stroke();
    ctx.restore();
}

function binaryGlitchColor(cell, alpha) {
    const amount = seededNoise(cell.glitchSeed + 9);
    if (amount > 0.66) {
        return `rgba(235, 242, 255, ${alpha})`;
    }
    return amount > 0.33 ? `rgba(${BLUE}, ${alpha})` : `rgba(${ORANGE}, ${alpha})`;
}

function binaryGradientColor(x, metrics, alpha) {
    const amount = clamp((x - metrics.left) / Math.max(1, metrics.width), 0, 1);
    const midpoint = 0.52;
    const local = amount < midpoint ? amount / midpoint : (amount - midpoint) / (1 - midpoint);
    const start = amount < midpoint ? [82, 95, 255] : [136, 82, 168];
    const end = amount < midpoint ? [136, 82, 168] : [255, 90, 31];
    const r = Math.round(mix(start[0], end[0], local));
    const g = Math.round(mix(start[1], end[1], local));
    const b = Math.round(mix(start[2], end[2], local));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawBinaryFinalGlow(metrics, settle) {
    if (settle <= 0.04) {
        return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = settle * 0.1;
    ctx.filter = `blur(${Math.max(0.8, metrics.scale * 1.1)}px)`;
    ctx.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    ctx.restore();
}

function drawAsciiSweep(elapsed) {
    const seconds = elapsed / 1000;
    const scale = Math.min(width * 0.58 / LOGO_CANVAS_WIDTH, height * 0.62 / LOGO_CANVAS_HEIGHT);
    const centerX = width / 2;
    const centerY = height / 2;
    const reveal = (elapsed % 2600) / 2600;
    const threshold = -LOGO_CANVAS_WIDTH * 0.58 + reveal * (LOGO_CANVAS_WIDTH + LOGO_CANVAS_HEIGHT) * 1.25;
    const bandWidth = 32;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 6;

    starCells.forEach((cell) => {
        const diagonal = cell.x + cell.y;
        const distance = threshold - diagonal;
        if (distance < -bandWidth) {
            return;
        }

        const settled = distance > bandWidth;
        const band = clamp((distance + bandWidth) / (bandWidth * 2), 0, 1);
        const alpha = settled ? 0.96 : band * 0.98;
        const jitter = settled ? 0 : Math.sin(seconds * 20 + cell.x * 0.1 + cell.y * 0.07) * (1 - band) * 8;
        const x = centerX + cell.x * scale + jitter;
        const y = centerY + cell.y * scale - jitter * 0.35;
        const label = cell.label || cell.char;
        const fontSize = Math.max(8, scale * 4.2);
        const color = `rgba(${cell.color}, ${alpha})`;
        const glowColor = `rgba(${cell.color}, ${alpha * 0.72})`;

        ctx.font = `900 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = color;
        ctx.fillText(label, x, y);
    });

    const scanX = centerX + (threshold - LOGO_CANVAS_HEIGHT * 0.05) * scale;
    const scanY = centerY + (threshold - LOGO_CANVAS_WIDTH * 0.45) * scale;
    const gradient = ctx.createLinearGradient(scanX - 160, scanY - 160, scanX + 160, scanY + 160);
    gradient.addColorStop(0, 'rgba(48, 32, 255, 0)');
    gradient.addColorStop(0.48, 'rgba(48, 32, 255, 0.7)');
    gradient.addColorStop(0.52, 'rgba(255, 90, 31, 0.74)');
    gradient.addColorStop(1, 'rgba(255, 90, 31, 0)');
    ctx.globalAlpha = 0.48;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scanX - 260, scanY - 260);
    ctx.lineTo(scanX + 260, scanY + 260);
    ctx.stroke();
    ctx.restore();
}

function drawAiAsciiGlitch(elapsed) {
    const seconds = elapsed / 1000;
    const cycleMs = 4800;
    const cycle = (elapsed % cycleMs) / cycleMs;
    const expandProgress = easeInOutCubic(clamp(cycle / 0.36, 0, 1));
    const resolveProgress = easeOutCubic(clamp((cycle - 0.08) / 0.58, 0, 1));
    const scale = Math.min(width / 920, height / 500);
    const centerX = width / 2;
    const centerY = height / 2 - 6 * scale;
    const bandWidth = Math.min(width * 1.1, 1080 * scale);
    const bandHeight = Math.min(height * 0.42, 300 * scale);
    const visibleHeight = mix(18 * scale, bandHeight, expandProgress);
    const bandX = centerX - bandWidth / 2;
    const bandY = centerY - bandHeight / 2;
    const visibleY = centerY - visibleHeight / 2;
    const logoMetrics = getLogoSignalMetrics(centerX, centerY, scale, bandHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(bandX, visibleY, bandWidth, visibleHeight);
    ctx.clip();
    drawWordBandBackplate(seconds, bandX, visibleY, bandWidth, visibleHeight, scale);
    drawAiWordField(ctx, seconds, resolveProgress, scale, bandX, bandY, bandWidth, bandHeight);
    drawLogoMaskedWordGlow(seconds, resolveProgress, scale, bandX, bandY, bandWidth, bandHeight, logoMetrics);
    drawWordFieldScan(seconds, scale, bandX, visibleY, bandWidth, visibleHeight, expandProgress);
    ctx.restore();
}

function drawAiWordField(context, seconds, progress, scale, bandX, bandY, bandWidth, bandHeight, options = {}) {
    const fontSize = Math.max(8, scale * 12.6);
    const rowGap = bandHeight / Math.max(1, wordRows.length + 1);
    const settleAlpha = 0.26 + progress * 0.42;
    const columnReveal = easeOutCubic(progress);
    const glow = options.glow === true;

    context.save();
    context.font = `800 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
    context.textBaseline = 'middle';
    context.shadowBlur = glow ? 12 : 6;

    wordRows.forEach((row, rowIndex) => {
        const y = bandY + (rowIndex + 1) * rowGap + Math.sin(seconds * 0.9 + rowIndex) * (0.5 + 1.2 * (1 - progress)) * scale;
        const centerDistance = Math.abs(rowIndex - (wordRows.length - 1) / 2) / Math.max(1, wordRows.length / 2);
        const revealDelay = centerDistance * 0.18 + rowIndex / wordRows.length * 0.08;
        const rowAlpha = clamp((progress - revealDelay) / 0.36, 0, 1);
        const clipRight = bandX + bandWidth * (0.04 + columnReveal * 1.04);
        const gap = (8 + (rowIndex % 3) * 3) * scale;
        const displayWords = row.words.map((word) => {
            const displayText = progress < 0.72
                ? glitchWord(word.text, (1 - progress) * 0.5, seconds + word.seed)
                : word.text;
            return {
                ...word,
                displayText,
                width: context.measureText(displayText).width,
            };
        });
        const trackWidth = displayWords.reduce((sum, word) => sum + word.width + gap, 0);
        let x = bandX - positiveModulo(row.offset + seconds * row.speed * row.direction, trackWidth);

        while (x > bandX - trackWidth) {
            x -= trackWidth;
        }

        while (x < bandX + bandWidth + gap) {
            for (const [wordIndex, word] of displayWords.entries()) {
                if (x > bandX + bandWidth + gap) {
                    break;
                }

                const alpha = (word.bright ? 0.84 : settleAlpha) * rowAlpha;
                const jitter = (1 - progress) * Math.sin(seconds * 4 + word.seed) * 1.8 * scale;

                if (x < clipRight && x + word.width > bandX - gap) {
                    const color = glow
                        ? logoGlowWordColor(x + word.width * 0.5, bandX, bandWidth, Math.min(1, alpha * 1.18))
                        : wordGradientColor(x + word.width * 0.5, bandX, bandWidth, alpha, word.bright);
                    context.shadowColor = glow
                        ? logoGlowWordColor(x + word.width * 0.5, bandX, bandWidth, Math.min(1, alpha * 0.64))
                        : wordGradientColor(x + word.width * 0.5, bandX, bandWidth, alpha * 0.46, true);
                    context.fillStyle = color;
                    context.fillText(word.displayText, x, y + jitter);
                }

                x += word.width + gap;
            }
        }
    });
    context.restore();
}

function drawLogoMaskedWordGlow(seconds, progress, scale, bandX, bandY, bandWidth, bandHeight, metrics) {
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.ceil(width));
    layer.height = Math.max(1, Math.ceil(height));
    const layerContext = layer.getContext('2d');

    drawAiWordField(layerContext, seconds, progress, scale, bandX, bandY, bandWidth, bandHeight, {glow: true});

    layerContext.save();
    layerContext.globalCompositeOperation = 'destination-in';
    layerContext.drawImage(createLogoMaskCanvas(), metrics.left, metrics.top, metrics.width, metrics.height);
    layerContext.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 + progress * 0.16;
    ctx.filter = `blur(${Math.max(0.8, 1.7 * metrics.scale)}px) drop-shadow(0 0 ${Math.max(2, 5 * metrics.scale)}px rgba(82, 95, 255, 0.5))`;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.filter = `drop-shadow(0 0 ${Math.max(2, 6 * metrics.scale)}px rgba(255, 90, 31, 0.5))`;
    ctx.globalAlpha = 0.68 + progress * 0.16;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.restore();
}

function drawWordFieldScan(seconds, scale, bandX, bandY, bandWidth, bandHeight, progress) {
    const scan = (seconds * 0.62) % 1;
    const y = bandY + scan * bandHeight;
    ctx.save();
    ctx.globalAlpha = 0.12 + progress * 0.08;
    ctx.strokeStyle = 'rgba(82, 95, 255, 0.62)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bandX, y);
    ctx.lineTo(bandX + bandWidth, y);
    ctx.stroke();

    const cutX = bandX + ((seconds * 210) % (bandWidth + 180)) - 90;
    const gradient = ctx.createLinearGradient(cutX - 90, bandY, cutX + 110, bandY + bandHeight);
    gradient.addColorStop(0, 'rgba(82, 95, 255, 0)');
    gradient.addColorStop(0.42, 'rgba(82, 95, 255, 0.5)');
    gradient.addColorStop(0.58, 'rgba(255, 90, 31, 0.42)');
    gradient.addColorStop(1, 'rgba(255, 90, 31, 0)');
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(cutX, bandY);
    ctx.lineTo(cutX + 150 * scale, bandY + bandHeight);
    ctx.stroke();
    ctx.restore();
}

function drawWordBandBackplate(seconds, bandX, bandY, bandWidth, bandHeight, scale) {
    const gradient = ctx.createLinearGradient(bandX, bandY, bandX + bandWidth, bandY);
    gradient.addColorStop(0, 'rgba(34, 44, 132, 0.56)');
    gradient.addColorStop(0.38, 'rgba(35, 24, 88, 0.64)');
    gradient.addColorStop(0.64, 'rgba(72, 28, 58, 0.56)');
    gradient.addColorStop(1, 'rgba(128, 48, 18, 0.56)');

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(bandX, bandY, bandWidth, bandHeight);

    const pulseY = bandY + bandHeight * (0.5 + Math.sin(seconds * 2.2) * 0.38);
    const pulse = ctx.createLinearGradient(bandX, pulseY - 30 * scale, bandX, pulseY + 30 * scale);
    pulse.addColorStop(0, 'rgba(255, 255, 255, 0)');
    pulse.addColorStop(0.48, 'rgba(82, 95, 255, 0.08)');
    pulse.addColorStop(0.62, 'rgba(255, 90, 31, 0.07)');
    pulse.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = pulse;
    ctx.fillRect(bandX, bandY, bandWidth, bandHeight);
    ctx.restore();
}

function getLogoSignalMetrics(centerX, centerY, scale, bandHeight) {
    const logoScale = Math.min(
        width * 0.58 / LOGO_CANVAS_WIDTH,
        bandHeight * 1.1 / LOGO_CANVAS_HEIGHT,
        1.1,
    );
    const logoWidth = LOGO_CANVAS_WIDTH * logoScale;
    const logoHeight = LOGO_CANVAS_HEIGHT * logoScale;

    return {
        height: logoHeight,
        left: centerX - logoWidth / 2,
        scale: logoScale || scale,
        top: centerY - logoHeight / 2 + 3 * scale,
        width: logoWidth,
    };
}

function createLogoMaskCanvas() {
    if (logoMaskCanvas) {
        return logoMaskCanvas;
    }

    logoMaskCanvas = document.createElement('canvas');
    logoMaskCanvas.width = LOGO_CANVAS_WIDTH;
    logoMaskCanvas.height = LOGO_CANVAS_HEIGHT;
    const maskContext = logoMaskCanvas.getContext('2d');
    drawSchoolAiLogo(maskContext);
    return logoMaskCanvas;
}

function getSchoolLogoCanvas() {
    if (schoolLogoCanvas) {
        return schoolLogoCanvas;
    }

    schoolLogoCanvas = document.createElement('canvas');
    schoolLogoCanvas.width = LOGO_CANVAS_WIDTH;
    schoolLogoCanvas.height = LOGO_CANVAS_HEIGHT;
    const logoContext = schoolLogoCanvas.getContext('2d');
    drawSchoolAiLogo(logoContext);
    return schoolLogoCanvas;
}

function wordGradientColor(x, bandX, bandWidth, alpha, bright) {
    const t = clamp((x - bandX) / Math.max(1, bandWidth), 0, 1);
    const bias = bright ? 0.1 : 0;
    const from = [82, 95, 255];
    const mid = [134, 62, 170];
    const to = [255, 90, 31];
    const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const start = t < 0.5 ? from : mid;
    const end = t < 0.5 ? mid : to;
    const rBase = mix(start[0], end[0], local);
    const gBase = mix(start[1], end[1], local);
    const bBase = mix(start[2], end[2], local);
    const r = Math.round(rBase + (255 - rBase) * bias);
    const g = Math.round(gBase + (255 - gBase) * bias);
    const b = Math.round(bBase + (255 - bBase) * bias);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function logoGlowWordColor(x, bandX, bandWidth, alpha) {
    const t = clamp((x - bandX) / Math.max(1, bandWidth), 0, 1);
    const r = Math.round(mix(114, 255, t));
    const g = Math.round(mix(138, 132, t));
    const b = Math.round(mix(255, 58, t));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function starGradientColor(x, y, alpha, boost) {
    const xAmount = clamp((x + LOGO_CANVAS_WIDTH / 2) / LOGO_CANVAS_WIDTH, 0, 1);
    const yAmount = clamp((y + LOGO_CANVAS_HEIGHT / 2) / LOGO_CANVAS_HEIGHT, 0, 1);
    const amount = clamp(xAmount * 0.86 + yAmount * 0.14, 0, 1);
    const highlight = boost + Math.max(0, 0.45 - Math.abs(yAmount - 0.42)) * 0.04;
    const r = Math.round(mix(82, 255, amount) + (255 - mix(82, 255, amount)) * highlight);
    const g = Math.round(mix(95, 90, amount) + (255 - mix(95, 90, amount)) * highlight);
    const b = Math.round(mix(255, 31, amount) + (255 - mix(255, 31, amount)) * highlight);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function brightenRgb(rgb, amount) {
    const channels = rgb.split(',').map((value) => Number(value.trim()));
    return channels.map((channel) => Math.round(channel + (255 - channel) * amount)).join(', ');
}

function glitchWord(text, amount, seed) {
    const threshold = amount * 0.72;
    return Array.from(text).map((letter, index) => {
        if (letter === ' ' || seededNoise(seed + index * 11.7) > threshold) {
            return letter;
        }
        return GLITCH_CHARS[Math.floor(seededNoise(seed * 2.1 + index * 19.3) * GLITCH_CHARS.length)];
    }).join('');
}

function seededNoise(value) {
    const sine = Math.sin(value * 12.9898) * 43758.5453;
    return sine - Math.floor(sine);
}

function positiveModulo(value, base) {
    return ((value % base) + base) % base;
}

function mix(start, end, amount) {
    return start + (end - start) * amount;
}

function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value) {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutBack(value) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

resizeCanvas();
setMode(mode);
animationFrame = requestAnimationFrame(tick);

return () => {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    resizeObserver.disconnect();
};
}


export class InitialLoadingScreenClass {
    private isLoading: boolean | null = true;

    private loadingScreenElement: HTMLElement | null;
    private loadingAnimationElement: HTMLElement | null;
    private loadingCanvasElement: HTMLCanvasElement | null;

    private initialLoadingScreenCSS: HTMLLinkElement | null;
    private startTime: number | null = null;
    private destroyFallbackTimer: number | null = null;
    private stopShowcaseAnimation: (() => void) | null = null;

    constructor() {
        this.loadingScreenElement = document.getElementById('initialPageLoadingScreen');
        this.loadingAnimationElement = document.getElementById('initialPageLoadingAnimation');
        this.loadingCanvasElement = document.getElementById('initialPageLoadingLogoCanvas') as HTMLCanvasElement | null;
        this.initialLoadingScreenCSS = document.getElementById('initialLoadingScreenCSS') as HTMLLinkElement | null;

        this.handleAnimationEndEvent = this.handleAnimationEndEvent.bind(this);

        this.init();
    }

    private init() {
        if (isDesktopApp()) {
            this.destroy();
            return;
        }

        this.addAnimationEndListener();
        this.start();
    }

    private handleAnimationEndEvent(event: AnimationEvent) {
        if (!this.loadingAnimationElement) {
            return;
        }

        if (event.animationName === ANIMATION_CLASS_FOR_MATTERMOST_LOGO_HIDE || event.animationName === ANIMATION_CLASS_FOR_COMPLETE_LOADER_HIDE) {
            if (!this.isLoading) {
                this.loadingAnimationElement.className = STATIC_CLASS_FOR_ANIMATION;

                window.setTimeout(() => {
                    this.destroy();
                }, DESTROY_DELAY_AFTER_ANIMATION_END);
            }
        }
    }

    private addAnimationEndListener() {
        if (this.loadingAnimationElement) {
            this.loadingAnimationElement.addEventListener('animationend', this.handleAnimationEndEvent);
        }
    }

    private removeAnimationEndListener() {
        if (this.loadingAnimationElement) {
            this.loadingAnimationElement.removeEventListener('animationend', this.handleAnimationEndEvent);
        }
    }

    private startLogoAnimation() {
        if (!this.loadingCanvasElement || !this.loadingAnimationElement) {
            return;
        }

        const requestedMode = new URLSearchParams(window.location.search).get('loading_mode');
        const selectedMode = LOADING_MODES.includes(requestedMode) ? requestedMode : LOADING_MODES[Math.floor(Math.random() * LOADING_MODES.length)];

        this.loadingAnimationElement.dataset.loadingMode = selectedMode;
        this.stopLogoAnimation();
        this.stopShowcaseAnimation = createShowcaseLogoLoading(this.loadingCanvasElement, selectedMode);
    }

    private stopLogoAnimation() {
        if (this.stopShowcaseAnimation) {
            this.stopShowcaseAnimation();
            this.stopShowcaseAnimation = null;
        }
    }

    private destroy() {
        this.stopLogoAnimation();

        if (this.destroyFallbackTimer) {
            window.clearTimeout(this.destroyFallbackTimer);
            this.destroyFallbackTimer = null;
        }

        this.removeAnimationEndListener();

        if (this.loadingScreenElement) {
            this.loadingScreenElement.remove();
            this.loadingScreenElement = null;
        }

        if (this.initialLoadingScreenCSS) {
            this.initialLoadingScreenCSS.remove();
            this.initialLoadingScreenCSS = null;
        }

        this.loadingAnimationElement = null;
        this.loadingCanvasElement = null;
        this.isLoading = null;
    }

    public start() {
        if (!this.loadingScreenElement || !this.loadingAnimationElement) {
            // eslint-disable-next-line no-console
            console.error('InitialLoadingScreen: No loading screen or animation element found');
            return;
        }

        this.isLoading = true;
        this.startTime = Date.now();

        this.loadingScreenElement.className = LOADING_CLASS_FOR_SCREEN;
        this.loadingAnimationElement.className = LOADING_CLASS_FOR_ANIMATION;
        this.startLogoAnimation();
    }

    public stop(pageType: string) {
        if (!this.loadingScreenElement || !this.loadingAnimationElement) {
            return;
        }

        measureAndReport({
            name: Measure.SplashScreen,
            startMark: 0,
            canFail: false,
            labels: {
                page_type: pageType,
            },
        });

        const elapsedTime = this.startTime ? Date.now() - this.startTime : 0;
        const remainingTime = Math.max(0, MINIMUM_LOADING_TIME - elapsedTime);

        window.setTimeout(() => {
            if (!this.loadingScreenElement || !this.loadingAnimationElement) {
                return;
            }

            this.isLoading = false;
            this.loadingScreenElement.className = LOADING_COMPLETE_CLASS_FOR_SCREEN;
            this.loadingAnimationElement.className = LOADING_COMPLETE_CLASS_FOR_ANIMATION;

            this.destroyFallbackTimer = window.setTimeout(() => {
                this.destroy();
            }, DESTROY_DELAY_AFTER_ANIMATION_END + 500);
        }, remainingTime);
    }
}
