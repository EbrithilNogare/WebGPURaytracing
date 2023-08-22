struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragPosition: vec4<f32>,
}

@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> VertexOutput {
  var pos = array<vec2<f32>, 3>(
    vec2(-1.0, 1.0),
    vec2(-1.0, -3.0),
    vec2(3.0, 1.0)
  );

  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragPosition = .5 * (output.Position + vec4(1.0, 1.0, 1.0, 1.0));

  return output;
}
