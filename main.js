"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let canvas;
let context;
let device;
let frameTimes = [];
let loop = false;
let pipeline;
let program;
let tick = 0;
let bindGroup;
let resolutionBuffer;
let cameraPosBuffer;
let cameraLookAtBuffer;
let camera = {
    x: () => 4 * Math.sin(tick / 100),
    y: () => 0.9,
    z: () => 4 * Math.cos(tick / 100),
};
const F32_SIZE = 4;
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const adapter = yield navigator.gpu.requestAdapter();
        if (adapter == null) {
            throw "no adapter";
        }
        device = yield adapter.requestDevice();
        canvas = document.getElementById("canvas");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const contextOrNull = canvas.getContext("webgpu");
        if (contextOrNull == null) {
            throw "no webgpu";
        }
        else {
            context = contextOrNull;
        }
        document.body.onkeydown = function (e) {
            if (e.key == " " || e.code == "Space")
                loop = !loop;
        };
        yield initProgram();
        renderLoop();
        render();
    });
}
function initProgram() {
    return __awaiter(this, void 0, void 0, function* () {
        let vertexShaderText = yield fetch("square.vert.wgsl")
            .then((response) => response.text())
            .catch(() => {
            throw "cannot load square.vert.wgsl";
        });
        let fragmentShaderText = yield fetch("raytracing.frag.wgsl")
            .then((response) => response.text())
            .catch(() => {
            throw "cannot load raytracing.frag.wgsl";
        });
        let stopwatch = Date.now();
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format: presentationFormat,
            alphaMode: "premultiplied",
        });
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
            ],
        });
        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });
        pipeline = device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: device.createShaderModule({
                    code: vertexShaderText,
                }),
                entryPoint: "main",
            },
            fragment: {
                module: device.createShaderModule({
                    code: fragmentShaderText,
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: presentationFormat,
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
            },
        });
        resolutionBuffer = device.createBuffer({
            size: 2 * F32_SIZE,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        cameraPosBuffer = device.createBuffer({
            size: 3 * F32_SIZE,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        cameraLookAtBuffer = device.createBuffer({
            size: 3 * F32_SIZE,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        const iterationBuffer = device.createBuffer({
            size: F32_SIZE,
            //usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
            //type: "storage",
        });
        const collectionBuffer = device.createBuffer({
            size: F32_SIZE,
            //usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
            //type: "storage",
        });
        bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: resolutionBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: cameraPosBuffer,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: cameraLookAtBuffer,
                    },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: iterationBuffer,
                    },
                },
                {
                    binding: 4,
                    resource: {
                        buffer: collectionBuffer,
                    },
                },
            ],
        });
        console.log(`Time to compile: ${Date.now() - stopwatch} ms`);
    });
}
function render() {
    tick += 0.5;
    device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([canvas.width, canvas.height]));
    device.queue.writeBuffer(cameraPosBuffer, 0, new Float32Array([camera.x(), camera.y(), camera.z()]));
    device.queue.writeBuffer(cameraLookAtBuffer, 0, new Float32Array([0, 0, 0]));
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPassDescriptor = {
        colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
            },
        ],
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup); // @group(0)
    passEncoder.draw(3, 1, 0, 0);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}
function renderLoop() {
    if (loop) {
        tickFPSMeter();
        render();
    }
    requestAnimationFrame(renderLoop);
}
function tickFPSMeter() {
    let now = Date.now() * 0.001;
    const deltaTime = now - (frameTimes[0] || now);
    const fps = (1 / deltaTime) * frameTimes.length;
    frameTimes.push(now);
    if (frameTimes.length > 60)
        frameTimes.shift();
}
