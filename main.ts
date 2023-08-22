let canvas: HTMLCanvasElement;
let context: GPUCanvasContext;
let device: GPUDevice;
let frameTimes: GLfloat[] = [];
let loop: Boolean = false;
let pipeline: GPURenderPipeline;
let program;
let tick = 1;
let bindGroup: GPUBindGroup;
let bufferLocations: Record<string, GPUBuffer>;
let textureLocations: Record<string, GPUTexture>;
let previousFrameView: GPUTextureView;
let currentFrameView: GPUTextureView;
let camera = {
  x: () => 0,
  y: () => 0,
  z: () => 3,
};

const F16_ALIGNMENT = 2;
const F32_ALIGNMENT = 4;
const VEC2_ALIGNMENT = 8;
const VEC3_ALIGNMENT = 16;
// largest item is taken foor an alignment
const materialInShaderSize = 2 * VEC3_ALIGNMENT;
const sphereInShaderSize = 2 * VEC3_ALIGNMENT;
const triangleInShaderSize = 3 * VEC3_ALIGNMENT;

class Triangle{
  p0: number[];
  p1: number[];
  p2: number[];
  material: string;
  constructor(p0: number[], p1: number[], p2: number[], material: string){
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.material = material;
  }
  toAlignedArray = () => [...this.p0, 0, ...this.p1, 0, ...this.p2, materialNameToNumber(this.material)]
}

class Sphere{
    center: number[];
    radius: number;
    material: string;
  constructor(center: number[], radius: number, material: string){
    this.center = center;
    this.radius = radius;
    this.material = material;
  }
  toAlignedArray = () => [...this.center, this.radius, materialNameToNumber(this.material), 0, 0, 0]
}

class Material{
  color: number[];
  reflection: number;
  refraction: number;
  texture: number; // -1 is no texture
  emissive: number; // 0 = non emisive
  constructor(color: number[], reflection: number, refraction: number, texture: number, emissive: number){
    this.color = color;
    this.reflection = reflection;
    this.refraction = refraction;
    this.texture = texture;
    this.emissive = emissive;
  }
  toAlignedArray = () => [...this.color, this.reflection, this.refraction, this.texture, this.emissive, 0]
}

function materialNameToNumber(materialName: string){
  return Object.keys(materials).indexOf(materialName)
}

const materials: Record<string, Material> = {
  ground:       new Material([  0.3,   0.3,   0.3],       0.0,       0.0,   0, 0),
  glass:        new Material([  1.0,   1.0,   1.0],       1.0,       1.5,  -1, 0),
  metal:        new Material([  1.0,   1.0,   1.0],       1.0,       0.0,  -1, 0),
  roughtMetal:  new Material([  1.0,   1.0,   1.0],       0.3,       0.0,  -1, 0),
  solidIndigo:  new Material([  0.3,   0.0,   0.5],       0.0,       0.0,  -1, 0),
  solidGreen:   new Material([  0.0,   1.0,   0.0],       0.0,       0.0,  -1, 0),
  solidRed:     new Material([  1.0,   0.0,   0.0],       0.0,       0.0,  -1, 0),
  solidBlue:    new Material([  0.0,   0.0,   1.0],       0.0,       0.0,  -1, 0),
  solidYellow:  new Material([  1.0,   1.0,   0.0],       0.0,       0.0,  -1, 0),
  solidWhite:   new Material([  1.0,   1.0,   1.0],       0.0,       0.0,  -1, 0),
  cornellRed:   new Material([  .65,  0.05,  0.05],         0,       0.0,  -1, 0),
  cornellGreen: new Material([  .12,   .45,   .15],         0,       0.0,  -1, 0),
  cornellWhite: new Material([  .73,   .73,   .73],         0,       0.0,  -1, 0),
  weakLight:    new Material([  0.2,   0.2,   0.2],       0.0,       0.0,  -1, 1),
  light:        new Material([ 10.0,  10.0,  10.0],       0.0,       0.0,  -1, 1),
  strongLight:  new Material([100.0, 100.0, 100.0],       0.0,       0.0,  -1, 1),
  glowOrange:   new Material([  1.7,   0.6,  0.01],       0.0,       0.0,  -1, 1),
};
const sphereLights = [
    new Sphere([0,1.9,0],  0.02, "weakLight"),
];
const spheres = [
	new Sphere([-.4, -.7, 0], .3, "glass"),
	new Sphere([ .4, -.7, 0], .3, "metal"),
];
const triangles = [
  new Triangle([-1, 1, 1],[-1,-1, 1], [-1, 1,-1], "cornellGreen"),
	new Triangle([-1,-1, 1],[-1,-1,-1], [-1, 1,-1], "cornellGreen"),
	new Triangle([ 1, 1, 1],[ 1, 1,-1], [ 1,-1, 1], "cornellRed"),
  new Triangle([ 1,-1, 1],[ 1, 1,-1], [ 1,-1,-1], "cornellRed"),
	new Triangle([ 1,-1,-1],[ 1, 1,-1], [-1, 1,-1], "cornellWhite"),
	new Triangle([-1,-1,-1],[ 1,-1,-1], [-1, 1,-1], "cornellWhite"),
	new Triangle([-1,-1, 1],[ 1,-1,-1], [-1,-1,-1], "cornellWhite"),
	new Triangle([ 1,-1,-1],[-1,-1, 1], [ 1,-1, 1], "cornellWhite"),
	new Triangle([-1, 1, 1],[-1, 1,-1], [ 1, 1,-1], "cornellWhite"),
  new Triangle([ 1, 1,-1],[ 1, 1, 1], [-1, 1, 1], "cornellWhite"),
];
const triangleLights = [
	new Triangle([-.3, .99, .3], [-.3, .99,-.3], [ .3, .99,-.3], "weakLight"),
	new Triangle([ .3, .99,-.3], [ .3, .99, .3], [-.3, .99, .3], "weakLight"),
];

async function init() {
  const adapter =
    (await navigator.gpu.requestAdapter()) ?? throwExpression("no adapter");

  device = await adapter.requestDevice();

  canvas = <HTMLCanvasElement>document.getElementById("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  context = canvas.getContext("webgpu") ?? throwExpression("no context");

  await initProgram();
  
  window.addEventListener("keydown", startStopLoop);
  window.addEventListener("keydown", clearFrame);
  window.addEventListener("keydown", nextFrame);
  window.addEventListener("resize", resizeCanvas);

  renderLoop();
  render();
}

async function initProgram() {
  let vertexShaderText = await fetch("square.vert.wgsl")
    .then((response) => response.text())
    .catch(() => {
      throw "cannot load square.vert.wgsl";
    });

  let fragmentShaderText = await fetch("raytracing.frag.wgsl")
    .then((response) => response.text())
    .catch(() => {
      throw "cannot load raytracing.frag.wgsl";
    });

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  // Create buffers
  bufferLocations = createBuffers(device);

  textureLocations = {
    previousFrameBuffer: device.createTexture({
      size: [canvas.width, canvas.height],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      format: "rgba32float",
    }),
    currentFrameBuffer: device.createTexture({
      size: [canvas.width, canvas.height],
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
      format: "rgba32float",
    }),
  };

  previousFrameView = textureLocations.previousFrameBuffer.createView();
  currentFrameView = textureLocations.currentFrameBuffer.createView();

  // Create bind group

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
        texture: {
          sampleType: "unfilterable-float",
        },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        storageTexture: {
          format: "rgba32float",
        },
      },      
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", minBindingSize: 0 },
      },      
      {
        binding: 7,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", minBindingSize: 0 },
      },
      {
        binding: 8,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", minBindingSize: 0 },
      },      
      {
        binding: 9,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", minBindingSize: 0 },
      },      
      {
        binding: 10,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", minBindingSize: 0 },
      },  
    ],
  });

  bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: bufferLocations.resolutionBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: bufferLocations.cameraPosBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: bufferLocations.cameraLookAtBuffer,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: bufferLocations.iterationBuffer,
        },
      },
      {
        binding: 4,
        resource: previousFrameView,
      },
      {
        binding: 5,
        resource: currentFrameView,
      },
      {
        binding: 6,
        resource: {
          buffer: bufferLocations.materials,
        }
      },
      {
        binding: 7,
        resource: {
          buffer: bufferLocations.spheres,
        }
      },
      {
        binding: 8,
        resource: {
          buffer: bufferLocations.sphereLights,
        }
      },
      {
        binding: 9,
        resource: {
          buffer: bufferLocations.triangles,
        }
      },
      {
        binding: 10,
        resource: {
          buffer: bufferLocations.triangleLights,
        }
      },
    ],
  });

  putGeometryIntoBuffers(device);

  // Create pipeline

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
}

function render() {
  device.queue.writeBuffer(
    bufferLocations.resolutionBuffer,
    0,
    new Float32Array([canvas.width, canvas.height])
  );
  device.queue.writeBuffer(
    bufferLocations.cameraPosBuffer,
    0,
    new Float32Array([camera.x(), camera.y(), camera.z()])
  );
  device.queue.writeBuffer(
    bufferLocations.cameraLookAtBuffer,
    0,
    new Float32Array([0, 0, 0])
  );
  device.queue.writeBuffer(
    bufferLocations.iterationBuffer,
    0,
    new Float32Array([tick])
  );

  const commandEncoder = device.createCommandEncoder();
  const canvasTexture = context.getCurrentTexture();
  const textureView = canvasTexture.createView();

  const renderPassDescriptor: GPURenderPassDescriptor = {
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

  // Copy the rendering results from the swapchain into |cubeTexture|.
  commandEncoder.copyTextureToTexture(
    {
      texture: textureLocations.currentFrameBuffer,
    },
    {
      texture: textureLocations.previousFrameBuffer,
    },
    [canvas.width, canvas.height]
  );

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
  tick++;
  let now = Date.now() * 0.001;
  const deltaTime = now - (frameTimes[0] || now);
  const fps = (1 / deltaTime) * frameTimes.length;
  frameTimes.push(now);
  if (frameTimes.length > 60) frameTimes.shift();

  document.getElementById("fpsMeter")!.textContent = `${fps.toFixed(2)} fps`;
  document.getElementById("iteration")!.textContent = `iteration: ${tick}`;
}

function throwExpression(errorMessage: string): never {
  throw new Error(errorMessage);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (!loop && device != null) {
    tickFPSMeter();
    render();
  }
}

function startStopLoop(e: KeyboardEvent) {
  if (e.key == " " || e.code == "Space") {
    loop = !loop;
  }
}

function nextFrame(e: KeyboardEvent) {
  if (e.key == "n" || e.code == "KeyN") {
    tickFPSMeter();
    render();
  }
}

function clearFrame(e: KeyboardEvent) {
  if (e.key == "c" || e.code == "KeyC") {
    tick=0;
    tickFPSMeter();
    render();
  }
}

function createBuffers(gpuDevice: GPUDevice) {
  return {
    resolutionBuffer: gpuDevice.createBuffer({
      size: 2 * F32_ALIGNMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    cameraPosBuffer: gpuDevice.createBuffer({
      size: 3 * F32_ALIGNMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    cameraLookAtBuffer: gpuDevice.createBuffer({
      size: 3 * F32_ALIGNMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    iterationBuffer: gpuDevice.createBuffer({
      size: F32_ALIGNMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),
    ...createGeometryBuffers(device),
  };
}

function createGeometryBuffers(gpuDevice: GPUDevice){
  const geometryBugger: Record<string, GPUBuffer> = {};

  geometryBugger.materials = gpuDevice.createBuffer({
    size: Object.keys(materials).length * materialInShaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  
  geometryBugger.spheres = gpuDevice.createBuffer({
    size: spheres.length * sphereInShaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  geometryBugger.sphereLights = gpuDevice.createBuffer({
    size: sphereLights.length * sphereInShaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  geometryBugger.triangles = gpuDevice.createBuffer({
    size: triangles.length * triangleInShaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  geometryBugger.triangleLights = gpuDevice.createBuffer({
    size: triangleLights.length * triangleInShaderSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });

  return geometryBugger;
}

function putGeometryIntoBuffers(gpuDevice: GPUDevice){
  gpuDevice.queue.writeBuffer(
    bufferLocations.materials,
    0,
    new Float32Array(Object.values(materials).flatMap(item=>item.toAlignedArray())),
  );
  gpuDevice.queue.writeBuffer(
    bufferLocations.spheres,
    0,
    new Float32Array(spheres.flatMap(item=>item.toAlignedArray())),
  );
  gpuDevice.queue.writeBuffer(
    bufferLocations.sphereLights,
    0,
    new Float32Array(sphereLights.flatMap(item=>item.toAlignedArray())),
  );
  gpuDevice.queue.writeBuffer(
    bufferLocations.triangles,
    0,
    new Float32Array(triangles.flatMap(item=>item.toAlignedArray())),
  );
  gpuDevice.queue.writeBuffer(
    bufferLocations.triangleLights,
    0,
    new Float32Array(triangleLights.flatMap(item=>item.toAlignedArray())),
  );
}
