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
let collectionView: GPUTextureView;
let camera = {
  x: () => 4 * Math.sin(tick / 100),
  y: () => 0.9,
  z: () => 4 * Math.cos(tick / 100),
};

const F32_SIZE = 4;

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

  // Create a sampler with linear filtering for smooth interpolation.
  const sampler = device.createSampler({});

  // Create buffers
  bufferLocations = createBuffers(device);

  textureLocations = {
    collectionBuffer: device.createTexture({
      size: [canvas.width, canvas.height],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      format: presentationFormat,
    }),
  };

  collectionView = textureLocations.collectionBuffer.createView();

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
        sampler: {},
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
        resource: collectionView,
      },
      {
        binding: 5,
        resource: sampler,
      },
    ],
  });

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
    new Float32Array([4 * Math.sin(0), 0.9, 4 * Math.cos(0)])
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
      texture: canvasTexture,
    },
    {
      texture: textureLocations.collectionBuffer,
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
      size: 2 * F32_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    cameraPosBuffer: gpuDevice.createBuffer({
      size: 3 * F32_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    cameraLookAtBuffer: gpuDevice.createBuffer({
      size: 3 * F32_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    iterationBuffer: gpuDevice.createBuffer({
      size: F32_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),
  };
}
