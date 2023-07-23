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

async function init() {
  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();

  canvas = document.getElementById("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  context = canvas.getContext("webgpu");

  if (!context) {
    document.getElementById("errorLog").innerHTML += "<br/>no webgpu available";
    throw "no webgpu";
  }

  context.imageSmoothingEnabled = false;

  document.body.onkeydown = function (e) {
    if (e.key == " " || e.code == "Space") loop = !loop;
  };

  await initProgram();

  renderLoop();
  render();
}

async function initProgram() {
  document.getElementById("errorLog").innerHTML +=
    "Downloading vertex shader ... ";
  let vertexShaderText = await fetch("square.vert.wgsl")
    .then((response) => response.text())
    .catch(() => {
      throw "cannot load square.vert.wgsl";
    });
  document.getElementById("errorLog").innerHTML += "DONE<br/>";

  document.getElementById("errorLog").innerHTML +=
    "Downloading fragment shader ... ";
  let fragmentShaderText = await fetch("raytracing.frag.wgsl")
    .then((response) => response.text())
    .catch(() => {
      throw "cannot load raytracing.frag.wgsl";
    });
  document.getElementById("errorLog").innerHTML += "DONE<br/>";

  let stopwatch = Date.now();

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });

  pipeline = device.createRenderPipeline({
    layout: "auto",
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

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0), // @group(0)
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
    ],
  });

  document.getElementById("errorLog").innerHTML += "ALL DONE<br/>";

  console.log(`Time to compile: ${Date.now() - stopwatch} ms`);
}

function render() {
  tick += 0.5;

  device.queue.writeBuffer(
    resolutionBuffer,
    0,
    new Float32Array([canvas.width, canvas.height])
  );
  device.queue.writeBuffer(
    cameraPosBuffer,
    0,
    new Float32Array([camera.x(), camera.y(), camera.z()])
  );
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
  if (frameTimes.length > 60) frameTimes.shift();
  document.getElementById("fpsMeter").textContent = `${fps.toFixed(2)} fps`;
}
